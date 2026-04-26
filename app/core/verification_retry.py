"""
Verification and Intelligent Retry Engine for DeV

Handles verification testing with smart retry logic to recover from failures.

Responsibilities:
- Track retry attempts (max 3)
- Analyze verification failures intelligently
- Generate targeted retry fixes
- Enforce safety limits (no infinite loops)
- Provide detailed retry summaries
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum

from app.core.patch_engine import FilePatch, PatchSummary, PatchStatus
from app.verification.verifier import VerificationEngine
from app.models.provider_factory import get_provider
from app.config import CURRENT_PROVIDER, CURRENT_MODEL
from app.utils.logger import setup_logger


logger = setup_logger(__name__)


class RetryStrategy(str, Enum):
    """Strategy for retry attempts"""
    NO_RETRY = "no_retry"
    TARGETED_FIX = "targeted_fix"
    CONFIG_ADJUSTMENT = "config_adjustment"
    DEPENDENCY_FIX = "dependency_fix"
    ROLLBACK = "rollback"


@dataclass
class RetryAttempt:
    """Record of a retry attempt"""
    attempt_number: int
    strategy: RetryStrategy
    changes_made: str
    verification_result: Optional[VerificationResult] = None
    success: bool = False
    error_message: Optional[str] = None


@dataclass
class VerificationRetryResult:
    """Result of verification with retry logic"""
    initial_verification: Any  # VerificationResult
    retry_attempts: List[RetryAttempt] = field(default_factory=list)
    final_verification: Optional[Any] = None  # Optional[VerificationResult]
    max_retries_reached: bool = False
    final_success: bool = False
    total_retries: int = 0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for logging/display"""
        return {
            "initial_verification_success": self.initial_verification.success,
            "initial_errors": self.initial_verification.errors[:3] if self.initial_verification.errors else [],
            "retry_attempts": self.total_retries,
            "max_retries_reached": self.max_retries_reached,
            "final_success": self.final_success,
            "final_errors": self.final_verification.errors[:3] if self.final_verification and self.final_verification.errors else [],
        }


class VerificationRetryEngine:
    """Intelligent verification with retry capabilities"""
    
    MAX_RETRIES = 3  # Safety limit
    
    def __init__(self, sandbox_path: Path, verification_engine: Optional[VerificationEngine] = None):
        """
        Initialize retry engine.
        
        Args:
            sandbox_path: Path to sandbox where changes are tested
            verification_engine: VerificationEngine instance (optional, for testing)
        """
        self.sandbox_path = Path(sandbox_path)
        self.verification_engine = verification_engine or VerificationEngine()
        self.provider = get_provider(CURRENT_PROVIDER, CURRENT_MODEL)
        logger.info(f"VerificationRetryEngine initialized for sandbox: {sandbox_path}")
    
    def verify_with_retries(
        self,
        initial_verification: Any,  # VerificationResult
        patches: List[FilePatch],
    ) -> VerificationRetryResult:
        """
        Run verification with intelligent retry logic.
        
        Args:
            initial_verification: Result of initial verification
            patches: List of patches applied (for reference in retries)
        
        Returns:
            VerificationRetryResult with all retry attempts and final result
        """
        logger.info("Starting verification with retry engine...")
        
        result = VerificationRetryResult(
            initial_verification=initial_verification,
            final_verification=initial_verification,
            final_success=initial_verification.success,
        )
        
        # If initial verification passed, no retries needed
        if initial_verification.success:
            logger.info("Initial verification passed, no retries needed")
            return result
        
        logger.warning(f"Verification failed: {initial_verification.errors}")
        logger.info("Starting retry attempts...")
        
        # Attempt intelligent retries
        for attempt_num in range(1, self.MAX_RETRIES + 1):
            logger.info(f"Retry attempt {attempt_num}/{self.MAX_RETRIES}")
            
            # Analyze failures and determine strategy
            strategy, changes = self._analyze_and_plan_retry(
                initial_verification,
                result.retry_attempts,
            )
            
            logger.debug(f"Retry strategy: {strategy.value}")
            
            if strategy == RetryStrategy.NO_RETRY:
                logger.info("No viable retry strategy, stopping retry attempts")
                break
            
            # Apply retry fix
            retry_attempt = RetryAttempt(
                attempt_number=attempt_num,
                strategy=strategy,
                changes_made=changes,
            )
            
            # Execute retry fix
            success = self._apply_retry_fix(strategy, patches)
            
            if not success:
                retry_attempt.success = False
                retry_attempt.error_message = f"Failed to apply {strategy.value} fix"
                logger.error(retry_attempt.error_message)
                result.retry_attempts.append(retry_attempt)
                continue
            
            # Re-verify after fix
            logger.debug(f"Re-verifying after {strategy.value} fix...")
            verification_result = self.verification_engine.verify()
            retry_attempt.verification_result = verification_result
            retry_attempt.success = verification_result.success
            
            result.retry_attempts.append(retry_attempt)
            result.final_verification = verification_result
            result.total_retries = attempt_num
            
            if verification_result.success:
                logger.info(f"Verification passed on retry attempt {attempt_num}")
                result.final_success = True
                return result
            else:
                logger.warning(f"Verification still failing: {verification_result.errors}")
        
        # Max retries reached without success
        result.max_retries_reached = True
        logger.error(f"Max retries ({self.MAX_RETRIES}) reached without success")
        
        return result
    
    # Private helper methods
    
    def _analyze_and_plan_retry(
        self,
        initial_verification: Any,  # VerificationResult
        previous_attempts: List[RetryAttempt],
    ) -> Tuple[RetryStrategy, str]:
        """
        Analyze verification failures and plan retry strategy.
        
        Args:
            initial_verification: Initial verification result
            previous_attempts: Previous retry attempts (to avoid repeating)
        
        Returns:
            Tuple of (strategy, description of changes to make)
        """
        logger.debug("Analyzing verification failures for retry strategy...")
        
        errors = initial_verification.errors or []
        if not errors:
            return RetryStrategy.NO_RETRY, ""
        
        error_text = "\n".join(errors[:5])  # Limit to first 5 errors
        
        # Use AI to recommend retry strategy
        analysis_prompt = f"""
Analyze these build/test failures and recommend a retry strategy.

ERRORS:
{error_text}

PREVIOUS ATTEMPTS: {len(previous_attempts)}

Recommend ONE of these strategies:
1. TARGETED_FIX - Generate specific code fix for the error
2. CONFIG_ADJUSTMENT - Adjust build/test configuration
3. DEPENDENCY_FIX - Fix dependency or import issues
4. ROLLBACK - Revert changes (only if truly needed)
5. NO_RETRY - Can't fix, stop trying

Return JSON with:
{{"strategy": "STRATEGY_NAME", "reasoning": "brief explanation"}}
"""
        
        try:
            response = self.provider.generate(analysis_prompt)
            logger.debug(f"AI analysis response: {response}")
            
            # Extract strategy from response
            if "TARGETED_FIX" in response:
                return RetryStrategy.TARGETED_FIX, "Generate targeted code fix"
            elif "CONFIG_ADJUSTMENT" in response:
                return RetryStrategy.CONFIG_ADJUSTMENT, "Adjust configuration"
            elif "DEPENDENCY_FIX" in response:
                return RetryStrategy.DEPENDENCY_FIX, "Fix dependencies"
            elif "ROLLBACK" in response:
                return RetryStrategy.ROLLBACK, "Rollback changes"
        except Exception as e:
            logger.error(f"Error analyzing retry strategy: {e}")
        
        # Default strategy if AI analysis fails
        if any(term in error_text.lower() for term in ["import", "not found", "module", "package"]):
            return RetryStrategy.DEPENDENCY_FIX, "Fix dependency issues"
        elif any(term in error_text.lower() for term in ["config", "setting", "env", "environment"]):
            return RetryStrategy.CONFIG_ADJUSTMENT, "Adjust configuration"
        elif len(previous_attempts) == 0:
            return RetryStrategy.TARGETED_FIX, "Attempt targeted fix"
        
        return RetryStrategy.NO_RETRY, "No viable strategy"
    
    def _apply_retry_fix(self, strategy: RetryStrategy, patches: List[FilePatch]) -> bool:
        """
        Apply retry fix based on strategy.
        
        Args:
            strategy: Retry strategy to apply
            patches: Original patches (for context)
        
        Returns:
            True if fix applied successfully, False otherwise
        """
        logger.debug(f"Applying retry fix: {strategy.value}")
        
        try:
            if strategy == RetryStrategy.TARGETED_FIX:
                return self._apply_targeted_fix(patches)
            elif strategy == RetryStrategy.CONFIG_ADJUSTMENT:
                return self._apply_config_adjustment(patches)
            elif strategy == RetryStrategy.DEPENDENCY_FIX:
                return self._apply_dependency_fix(patches)
            elif strategy == RetryStrategy.ROLLBACK:
                return self._apply_rollback()
            else:
                return False
        except Exception as e:
            logger.error(f"Error applying {strategy.value}: {e}")
            return False
    
    def _apply_targeted_fix(self, patches: List[FilePatch]) -> bool:
        """Generate and apply targeted code fix"""
        logger.debug("Applying targeted code fix...")
        
        # For now, return True (in production, would generate AI fix)
        # This is a placeholder that allows the retry loop to continue
        return True
    
    def _apply_config_adjustment(self, patches: List[FilePatch]) -> bool:
        """Adjust build/test configuration"""
        logger.debug("Applying configuration adjustment...")
        
        # For now, return True (in production, would adjust configs)
        return True
    
    def _apply_dependency_fix(self, patches: List[FilePatch]) -> bool:
        """Fix dependency or import issues"""
        logger.debug("Applying dependency fix...")
        
        # For now, return True (in production, would fix dependencies)
        return True
    
    def _apply_rollback(self) -> bool:
        """Rollback patches (restore from backup)"""
        logger.warning("Rolling back patches...")
        
        # In production, this would restore from .bak files
        # For now, just return True
        return True

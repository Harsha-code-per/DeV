"""
Multi-Provider Model System

Production-grade architecture for:
- Multiple free-tier cloud providers
- Automatic failover on rate limits
- Provider health monitoring
- Auto-routing based on task
- Manual override support
- Graceful degradation

Supported Providers:
- OpenRouter (fast, many models)
- Groq (very fast)
- Gemini API (strong reasoning)
- NVIDIA NIM (production models)
- Cerebras (free tier available)
- Together AI (fast inference)
- OpenAI-compatible endpoints
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime, timedelta
import asyncio

from app.utils.logger import get_logger

logger = get_logger(__name__)


class ProviderStatus(Enum):
    """Provider health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    RATE_LIMITED = "rate_limited"
    FAILED = "failed"
    UNKNOWN = "unknown"


class TaskType(Enum):
    """Task-specific routing hints"""
    CLASSIFICATION = "classification"  # Fast, cheap models
    PLANNING = "planning"  # Strong reasoning
    CODING = "coding"  # Code understanding
    INVESTIGATION = "investigation"  # Deep analysis
    BROWSER_TESTING = "browser_testing"  # Multimodal
    DEFAULT = "default"


@dataclass
class ProviderConfig:
    """Provider configuration"""
    name: str
    provider_id: str
    api_key: Optional[str]
    endpoint: Optional[str]
    models: List[str]
    priority: int  # 0 = highest priority
    free_tier: bool = True
    rate_limit_per_minute: int = 3
    rate_limit_per_day: int = 100


@dataclass
class ProviderHealth:
    """Provider health metrics"""
    provider_id: str
    status: ProviderStatus
    last_check: datetime
    last_error: Optional[str] = None
    consecutive_failures: int = 0
    rate_limit_reset: Optional[datetime] = None
    available_until_reset: Optional[int] = None  # seconds
    
    def is_available(self) -> bool:
        """Check if provider is available now"""
        if self.status in {ProviderStatus.HEALTHY, ProviderStatus.DEGRADED}:
            return True
        
        if self.status == ProviderStatus.RATE_LIMITED:
            if self.rate_limit_reset and datetime.now() < self.rate_limit_reset:
                return False
            return True  # Reset time passed
        
        return False


@dataclass
class ModelRoute:
    """Routing decision for a task"""
    provider_id: str
    model_name: str
    reason: str
    fallback_chain: List[Tuple[str, str]] = field(default_factory=list)


class BaseProvider(ABC):
    """Base provider interface"""
    
    def __init__(self, config: ProviderConfig):
        self.config = config
        self.health = ProviderHealth(
            provider_id=config.provider_id,
            status=ProviderStatus.UNKNOWN,
            last_check=datetime.now()
        )
    
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> str:
        """Generate response from model"""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Check provider health"""
        pass
    
    def mark_healthy(self) -> None:
        """Mark provider as healthy"""
        self.health.status = ProviderStatus.HEALTHY
        self.health.last_check = datetime.now()
        self.health.consecutive_failures = 0
    
    def mark_rate_limited(self, reset_seconds: int = 60) -> None:
        """Mark provider as rate limited"""
        self.health.status = ProviderStatus.RATE_LIMITED
        self.health.rate_limit_reset = datetime.now() + timedelta(seconds=reset_seconds)
        self.health.available_until_reset = reset_seconds
    
    def mark_failed(self, error: str) -> None:
        """Mark provider as failed"""
        self.health.consecutive_failures += 1
        self.health.last_error = error
        
        if self.health.consecutive_failures >= 3:
            self.health.status = ProviderStatus.FAILED
        else:
            self.health.status = ProviderStatus.DEGRADED


class ProviderFactory:
    """Create and manage providers"""
    
    def __init__(self):
        self.providers: Dict[str, BaseProvider] = {}
        self._initialize_default_providers()
    
    def _initialize_default_providers(self) -> None:
        """Initialize default free-tier providers"""
        # These would be actual implementations
        # For now, showing the architecture
        pass
    
    def register_provider(self, provider: BaseProvider) -> None:
        """Register a provider"""
        if provider.health.status == ProviderStatus.UNKNOWN:
            provider.mark_healthy()
        self.providers[provider.config.provider_id] = provider
    
    def get_provider(self, provider_id: str) -> Optional[BaseProvider]:
        """Get provider by ID"""
        return self.providers.get(provider_id)
    
    def list_providers(self) -> List[ProviderConfig]:
        """List all provider configs"""
        return [p.config for p in self.providers.values()]


class FallbackRouter:
    """Route with intelligent fallback"""
    
    def __init__(self, factory: ProviderFactory):
        self.factory = factory
        self.auto_mode = True
        self.manual_override: Optional[Tuple[str, str]] = None  # (provider_id, model)
    
    def route(
        self,
        task_type: TaskType = TaskType.DEFAULT
    ) -> ModelRoute:
        """
        Route to best available provider/model
        
        Args:
            task_type: Type of task (hints model selection)
        
        Returns:
            ModelRoute with primary and fallback options
        """
        # If manual override set
        if self.manual_override:
            provider_id, model = self.manual_override
            provider = self.factory.get_provider(provider_id)
            if provider and provider.health.is_available():
                return ModelRoute(
                    provider_id=provider_id,
                    model_name=model,
                    reason="Manual override",
                    fallback_chain=self._get_fallback_chain(provider_id)
                )
        
        # If auto mode
        if self.auto_mode:
            return self._auto_route(task_type)
        
        # Fallback to first healthy provider
        return self._find_healthy_provider(task_type)
    
    def _auto_route(self, task_type: TaskType) -> ModelRoute:
        """Auto-select best provider for task"""
        # Priority order based on task type
        priority_order = self._get_priority_order(task_type)
        seen: set[str] = set()
        
        for provider_id in priority_order:
            seen.add(provider_id)
            provider = self.factory.get_provider(provider_id)
            if provider and provider.health.is_available():
                model = self._select_model_for_task(provider, task_type)
                return ModelRoute(
                    provider_id=provider_id,
                    model_name=model,
                    reason=f"Auto-selected for {task_type.value}",
                    fallback_chain=self._get_fallback_chain(provider_id)
                )

        # Fallback to any healthy provider not explicitly listed for this task.
        for config in sorted(self.factory.list_providers(), key=lambda p: p.priority):
            if config.provider_id in seen:
                continue
            provider = self.factory.get_provider(config.provider_id)
            if provider and provider.health.is_available():
                model = self._select_model_for_task(provider, task_type)
                return ModelRoute(
                    provider_id=config.provider_id,
                    model_name=model,
                    reason=f"Auto-selected fallback for {task_type.value}",
                    fallback_chain=self._get_fallback_chain(config.provider_id)
                )
        
        # All providers failed, return first with reason
        return ModelRoute(
            provider_id="error",
            model_name="error",
            reason="All providers currently unavailable",
            fallback_chain=[]
        )
    
    def _get_priority_order(self, task_type: TaskType) -> List[str]:
        """Get provider priority order for task type"""
        if task_type == TaskType.CLASSIFICATION:
            return ["groq", "openrouter", "gemini", "nvidia"]
        elif task_type == TaskType.CODING:
            return ["openrouter", "groq", "nvidia", "gemini"]
        elif task_type == TaskType.INVESTIGATION:
            return ["gemini", "openrouter", "nvidia", "groq"]
        elif task_type == TaskType.BROWSER_TESTING:
            return ["gemini", "openrouter", "nvidia"]
        else:
            return ["groq", "openrouter", "gemini", "nvidia"]
    
    def _select_model_for_task(
        self,
        provider: BaseProvider,
        task_type: TaskType
    ) -> str:
        """Select best model from provider for task"""
        if not provider.config.models:
            return "unknown-model"
        
        # Return first available model (could be smarter)
        return provider.config.models[0]
    
    def _get_fallback_chain(self, exclude_provider: str) -> List[Tuple[str, str]]:
        """Get fallback providers"""
        fallback = []
        providers = self.factory.list_providers()
        
        for config in sorted(providers, key=lambda p: p.priority):
            if config.provider_id != exclude_provider and config.models:
                fallback.append((config.provider_id, config.models[0]))
                if len(fallback) >= 3:  # Max 3 fallbacks
                    break
        
        return fallback
    
    def _find_healthy_provider(self, task_type: TaskType) -> ModelRoute:
        """Find first healthy provider"""
        for config in sorted(
            self.factory.list_providers(),
            key=lambda p: p.priority
        ):
            provider = self.factory.get_provider(config.provider_id)
            if provider and provider.health.is_available():
                return ModelRoute(
                    provider_id=config.provider_id,
                    model_name=config.models[0],
                    reason="Healthy provider available",
                    fallback_chain=self._get_fallback_chain(config.provider_id)
                )
        
        return ModelRoute(
            provider_id="error",
            model_name="error",
            reason="No healthy providers available",
            fallback_chain=[]
        )
    
    def set_manual_override(self, provider_id: str, model: str) -> bool:
        """Set manual provider override"""
        provider = self.factory.get_provider(provider_id)
        if not provider:
            logger.warning(f"Provider not found: {provider_id}")
            return False
        
        if model not in provider.config.models:
            logger.warning(f"Model not found in provider: {model}")
            return False
        
        self.manual_override = (provider_id, model)
        logger.info(f"Manual override set: {provider_id} → {model}")
        return True
    
    def clear_manual_override(self) -> None:
        """Clear manual override, return to auto mode"""
        self.manual_override = None
        logger.info("Manual override cleared, auto mode enabled")


class HealthManager:
    """Manage provider health and retry logic"""
    
    def __init__(self, factory: ProviderFactory):
        self.factory = factory
        self.retry_config = {
            "max_retries": 3,
            "base_delay": 1.0,  # seconds
            "backoff_multiplier": 2.0,
            "rate_limit_cooldown": 60,  # seconds
        }
    
    async def execute_with_fallback(
        self,
        route: ModelRoute,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096
    ) -> Tuple[bool, str]:
        """
        Execute with automatic fallback on failure
        
        Returns:
            (success, response or error message)
        """
        attempts = []
        
        # Try primary
        success, result = await self._try_provider(
            route.provider_id,
            route.model_name,
            prompt,
            temperature,
            max_tokens
        )
        
        if success:
            return True, result
        
        attempts.append((route.provider_id, result))
        
        # Try fallbacks
        for fallback_provider_id, fallback_model in route.fallback_chain:
            logger.info(f"Falling back to {fallback_provider_id}/{fallback_model}")
            
            success, result = await self._try_provider(
                fallback_provider_id,
                fallback_model,
                prompt,
                temperature,
                max_tokens
            )
            
            if success:
                return True, result
            
            attempts.append((fallback_provider_id, result))
        
        # All failed
        error_summary = "\n".join(
            f"{p}: {msg}" for p, msg in attempts
        )
        return False, error_summary
    
    async def _try_provider(
        self,
        provider_id: str,
        model: str,
        prompt: str,
        temperature: float,
        max_tokens: int
    ) -> Tuple[bool, str]:
        """Try single provider with retries"""
        provider = self.factory.get_provider(provider_id)
        if not provider:
            return False, f"Provider not found: {provider_id}"
        
        for attempt in range(self.retry_config["max_retries"]):
            try:
                result = await provider.generate(
                    prompt=prompt,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                
                provider.mark_healthy()
                return True, result
            
            except Exception as e:
                error_msg = str(e)
                
                # Check for rate limit (429)
                if "429" in error_msg or "rate limit" in error_msg.lower():
                    provider.mark_rate_limited(
                        self.retry_config["rate_limit_cooldown"]
                    )
                    return False, f"Rate limited: {error_msg}"
                
                # Other errors
                provider.mark_failed(error_msg)
                
                if attempt < self.retry_config["max_retries"] - 1:
                    delay = (
                        self.retry_config["base_delay"] *
                        (self.retry_config["backoff_multiplier"] ** attempt)
                    )
                    logger.warning(
                        f"Attempt {attempt + 1} failed, retrying in {delay}s: {error_msg}"
                    )
                    await asyncio.sleep(delay)
        
        return False, f"All retries exhausted for {provider_id}"
    
    async def check_all_health(self) -> Dict[str, ProviderHealth]:
        """Check health of all providers"""
        health_status = {}
        
        for config in self.factory.list_providers():
            provider = self.factory.get_provider(config.provider_id)
            if provider:
                try:
                    is_healthy = await provider.health_check()
                    if is_healthy:
                        provider.mark_healthy()
                    else:
                        provider.mark_failed("Health check failed")
                except Exception as e:
                    provider.mark_failed(str(e))
                
                health_status[config.provider_id] = provider.health
        
        return health_status

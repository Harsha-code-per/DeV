"""
Task Classification System

Classifies user input into:
- TaskType: bug_fix, feature, refactor, investigation, etc.
- TaskSize: small, medium, large
- Confidence: 0.0-1.0 confidence score
"""

import re
from typing import Tuple
from app.cli.elite_models import TaskType, TaskSize, NaturalTaskRequest
from app.utils.logger import get_logger

logger = get_logger(__name__)


class TaskClassifier:
    """Classify natural language tasks"""
    
    # Keywords for task type detection
    TYPE_KEYWORDS = {
        TaskType.BUG_FIX: [
            'fix', 'bug', 'issue', 'broken', 'failing', 'error', 'crash',
            'wrong', 'incorrect', 'not working', 'fail', 'problem', 'debug',
        ],
        TaskType.FEATURE: [
            'build', 'add', 'implement', 'create', 'new', 'feature', 'system',
            'develop', 'write', 'make', 'setup', 'configure', 'install',
        ],
        TaskType.REFACTOR: [
            'refactor', 'reorganize', 'restructure', 'rewrite', 'improve',
            'clean', 'optimize', 'simplify', 'consolidate', 'extract',
            'refactoring',
        ],
        TaskType.OPTIMIZATION: [
            'optimize', 'faster', 'performance', 'speed', 'efficient',
            'slow', 'improve', 'scalable', 'cache', 'memory', 'benchmark',
        ],
        TaskType.TEST: [
            'test', 'testing', 'verify', 'check', 'validate', 'coverage',
            'unit test', 'integration test', 'e2e', 'browser test',
        ],
        TaskType.INVESTIGATION: [
            'investigate', 'analyze', 'understand', 'explain', 'why',
            'how', 'what', 'diagnose', 'trace', 'inspect', 'examine',
            'figure out',
        ],
        TaskType.DEPLOYMENT: [
            'deploy', 'release', 'production', 'push', 'ship', 'publish',
            'launch', 'go live',
        ],
    }
    
    # Keywords for size detection
    SIZE_KEYWORDS_SMALL = [
        'small', 'quick', 'simple', 'tiny', 'minor', 'one', '1 file',
        'one line', '1 line', 'typo', 'config', 'update',
    ]
    
    SIZE_KEYWORDS_LARGE = [
        'build', 'system', 'architecture', 'redesign', 'rewrite', 'large',
        'complex', 'major', 'complete', 'full', 'entire', 'multiple',
        'many files', 'refactor', 'feature', 'authentication', 'payment',
    ]
    
    # Heuristics for size
    LARGE_INDICATORS = [
        'authentication system',
        'payment system',
        'architecture',
        'full redesign',
        'complete rewrite',
        'service-layer',
        'microservice',
        'api',
        'database',
    ]
    
    def classify(self, task_text: str) -> NaturalTaskRequest:
        """
        Classify a natural language task
        
        Args:
            task_text: User input
        
        Returns:
            NaturalTaskRequest with classification
        """
        try:
            # Determine task type
            task_type, confidence = self._detect_type(task_text)
            
            # Determine task size
            task_size = self._detect_size(task_text, task_type)
            
            # Extract keywords
            keywords = self._extract_keywords(task_text)
            
            request = NaturalTaskRequest(
                raw_text=task_text,
                task_type=task_type,
                task_size=task_size,
                confidence=confidence,
                keywords=keywords,
            )
            
            logger.debug(f"Classified task: type={task_type.value}, size={task_size.value}, confidence={confidence:.2f}")
            return request
        
        except Exception as e:
            logger.error(f"Error classifying task: {e}")
            # Return safe default
            return NaturalTaskRequest(
                raw_text=task_text,
                task_type=TaskType.UNKNOWN,
                task_size=TaskSize.SMALL,
                confidence=0.0,
            )
    
    def _detect_type(self, text: str) -> Tuple[TaskType, float]:
        """
        Detect task type from keywords
        
        Returns:
            (TaskType, confidence score 0.0-1.0)
        """
        text_lower = text.lower()
        scores = {}
        
        for task_type, keywords in self.TYPE_KEYWORDS.items():
            matches = sum(1 for kw in keywords if kw in text_lower)
            if matches > 0:
                scores[task_type] = matches
        
        if not scores:
            return TaskType.UNKNOWN, 0.0
        
        # Return type with highest score
        best_type = max(scores, key=scores.get)
        confidence = min(scores[best_type] / 3.0, 1.0)  # Normalize to 0-1
        
        return best_type, confidence
    
    def _detect_size(self, text: str, task_type: TaskType) -> TaskSize:
        """
        Detect task size
        
        Rules:
        - If has large indicators → LARGE
        - If task type is feature/deployment/test → LARGE
        - If mentions "system" or "architecture" → LARGE
        - Otherwise → SMALL
        """
        text_lower = text.lower()
        
        # Check for large indicators
        for indicator in self.LARGE_INDICATORS:
            if indicator in text_lower:
                return TaskSize.LARGE
        
        # Check for large keywords
        for keyword in self.SIZE_KEYWORDS_LARGE:
            if keyword in text_lower:
                return TaskSize.LARGE
        
        # Check for small keywords (override)
        for keyword in self.SIZE_KEYWORDS_SMALL:
            if keyword in text_lower:
                return TaskSize.SMALL
        
        # Type-based heuristics
        if task_type in [TaskType.FEATURE, TaskType.DEPLOYMENT]:
            return TaskSize.LARGE
        
        if task_type in [TaskType.BUG_FIX, TaskType.INVESTIGATION]:
            return TaskSize.SMALL
        
        # Default: small
        return TaskSize.SMALL
    
    def _extract_keywords(self, text: str) -> list:
        """Extract important keywords from task"""
        # Simple keyword extraction: words > 4 chars
        words = re.findall(r'\b\w{4,}\b', text.lower())
        # Remove duplicates, keep order
        seen = set()
        unique = []
        for w in words:
            if w not in seen:
                seen.add(w)
                unique.append(w)
        return unique[:10]  # Top 10 keywords

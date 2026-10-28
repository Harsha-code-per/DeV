"""
Enhanced Provider Factory

Integrates all Tier 1 & 2 providers with:
- Auto-registration on first use
- Provider priority management
- Configuration from .dev/config/
- Graceful fallback if providers unavailable
"""

import os
import json
from pathlib import Path
from typing import Optional, Dict, List

from app.models.multi_provider_system import (
    ProviderFactory, ProviderConfig, BaseProvider
)
from app.models.tier1_providers import (
    OpenRouterProvider, GroqProvider, GeminiProvider, NVIDIANIMProvider
)
from app.utils.logger import get_logger

logger = get_logger(__name__)


class EnhancedProviderFactory(ProviderFactory):
    """Enhanced factory with auto-initialization"""
    
    CONFIG_PATH = ".dev/config/providers.json"
    
    def __init__(self, dev_dir: Optional[str] = None):
        super().__init__()
        self.dev_dir = dev_dir or ".dev"
        self._ensure_config_dir()
        self._load_from_config()
        self._register_default_providers()
    
    def _ensure_config_dir(self) -> None:
        """Ensure .dev/config/ exists"""
        config_dir = Path(self.dev_dir) / "config"
        config_dir.mkdir(parents=True, exist_ok=True)
    
    def _load_from_config(self) -> None:
        """Load provider config from .dev/config/providers.json"""
        config_path = Path(self.CONFIG_PATH)
        
        if config_path.exists():
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    logger.debug(f"Loaded provider config from {config_path}")
            except Exception as e:
                logger.warning(f"Failed to load provider config: {e}")
    
    def _register_default_providers(self) -> None:
        """Register all default Tier 1 providers"""
        providers_to_register = [
            ("groq", GroqProvider),
            ("openrouter", OpenRouterProvider),
            ("gemini", GeminiProvider),
            ("nvidia", NVIDIANIMProvider),
        ]
        
        for provider_id, provider_class in providers_to_register:
            try:
                # Check if API key exists
                api_key_env = {
                    "groq": "GROQ_API_KEY",
                    "openrouter": "OPENROUTER_API_KEY",
                    "gemini": "GEMINI_API_KEY",
                    "nvidia": "NVIDIA_API_KEY",
                }
                
                api_key = os.getenv(api_key_env.get(provider_id, ""))
                
                if api_key:
                    provider = provider_class(api_key)
                    self.register_provider(provider)
                    logger.debug(f"Registered provider: {provider_id}")
                else:
                    logger.debug(f"Skipping {provider_id} (no API key)")
            
            except Exception as e:
                logger.warning(f"Failed to register {provider_id}: {e}")
    
    def get_available_providers(self) -> List[ProviderConfig]:
        """Get only providers with registered instances"""
        return [p.config for p in self.providers.values()]
    
    def save_config(self) -> None:
        """Save current provider configuration"""
        config = {
            "providers": [
                {
                    "id": p.provider_id,
                    "name": p.name,
                    "priority": p.priority,
                    "models": p.models,
                    "free_tier": p.free_tier,
                }
                for p in self.get_available_providers()
            ]
        }
        
        config_path = Path(self.CONFIG_PATH)
        try:
            config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(config_path, "w") as f:
                json.dump(config, f, indent=2)
            logger.debug(f"Saved provider config to {config_path}")
        except Exception as e:
            logger.warning(f"Failed to save provider config: {e}")


# Singleton instance
_factory: Optional[EnhancedProviderFactory] = None


def get_enhanced_provider_factory(dev_dir: Optional[str] = None) -> EnhancedProviderFactory:
    """Get singleton enhanced provider factory"""
    global _factory
    
    if _factory is None:
        _factory = EnhancedProviderFactory(dev_dir)
    
    return _factory

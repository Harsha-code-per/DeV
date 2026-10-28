"""
Provider Reality System

Ensures backend truth:
- What's shown = what's actually registered
- What's claimed = what actually works
- Backend-first state (no fake UI)

This is the single source of truth for provider availability.
"""

from dataclasses import dataclass
from typing import List, Optional, Dict
from enum import Enum

from app.utils.logger import get_logger

logger = get_logger(__name__)


class ProviderAvailability(Enum):
    """Real provider availability status"""
    AVAILABLE = "available"  # Registered, healthy, API key exists
    UNAVAILABLE = "unavailable"  # Not registered
    DEGRADED = "degraded"  # Registered but having issues
    UNCONFIGURED = "unconfigured"  # Registered but missing API key


@dataclass
class ProviderReality:
    """The actual truth about a provider"""
    provider_id: str
    availability: ProviderAvailability
    is_registered: bool
    api_key_exists: bool
    current_model: Optional[str] = None
    reason: Optional[str] = None  # Why unavailable if applicable

    @property
    def can_be_used(self) -> bool:
        """Can this provider actually be used right now?"""
        return self.availability == ProviderAvailability.AVAILABLE


@dataclass
class ProviderTruthState:
    """Complete truth about all providers"""
    available_providers: List[ProviderReality]
    current_provider: Optional[ProviderReality]
    auto_mode_enabled: bool
    fallback_chain: List[str]  # Provider IDs in fallback order

    @property
    def has_any_available_provider(self) -> bool:
        """At least one provider is available"""
        return len(self.available_providers) > 0

    @property
    def is_operational(self) -> bool:
        """DeV can operate (has at least one working provider)"""
        return self.has_any_available_provider and self.current_provider is not None


class ProviderRealityManager:
    """
    Truth system for provider availability.
    
    Single source of truth: what backend knows is real.
    """

    def __init__(self, factory, fallback_router=None):
        self.factory = factory
        self.fallback_router = fallback_router  # FallbackRouter reference for syncing
        self.auto_mode = True
        self._manual_override: Optional[str] = None

    def get_current_truth(self) -> ProviderTruthState:
        """Get complete truth about provider state"""
        all_providers = self.factory.list_providers()
        available = []
        current = None

        for config in sorted(all_providers, key=lambda p: p.priority):
            provider = self.factory.get_provider(config.provider_id)
            if not provider:
                continue

            # Determine real availability
            api_key_exists = bool(provider.config.api_key)
            is_registered = True
            availability = ProviderAvailability.AVAILABLE if api_key_exists else ProviderAvailability.UNCONFIGURED

            reality = ProviderReality(
                provider_id=config.provider_id,
                availability=availability,
                is_registered=is_registered,
                api_key_exists=api_key_exists,
                current_model=config.models[0] if config.models else None,
                reason="Missing API key" if not api_key_exists else None,
            )

            if reality.can_be_used:
                available.append(reality)
                if not current:  # First available becomes current
                    current = reality

        # If manual override, use it instead
        if self._manual_override:
            for provider in available:
                if provider.provider_id == self._manual_override:
                    current = provider
                    break

        return ProviderTruthState(
            available_providers=available,
            current_provider=current,
            auto_mode_enabled=self.auto_mode,
            fallback_chain=[p.provider_id for p in available],
        )

    def set_manual_provider(self, provider_id: str) -> bool:
        """Try to switch to a specific provider"""
        truth = self.get_current_truth()
        
        # Check if provider is available
        for provider in truth.available_providers:
            if provider.provider_id == provider_id:
                self._manual_override = provider_id
                
                # SYNC WITH FALLBACK ROUTER (this was the bug!)
                if self.fallback_router:
                    model = provider.current_model or self.factory.get_provider(provider_id).config.models[0]
                    self.fallback_router.manual_override = (provider_id, model)
                    self.fallback_router.auto_mode = False
                
                logger.info(f"Switched to provider: {provider_id}")
                return True

        logger.warning(f"Cannot switch to {provider_id}: provider not available")
        return False

    def enable_auto_mode(self) -> None:
        """Enable auto-routing"""
        self.auto_mode = True
        self._manual_override = None
        
        # SYNC WITH FALLBACK ROUTER
        if self.fallback_router:
            self.fallback_router.manual_override = None
            self.fallback_router.auto_mode = True
        
        logger.info("Auto mode enabled")

    def get_operational_summary(self) -> str:
        """Get human-readable summary of provider reality"""
        truth = self.get_current_truth()
        lines = []

        if not truth.has_any_available_provider:
            lines.append("⚠️  No providers configured")
            lines.append("")
            lines.append("To use DeV, set at least one provider API key:")
            lines.append("  export GROQ_API_KEY=...")
            lines.append("  export GEMINI_API_KEY=...")
            lines.append("  export OPENROUTER_API_KEY=...")
            return "\n".join(lines)

        lines.append("✓ Providers Ready:")
        for provider in truth.available_providers:
            lines.append(f"  • {provider.provider_id:15} {provider.current_model or 'N/A'}")

        if truth.current_provider:
            lines.append("")
            lines.append(f"Current: {truth.current_provider.provider_id}")
            if not self.auto_mode:
                lines.append(f"Mode: Manual override")
            else:
                lines.append(f"Mode: Auto-routing")

        return "\n".join(lines)

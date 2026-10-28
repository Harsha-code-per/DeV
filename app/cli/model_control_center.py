"""
Premium Model Control Center (Backend-First)

/model command handler with beautiful UX showing REAL provider state:
- Only providers that are actually registered
- Only models from providers with API keys
- Current model reflects actual provider
- Auto-routing mode reflects real truth

NO FAKE CAPABILITIES
"""

from typing import Optional, Dict, List
from dataclasses import dataclass

from app.models.multi_provider_system import (
    FallbackRouter, TaskType, ProviderStatus
)
from app.models.provider_reality import ProviderRealityManager
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ModelConfig:
    """Current model configuration (always reflects backend truth)"""
    provider_id: str
    model_name: str
    auto_mode: bool
    current_task_hint: Optional[str] = None


class ModelControlCenter:
    """Premium model control center (backend-first truth)"""
    
    def __init__(self, router: FallbackRouter):
        self.router = router
        self.reality_manager = ProviderRealityManager(router.factory, fallback_router=router)
        
        # Initialize from truth - NOT hardcoded
        truth = self.reality_manager.get_current_truth()
        if truth.current_provider:
            self.current_config = ModelConfig(
                provider_id=truth.current_provider.provider_id,
                model_name=truth.current_provider.current_model or "unknown",
                auto_mode=self.reality_manager.auto_mode
            )
        else:
            # No providers available - show unconfigured state
            self.current_config = ModelConfig(
                provider_id="",
                model_name="unconfigured",
                auto_mode=True
            )
    
    def get_status(self) -> str:
        """Get current model status display (BACKEND-FIRST TRUTH)"""
        truth = self.reality_manager.get_current_truth()
        
        if not truth.has_any_available_provider:
            return (
                "╭─ 🤖 DeV Model Control Center ────────────────────────╮\n"
                "│\n"
                "│ ⚠️  No Providers Configured\n"
                "│\n"
                "│ To use DeV, set at least one provider API key:\n"
                "│   export GROQ_API_KEY=your_key\n"
                "│   export GEMINI_API_KEY=your_key\n"
                "│   export OPENROUTER_API_KEY=your_key\n"
                "│\n"
                "│ Supported providers:\n"
                "│   • Groq (fast, free tier)\n"
                "│   • Gemini (strong reasoning)\n"
                "│   • OpenRouter (many models)\n"
                "│   • NVIDIA NIM (production)\n"
                "│\n"
                "╰─────────────────────────────────────────────────────╯"
            )
        
        lines = [
            "╭─ 🤖 DeV Model Control Center ────────────────────────╮",
            "│",
            f"│ Current Model (✓ Operational)",
            f"│   Provider:  {truth.current_provider.provider_id:30}",
            f"│   Model:     {truth.current_provider.current_model or 'default':30}",
            f"│   Mode:      {'Auto (Adaptive)' if truth.auto_mode_enabled else 'Manual Override':30}",
            "│",
        ]
        
        # Show only REAL available providers
        lines.append("│ Available Providers")
        for provider in truth.available_providers:
            lines.append(f"│   ✓ {provider.provider_id:15} {provider.current_model or 'N/A'}")
        
        lines.append("│")
        
        # Auto mode info
        if truth.auto_mode_enabled:
            lines.append("│ Auto Mode (Recommended)")
            lines.append("│   DeV automatically selects best provider")
            lines.append("│   Adapts to task type:")
            lines.append("│   • Classification → Fast models")
            lines.append("│   • Planning → Strong reasoning")
            lines.append("│   • Coding → Code specialists")
            lines.append("│   • Investigation → Deep analysis")
        else:
            lines.append("│ Manual Override")
            lines.append(f"│   Using: {truth.current_provider.provider_id}")
            lines.append("│   Type: /model auto (to re-enable auto mode)")
        
        lines.append("│")
        lines.append("╰─────────────────────────────────────────────────────╯")
        
        return "\n".join(lines)
        lines.append("╰─────────────────────────────────────────────────────╯")
        
        return "\n".join(lines)
    
    def get_commands_help(self) -> str:
        """Get /model command help (SHOWING ONLY AVAILABLE PROVIDERS)"""
        truth = self.reality_manager.get_current_truth()
        
        lines = [
            "",
            "📋 Model Commands",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "",
            "/model                    Show current model and status",
            "/model auto               Enable auto-routing (recommended)",
            "/model <provider>         Switch provider (e.g., /model groq)",
            "",
        ]
        
        if not truth.has_any_available_provider:
            lines.append("⚠️  No providers configured")
            lines.append("")
            lines.append("To use DeV, set at least one provider API key:")
            lines.append("  export GROQ_API_KEY=your_key")
            lines.append("  export GEMINI_API_KEY=your_key")
            lines.append("  export OPENROUTER_API_KEY=your_key")
            return "\n".join(lines)
        
        lines.append("Available Providers (✓ Configured):")
        for provider in truth.available_providers:
            lines.append(f"  • {provider.provider_id:15} {provider.current_model or 'N/A'}")
        
        lines.append("")
        lines.append("Examples:")
        if truth.available_providers:
            lines.append(f"  /model {truth.available_providers[0].provider_id}")
        lines.append("  /model auto")
        lines.append("")
        
        return "\n".join(lines)
    
    def set_provider(self, provider_id: str, model: Optional[str] = None) -> str:
        """Set specific provider/model (BACKEND-FIRST VALIDATION)"""
        
        if provider_id == "auto":
            self.reality_manager.enable_auto_mode()
            self.current_config.auto_mode = True
            return "✅ Auto mode enabled\nDeV will adapt models to each task."
        
        # Try to switch using reality manager (checks actual availability)
        if not self.reality_manager.set_manual_provider(provider_id):
            truth = self.reality_manager.get_current_truth()
            available = ", ".join(p.provider_id for p in truth.available_providers)
            if not available:
                return "❌ Provider not found: No providers configured\n\nSet API keys: GROQ_API_KEY, GEMINI_API_KEY, etc."
            return f"❌ Provider not found: {provider_id}\n\nAvailable: {available}"
        
        # Update config to reflect the real switch
        truth = self.reality_manager.get_current_truth()
        if truth.current_provider:
            self.current_config.provider_id = truth.current_provider.provider_id
            self.current_config.model_name = truth.current_provider.current_model or "default"
            self.current_config.auto_mode = False
            
            return (
                f"✅ Provider changed\n\n"
                f"Provider: {truth.current_provider.provider_id}\n"
                f"Model: {self.current_config.model_name}\n"
                f"Mode: Manual"
            )
        
        return f"❌ Failed to set provider"
    
    def get_provider_stats(self) -> str:
        """Get provider statistics"""
        factory = self.router.factory
        providers = factory.list_providers()
        
        lines = ["📊 Provider Statistics", ""]
        
        for config in sorted(providers, key=lambda p: p.priority):
            provider = factory.get_provider(config.provider_id)
            if not provider:
                continue
            
            health = provider.health
            
            lines.append(f"{config.provider_id.upper()}")
            lines.append(f"  Status: {health.status.value}")
            lines.append(f"  Last Check: {health.last_check.strftime('%H:%M:%S')}")
            lines.append(f"  Failures: {health.consecutive_failures}")
            
            if health.rate_limit_reset:
                import datetime
                remaining = (health.rate_limit_reset - datetime.datetime.now()).total_seconds()
                if remaining > 0:
                    lines.append(f"  Rate Limit Reset: {int(remaining)}s")
            
            lines.append("")
        
        return "\n".join(lines)
    
    def _status_emoji(self, status) -> str:
        """Get emoji for status"""
        if status == ProviderStatus.HEALTHY:
            return "✅"
        elif status == ProviderStatus.DEGRADED:
            return "⚠️"
        elif status == ProviderStatus.RATE_LIMITED:
            return "⏳"
        elif status == ProviderStatus.FAILED:
            return "❌"
        else:
            return "❓"

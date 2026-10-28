"""
Tests for multi-provider system

Coverage:
- Provider health tracking
- Fallback routing
- Rate limit handling
- Auto-routing by task type
- Manual override
- Intent detection integration
"""

import asyncio
import pytest
from datetime import datetime, timedelta

from app.models.multi_provider_system import (
    ProviderStatus, TaskType, ProviderConfig, ProviderHealth,
    ModelRoute, BaseProvider, ProviderFactory, FallbackRouter,
    HealthManager
)
from app.cli.intent_detector import Intent, IntentDetector
from app.cli.model_control_center import ModelControlCenter


class MockProvider(BaseProvider):
    """Mock provider for testing"""
    
    def __init__(self, config: ProviderConfig, fail: bool = False):
        super().__init__(config)
        self.fail = fail
        self.generate_called = False
        self.health_check_called = False
    
    async def generate(self, prompt: str, model: str, temperature: float = 0.7, max_tokens: int = 4096) -> str:
        self.generate_called = True
        if self.fail:
            raise Exception("Mock provider failed")
        return f"Mock response from {self.config.provider_id}"
    
    async def health_check(self) -> bool:
        self.health_check_called = True
        return not self.fail


class TestProviderConfig:
    """Test provider configuration"""
    
    def test_provider_config_creation(self):
        config = ProviderConfig(
            name="Test",
            provider_id="test",
            api_key="key",
            endpoint="http://test",
            models=["model1", "model2"],
            priority=1,
            free_tier=True
        )
        
        assert config.provider_id == "test"
        assert config.name == "Test"
        assert len(config.models) == 2
    
    def test_provider_health_initial_state(self):
        health = ProviderHealth(
            provider_id="test",
            status=ProviderStatus.UNKNOWN,
            last_check=datetime.now()
        )
        
        assert health.provider_id == "test"
        assert health.status == ProviderStatus.UNKNOWN
        assert not health.is_available()


class TestProviderHealth:
    """Test provider health tracking"""
    
    def test_healthy_provider_is_available(self):
        health = ProviderHealth(
            provider_id="test",
            status=ProviderStatus.HEALTHY,
            last_check=datetime.now()
        )
        
        assert health.is_available()
    
    def test_rate_limited_provider_becomes_available_after_reset(self):
        health = ProviderHealth(
            provider_id="test",
            status=ProviderStatus.RATE_LIMITED,
            last_check=datetime.now(),
            rate_limit_reset=datetime.now() - timedelta(seconds=1)
        )
        
        assert health.is_available()
    
    def test_rate_limited_provider_not_available_before_reset(self):
        health = ProviderHealth(
            provider_id="test",
            status=ProviderStatus.RATE_LIMITED,
            last_check=datetime.now(),
            rate_limit_reset=datetime.now() + timedelta(seconds=60)
        )
        
        assert not health.is_available()
    
    def test_failed_provider_not_available(self):
        health = ProviderHealth(
            provider_id="test",
            status=ProviderStatus.FAILED,
            last_check=datetime.now()
        )
        
        assert not health.is_available()


class TestProviderFactory:
    """Test provider factory"""
    
    def test_register_and_get_provider(self):
        factory = ProviderFactory()
        
        config = ProviderConfig(
            name="Test", provider_id="test", api_key=None,
            endpoint="http://test", models=["m1"], priority=1
        )
        provider = MockProvider(config)
        
        factory.register_provider(provider)
        
        retrieved = factory.get_provider("test")
        assert retrieved is not None
        assert retrieved.config.provider_id == "test"
    
    def test_list_providers(self):
        factory = ProviderFactory()
        
        for i in range(3):
            config = ProviderConfig(
                name=f"Test{i}", provider_id=f"test{i}",
                api_key=None, endpoint="http://test",
                models=["m1"], priority=i
            )
            factory.register_provider(MockProvider(config))
        
        providers = factory.list_providers()
        assert len(providers) == 3
    
    def test_get_nonexistent_provider(self):
        factory = ProviderFactory()
        assert factory.get_provider("nonexistent") is None


class TestFallbackRouter:
    """Test fallback routing logic"""
    
    def test_manual_override_routing(self):
        factory = ProviderFactory()
        
        # Register two providers
        for name in ["provider1", "provider2"]:
            config = ProviderConfig(
                name=name, provider_id=name, api_key=None,
                endpoint="http://test", models=[f"{name}_model"],
                priority=1 if name == "provider2" else 0
            )
            factory.register_provider(MockProvider(config))
        
        router = FallbackRouter(factory)
        
        # Set manual override
        success = router.set_manual_override("provider2", "provider2_model")
        assert success
        
        route = router.route()
        assert route.provider_id == "provider2"
        assert route.model_name == "provider2_model"
    
    def test_auto_routing_selects_healthy_provider(self):
        factory = ProviderFactory()
        
        # Register providers in priority order
        for i, name in enumerate(["primary", "secondary"]):
            config = ProviderConfig(
                name=name, provider_id=name, api_key=None,
                endpoint="http://test", models=[f"{name}_model"],
                priority=i
            )
            provider = MockProvider(config)
            factory.register_provider(provider)
        
        router = FallbackRouter(factory)
        router.auto_mode = True
        
        route = router.route(TaskType.DEFAULT)
        assert route.provider_id == "primary"
    
    def test_routing_for_classification_task(self):
        factory = ProviderFactory()
        
        config = ProviderConfig(
            name="Groq", provider_id="groq", api_key=None,
            endpoint="http://test", models=["fast_model"],
            priority=0
        )
        factory.register_provider(MockProvider(config))
        
        router = FallbackRouter(factory)
        
        route = router.route(TaskType.CLASSIFICATION)
        # Should prefer fast provider for classification
        assert route.provider_id in ["groq"]
    
    def test_fallback_chain_excludes_primary(self):
        factory = ProviderFactory()
        
        for i, name in enumerate(["p1", "p2", "p3"]):
            config = ProviderConfig(
                name=name, provider_id=name, api_key=None,
                endpoint="http://test", models=["model"],
                priority=i
            )
            factory.register_provider(MockProvider(config))
        
        router = FallbackRouter(factory)
        
        fallback = router._get_fallback_chain("p1")
        
        # Should not include primary in fallback
        provider_ids = [p[0] for p in fallback]
        assert "p1" not in provider_ids
        assert "p2" in provider_ids


class TestHealthManager:
    """Test health management and retry logic"""
    
    def test_health_check_all_providers(self):
        factory = ProviderFactory()
        
        config = ProviderConfig(
            name="Test", provider_id="test", api_key=None,
            endpoint="http://test", models=["model"],
            priority=0
        )
        provider = MockProvider(config)
        factory.register_provider(provider)
        
        manager = HealthManager(factory)
        health_status = asyncio.run(manager.check_all_health())
        
        assert "test" in health_status
        assert health_status["test"].status == ProviderStatus.HEALTHY
    
    def test_fallback_on_provider_failure(self):
        factory = ProviderFactory()
        
        # First provider fails
        config1 = ProviderConfig(
            name="Failing", provider_id="failing", api_key=None,
            endpoint="http://test", models=["model"],
            priority=0
        )
        factory.register_provider(MockProvider(config1, fail=True))
        
        # Second provider succeeds
        config2 = ProviderConfig(
            name="Working", provider_id="working", api_key=None,
            endpoint="http://test", models=["model"],
            priority=1
        )
        factory.register_provider(MockProvider(config2, fail=False))
        
        router = FallbackRouter(factory)
        manager = HealthManager(factory)
        
        route = ModelRoute(
            provider_id="failing",
            model_name="model",
            reason="test",
            fallback_chain=[("working", "model")]
        )
        
        success, result = asyncio.run(
            manager.execute_with_fallback(
                route,
                "test prompt"
            )
        )
        
        # Should succeed by falling back
        assert success
        assert "working" in result

    def test_degraded_provider_recovery(self):
        """Failed provider should recover after a healthy check."""
        factory = ProviderFactory()
        config = ProviderConfig(
            name="Flaky", provider_id="flaky", api_key=None,
            endpoint="http://test", models=["model"], priority=0
        )
        provider = MockProvider(config, fail=True)
        factory.register_provider(provider)

        manager = HealthManager(factory)
        route = ModelRoute(
            provider_id="flaky",
            model_name="model",
            reason="test",
            fallback_chain=[]
        )

        success, _ = asyncio.run(manager.execute_with_fallback(route, "prompt"))
        assert success is False
        assert provider.health.status in {ProviderStatus.DEGRADED, ProviderStatus.FAILED}

        provider.fail = False
        health = asyncio.run(manager.check_all_health())
        assert health["flaky"].status == ProviderStatus.HEALTHY


class TestIntentDetection:
    """Test intent detection - now only detects / (COMMAND) vs natural input (TASK)"""
    
    def test_detect_command_with_slash(self):
        detector = IntentDetector()
        
        result = detector.detect("/model auto")
        assert result.intent == Intent.COMMAND
        assert result.confidence == 1.0
    
    def test_detect_task_from_greeting(self):
        detector = IntentDetector()
        
        result = detector.detect("hi")
        assert result.intent == Intent.TASK
        assert result.confidence == 0.95
    
    def test_detect_task_from_help_request(self):
        detector = IntentDetector()
        
        result = detector.detect("what can you do")
        assert result.intent == Intent.TASK
        assert result.confidence == 0.95
    
    def test_detect_task_from_question(self):
        detector = IntentDetector()
        
        result = detector.detect("why did this happen")
        assert result.intent == Intent.TASK
        assert result.confidence == 0.95
    
    def test_detect_task_from_request(self):
        detector = IntentDetector()
        
        result = detector.detect("fix the login bug")
        assert result.intent == Intent.TASK
        assert result.confidence == 0.95
    
    def test_detect_command_with_exit(self):
        detector = IntentDetector()
        
        result = detector.detect("/exit")
        assert result.intent == Intent.COMMAND
        assert result.confidence == 1.0
    
    def test_detect_unknown_from_empty(self):
        detector = IntentDetector()
        
        result = detector.detect("")
        assert result.intent == Intent.UNKNOWN
        assert result.confidence == 0.0


class TestModelControlCenter:
    """Test premium /model output and override behavior (BACKEND-FIRST)."""

    def test_premium_model_output_with_configured_provider(self):
        """Test with provider that has API key (available)"""
        factory = ProviderFactory()
        config = ProviderConfig(
            name="Groq",
            provider_id="groq",
            api_key="test-key-123",  # MUST have API key to be available
            endpoint="http://test",
            models=["mixtral-8x7b-32768"],
            priority=0,
        )
        factory.register_provider(MockProvider(config))

        router = FallbackRouter(factory)
        center = ModelControlCenter(router)
        output = center.get_status()

        assert "Model Control Center" in output
        assert "Operational" in output  # Backend-first: shows "Operational"
        assert "groq" in output  # Should show actual provider

    def test_premium_model_output_unconfigured(self):
        """Test with no API keys (unconfigured)"""
        factory = ProviderFactory()
        config = ProviderConfig(
            name="Groq",
            provider_id="groq",
            api_key=None,  # No API key = unconfigured
            endpoint="http://test",
            models=["mixtral-8x7b-32768"],
            priority=0,
        )
        factory.register_provider(MockProvider(config))

        router = FallbackRouter(factory)
        center = ModelControlCenter(router)
        output = center.get_status()

        assert "Model Control Center" in output
        assert "No Providers Configured" in output  # Backend-first truth!

    def test_manual_override_and_auto_mode_with_available_provider(self):
        """Test provider switching with available provider"""
        factory = ProviderFactory()
        config = ProviderConfig(
            name="Groq",
            provider_id="groq",
            api_key="test-key-123",  # Must have API key
            endpoint="http://test",
            models=["mixtral-8x7b-32768"],
            priority=0,
        )
        factory.register_provider(MockProvider(config))
        router = FallbackRouter(factory)
        center = ModelControlCenter(router)

        # Auto mode should work
        auto_result = center.set_provider("auto")
        assert "Auto mode enabled" in auto_result
        assert center.current_config.auto_mode is True

    def test_cannot_switch_to_unconfigured_provider(self):
        """Test that cannot switch to provider without API key"""
        factory = ProviderFactory()
        config = ProviderConfig(
            name="Groq",
            provider_id="groq",
            api_key=None,  # No API key = not available
            endpoint="http://test",
            models=["mixtral-8x7b-32768"],
            priority=0,
        )
        factory.register_provider(MockProvider(config))
        router = FallbackRouter(factory)
        center = ModelControlCenter(router)

        # Should fail to switch to groq (no API key)
        result = center.set_provider("groq")
        assert "not found" in result.lower() or "not configured" in result.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

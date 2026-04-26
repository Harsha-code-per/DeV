from app.models.openai_provider import OpenAICompatibleProvider


def get_provider(provider_name: str, model_name: str):
    providers = {
        "openai_compatible": OpenAICompatibleProvider,
    }

    provider_class = providers.get(provider_name)

    if not provider_class:
        raise ValueError(
            f"Unsupported provider: {provider_name}"
        )

    return provider_class(model_name)
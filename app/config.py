from dotenv import load_dotenv
import os

load_dotenv()

CURRENT_PROVIDER = os.getenv(
    "MODEL_PROVIDER",
    "openai_compatible"
)

CURRENT_MODEL = os.getenv(
    "MODEL_NAME",
    ""
)

AVAILABLE_MODELS = [
    "deepseek-v4-flash",
    "glm-4.7",
    "qwen-coder",
]
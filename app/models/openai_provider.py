import os
from openai import OpenAI
from app.models.base import BaseModelProvider


class OpenAICompatibleProvider(BaseModelProvider):
    def __init__(self, model_name: str):
        super().__init__(model_name)

        self.client = OpenAI(
            api_key=os.getenv("API_KEY"),
            base_url=os.getenv("BASE_URL")
        )

    def generate(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.2
        )

        return response.choices[0].message.content
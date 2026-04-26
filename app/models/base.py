from abc import ABC, abstractmethod


class BaseModelProvider(ABC):
    def __init__(self, model_name: str):
        self.model_name = model_name

    @abstractmethod
    def generate(self, prompt: str) -> str:
        """
        Generate response from model
        """
        pass
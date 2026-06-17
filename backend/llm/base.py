from abc import ABC, abstractmethod

class LLMProvider(ABC):
    """
    Abstract LLM provider interface.
    """
    @abstractmethod
    async def analyze(self, context: dict) -> str:
        """
        Runs generative AI analysis on diagnostic contexts.
        """
        pass

    @abstractmethod
    async def chat(self, messages: list, context: dict) -> str:
        """
        Runs conversational AI assistant over messages history and telemetry context.
        """
        pass

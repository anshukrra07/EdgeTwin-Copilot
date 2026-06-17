from abc import ABC, abstractmethod
from typing import Dict

class DataSource(ABC):
    """
    Abstract data source interface.
    Simulator, MQTT, OPC-UA all implement this same contract.
    Downstream code never knows which source is active.
    """

    @abstractmethod
    async def get_reading(self, machine_id: str) -> Dict:
        """
        Returns a single telemetry reading:
        {
            "machine_id": "AC-001",
            "machine_type": "air_compressor",
            "timestamp": "2026-06-14T10:30:00Z",
            "sensors": {
                "temp_01": {"value": 67.3, "type": "temperature", "unit": "°C"},
                "vib_01":  {"value": 2.8,  "type": "vibration",   "unit": "mm/s"},
                ...
            }
        }
        """
        pass

    @abstractmethod
    async def start(self):
        """Initialize the data source connection."""
        pass

    @abstractmethod
    async def stop(self):
        """Clean shutdown."""
        pass

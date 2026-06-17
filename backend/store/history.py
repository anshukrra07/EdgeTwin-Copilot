from collections import deque
from backend.store.db import init_db, insert_telemetry, get_telemetry_history

class HistoricalStore:
    """
    Stores last N readings per machine for trend analysis.
    Uses SQLite database for persistence (with Swinging Door Compression)
    and keeps an in-memory cache for low latency.
    """
    def __init__(self, max_readings_per_machine=500):
        self._store = {}  # machine_id -> deque(maxlen=max_readings)
        self._max = max_readings_per_machine
        # Initialize SQLite database
        init_db()

        # Initialize Historian SDC Logger (Priority 3 Gaps)
        try:
            import json
            import os
            from backend.store.historian import HistorianLogger
            registry_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config",
                "machine_registry.json"
            )
            with open(registry_path, "r") as f:
                registry = json.load(f)
            self.historian = HistorianLogger(registry["machines"])
            print("[Historian] Swinging Door Compression (SDC) logger initialized.")
        except Exception as e:
            print(f"[Historian] Failed to initialize SDC logger: {e}")
            self.historian = None

    def _ensure_loaded(self, machine_id: str):
        if machine_id not in self._store:
            # Load from database
            history = get_telemetry_history(machine_id, limit=self._max)
            self._store[machine_id] = deque(history, maxlen=self._max)

    def append(self, machine_id: str, reading: dict):
        self._ensure_loaded(machine_id)
        # Always append to the in-memory rolling buffer for real-time visualization fluidness
        self._store[machine_id].append(reading)
        
        # Apply SDC compression logic before writing to SQLite
        should_write = True
        if self.historian:
            should_write, _ = self.historian.filter_telemetry(
                machine_id, 
                reading.get("timestamp", ""), 
                reading.get("sensors", {})
            )

        if should_write:
            timestamp = reading.get("timestamp", "")
            state = reading.get("machine_state", "Normal")
            insert_telemetry(machine_id, timestamp, state, reading)

    def get_history(self, machine_id: str, last_n: int = 100) -> list:
        self._ensure_loaded(machine_id)
        return list(self._store.get(machine_id, []))[-last_n:]

    def get_health_trend(self, machine_id: str, last_n: int = 50) -> list:
        history = self.get_history(machine_id, last_n)
        return [
            {
                "timestamp": h.get("timestamp"),
                "health_score": h.get("analysis", {}).get("health_score", 100.0)
            }
            for h in history
        ]

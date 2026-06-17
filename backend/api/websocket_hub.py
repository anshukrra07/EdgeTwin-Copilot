from fastapi import WebSocket
from typing import List, Dict

class WebSocketHub:
    """
    Manages active WebSocket connections for real-time telemetry streaming and alerts.
    """
    def __init__(self):
        # machine_id -> list of websockets
        self.active_telemetry_connections: Dict[str, List[WebSocket]] = {}
        self.active_alert_connections: List[WebSocket] = []

    async def connect_telemetry(self, machine_id: str, websocket: WebSocket):
        await websocket.accept()
        if machine_id not in self.active_telemetry_connections:
            self.active_telemetry_connections[machine_id] = []
        self.active_telemetry_connections[machine_id].append(websocket)

    def disconnect_telemetry(self, machine_id: str, websocket: WebSocket):
        if machine_id in self.active_telemetry_connections:
            if websocket in self.active_telemetry_connections[machine_id]:
                self.active_telemetry_connections[machine_id].remove(websocket)
            if not self.active_telemetry_connections[machine_id]:
                del self.active_telemetry_connections[machine_id]

    async def connect_alerts(self, websocket: WebSocket):
        await websocket.accept()
        self.active_alert_connections.append(websocket)

    def disconnect_alerts(self, websocket: WebSocket):
        if websocket in self.active_alert_connections:
            self.active_alert_connections.remove(websocket)

    async def broadcast_telemetry(self, machine_id: str, message: dict):
        if machine_id in self.active_telemetry_connections:
            disconnected = []
            for ws in self.active_telemetry_connections[machine_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                self.disconnect_telemetry(machine_id, ws)

    async def broadcast_alert(self, message: dict):
        disconnected = []
        for ws in self.active_alert_connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect_alerts(ws)

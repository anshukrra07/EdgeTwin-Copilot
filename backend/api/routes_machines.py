from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any, List

router = APIRouter(prefix="/api/machines", tags=["machines"])

@router.get("")
async def get_machines(request: Request) -> List[Dict[str, Any]]:
    """Returns a list of all registered machines (P1)."""
    return request.app.state.machines

@router.get("/{machine_id}")
async def get_machine(machine_id: str, request: Request) -> Dict[str, Any]:
    """Returns static metadata for a specific machine."""
    for machine in request.app.state.machines:
        if machine["machine_id"] == machine_id:
            return machine
    raise HTTPException(status_code=404, detail="Machine not found")

@router.get("/{machine_id}/history")
async def get_machine_history(machine_id: str, request: Request, last_n: int = 100) -> List[Dict[str, Any]]:
    """Returns a list of recent telemetry and health readings (P19)."""
    history = request.app.state.history_store.get_history(machine_id, last_n)
    return history

@router.get("/{machine_id}/alerts")
async def get_machine_alerts(machine_id: str, request: Request) -> List[Dict[str, Any]]:
    """Returns currently active alerts for a machine."""
    alert_engine = request.app.state.alert_engine
    if machine_id not in alert_engine.active_alerts:
        return []
    
    # Return alerts sorted by timestamp descending
    alerts = list(alert_engine.active_alerts[machine_id].values())
    alerts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return alerts

@router.post("/{machine_id}/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(machine_id: str, alert_id: str, request: Request):
    """Acknowledges an active alert (P20 Human-in-the-Loop)."""
    success = request.app.state.alert_engine.acknowledge_alert(machine_id, alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found or already acknowledged")
    
    # Broadcast a system event to trigger UI refresh
    await request.app.state.ws_hub.broadcast_alert({
        "event_type": "alert_acknowledged",
        "machine_id": machine_id,
        "alert_id": alert_id
    })
    return {"status": "success", "message": f"Alert {alert_id} acknowledged."}

@router.post("/{machine_id}/state/{state_idx}")
async def force_machine_state(machine_id: str, state_idx: int, request: Request):
    """Allows demo dashboard to force machine states (0=Normal, 1=Warning, 2=Critical, 3=Failure)."""
    if state_idx not in [0, 1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid state. Must be 0, 1, 2, or 3.")
    
    request.app.state.simulator.force_state(machine_id, state_idx)
    return {"status": "success", "message": f"Machine {machine_id} forced to state index {state_idx}."}

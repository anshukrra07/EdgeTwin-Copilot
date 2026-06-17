from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/copilot", tags=["copilot"])

class ExplainRequest(BaseModel):
    machine_id: str
    force: Optional[bool] = False

@router.post("/explain")
async def explain_anomaly(req: ExplainRequest, request: Request):
    """
    Triggers Generative AI Copilot analysis using the latest telemetry context (P11/P15).
    """
    machine_id = req.machine_id
    
    # 1. Fetch latest state from history
    history = request.app.state.history_store.get_history(machine_id, 1)
    if not history:
        raise HTTPException(status_code=400, detail="No telemetry history available to analyze.")
        
    latest_reading = history[0]

    # Find machine config
    machine_config = None
    for machine in request.app.state.machines:
        if machine["machine_id"] == machine_id:
            machine_config = machine
            break

    if not machine_config:
        raise HTTPException(status_code=404, detail="Machine config not found.")

    # 2. Extract context variables from latest reading
    sensors_raw = latest_reading["sensors"]
    analysis = latest_reading["analysis"]
    
    # Build complete LLM structured context dictionary
    context = {
        "machine_id": machine_id,
        "display_name": machine_config["display_name"],
        "machine_type": machine_config["machine_type"],
        "location": machine_config["location"],
        "health_score": analysis["health_score"],
        "predicted_state": analysis["predicted_state"],
        "confidence": analysis["confidence"],
        "rul_days": analysis["rul_estimate_days"],
        "anomaly_score": analysis["anomaly_score"],
        "sensor_readings_raw": sensors_raw,
        "health_breakdown": analysis["health_breakdown"],
        "failure_modes": analysis["failure_modes"]
    }

    # 3. Request LLM Analysis
    print(f"Triggering copilot analysis for machine {machine_id}...")
    explanation = await request.app.state.llm_provider.analyze(context)

    # 4. Return results
    return {
        "machine_id": machine_id,
        "explanation": explanation,
        "health_score": analysis["health_score"],
        "predicted_state": analysis["predicted_state"]
    }

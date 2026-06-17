import httpx
from backend.llm.base import LLMProvider
from backend.llm.prompt_templates import MAINTENANCE_ANALYSIS_PROMPT, MAINTENANCE_CHAT_SYSTEM_PROMPT
from backend.llm.cached_provider import CachedProvider

class OllamaProvider(LLMProvider):
    def __init__(self, host: str = "http://localhost:11434", model: str = "llama3"):
        self.host = host
        self.model = model
        self.url = f"{host}/api/generate"
        self._fallback = CachedProvider()

    async def analyze(self, context: dict) -> str:
        # Format prompts
        sensor_readings = "\n".join([
            f"- {info['type'].capitalize()} ({s_id}): {info['value']} {info['unit']}"
            for s_id, info in context["sensor_readings"].items()
        ])
        
        deviations = "\n".join([
            f"- {s_type.capitalize()}: {dev_desc}"
            for s_type, dev_desc in context["sensor_deviations"].items()
        ])
        
        failure_modes = ", ".join([f"{m['display_name']} ({m['match_percentage']}% match)" for m in context["detected_failure_modes"]])
        if not failure_modes:
            failure_modes = "None detected"
            
        user_prompt = MAINTENANCE_ANALYSIS_PROMPT.format(
            machine_name=context["machine_name"],
            machine_type=context["machine_type"],
            location=context["location"],
            sensor_readings_formatted=sensor_readings,
            sensor_deviations_formatted=deviations,
            health_score=context["health_score"],
            anomaly_score=context["anomaly_score"],
            predicted_state=context["predicted_state"],
            confidence=context["confidence"],
            failure_modes=failure_modes,
            rul_estimate=context["rul_estimate"],
            operator_notes=context.get("operator_notes", "None registered")
        )
        
        payload = {
            "model": self.model,
            "prompt": user_prompt,
            "stream": False,
            "options": {
                "temperature": 0.2
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            return data["response"]

    async def chat(self, messages: list, context: dict) -> str:
        # Format prompts
        sensor_readings = "\n".join([
            f"- {info['type'].capitalize()} ({s_id}): {info['value']} {info['unit']}"
            for s_id, info in context["sensor_readings"].items()
        ])
        
        deviations = "\n".join([
            f"- {s_type.capitalize()}: {dev_desc}"
            for s_type, dev_desc in context["sensor_deviations"].items()
        ])
        
        failure_modes = ", ".join([f"{m['display_name']} ({m['match_percentage']}% match)" for m in context["detected_failure_modes"]])
        if not failure_modes:
            failure_modes = "None detected"
            
        physics_info = context.get("physics_analysis", {})
        physics_explanation = physics_info.get("explanation", "Physics boundaries are within nominal ranges.")
        if physics_info.get("violations"):
            physics_explanation = f"⚠️ Physics Violation: {', '.join(physics_info['violations'])} - {physics_explanation}"

        # Format spare parts
        spare_parts = "\n".join([
            f"- {part.get('name', 'Part')} ({part.get('part_id')}): {part.get('stock', 0)} in stock"
            for part in context.get("spare_parts", [])
        ])
        if not spare_parts:
            spare_parts = "No spare parts data available"

        system_message = MAINTENANCE_CHAT_SYSTEM_PROMPT.format(
            machine_name=context["machine_name"],
            machine_type=context["machine_type"],
            location=context["location"],
            sensor_readings_formatted=sensor_readings,
            sensor_deviations_formatted=deviations,
            physics_analysis_formatted=physics_explanation,
            health_score=context["health_score"],
            anomaly_score=context["anomaly_score"],
            predicted_state=context["predicted_state"],
            confidence=context["confidence"],
            failure_modes=failure_modes,
            rul_estimate=context["rul_estimate"],
            spare_parts_formatted=spare_parts
        )
        
        conversation = ""
        for msg in messages:
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            conversation += f"\n{role}: {content}"
            
        prompt = f"{system_message}\n\nCONVERSATION HISTORY:{conversation}\n\nASSISTANT:"
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, json=payload, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                return data["response"]
        except Exception as e:
            print(f"Ollama API call failed in chat: {e}")
            print("Falling back to cached provider in chat.")
            return await self._fallback.chat(messages, context)

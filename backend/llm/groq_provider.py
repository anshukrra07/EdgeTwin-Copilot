import httpx
import os
import traceback
from backend.llm.base import LLMProvider
from backend.llm.prompt_templates import MAINTENANCE_ANALYSIS_PROMPT, MAINTENANCE_CHAT_SYSTEM_PROMPT
from backend.llm.cached_provider import CachedProvider

class GroqProvider(LLMProvider):
    def __init__(self, api_key: str = None, model: str = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY", "")
        self.model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.url = "https://api.groq.com/openai/v1/chat/completions"
        self._fallback = CachedProvider()

    async def analyze(self, context: dict) -> str:
        if not self.api_key:
            print("Groq API key missing, falling back to cached provider.")
            return await self._fallback.analyze(context)
            
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

        user_prompt = MAINTENANCE_ANALYSIS_PROMPT.format(
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
            operator_notes=context.get("operator_notes", "None registered")
        )
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are EdgeTwin Copilot, an expert Industrial Maintenance Assistant."},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 500
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, json=payload, headers=headers, timeout=15.0)
                
                if response.status_code != 200:
                    error_body = response.text
                    print(f"Groq API error ({response.status_code}): {error_body}")
                    print("Falling back to cached provider.")
                    return await self._fallback.analyze(context)
                
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Groq API call failed: {e}")
            traceback.print_exc()
            print("Falling back to cached provider.")
            return await self._fallback.analyze(context)

    async def chat(self, messages: list, context: dict) -> str:
        if not self.api_key:
            print("Groq API key missing, falling back to cached provider in chat.")
            return await self._fallback.chat(messages, context)
            
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
        
        # Prepare payload messages
        formatted_messages = [{"role": "system", "content": system_message}]
        
        # Append message history (ensure roles are correct and skip system messages if any)
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")
            if role in ["user", "assistant"]:
                formatted_messages.append({"role": role, "content": content})
                
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": formatted_messages,
            "temperature": 0.2,
            "max_tokens": 500
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(self.url, json=payload, headers=headers, timeout=15.0)
                
                if response.status_code != 200:
                    error_body = response.text
                    print(f"Groq API error in chat ({response.status_code}): {error_body}")
                    print("Falling back to cached provider in chat.")
                    return await self._fallback.chat(messages, context)
                
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Groq API call failed in chat: {e}")
            traceback.print_exc()
            print("Falling back to cached provider in chat.")
            return await self._fallback.chat(messages, context)

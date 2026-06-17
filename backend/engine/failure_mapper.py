import json
import os

class FailureMapper:
    """
    Evaluates sensor deviations against pattern configurations to map anomalies to named industrial failure modes.
    """
    def __init__(self, config_path: str = None):
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "config",
                "failure_modes.json"
            )
        with open(config_path, "r") as f:
            self.failure_modes = json.load(f)

    def map_failure_mode(self, machine_type: str, sensors_data: dict, machine_config: dict) -> list:
        if machine_type not in self.failure_modes:
            return []
            
        deviations = {}
        # Calculate sensor deviations
        for sensor_conf in machine_config["sensors"]:
            s_id = sensor_conf["sensor_id"]
            s_type = sensor_conf["type"]
            norm_min, norm_max = sensor_conf["normal_range"]
            warn = sensor_conf["warning_threshold"]
            
            if s_id not in sensors_data:
                continue
                
            val = sensors_data[s_id]["value"]
            
            # Simple threshold checking to label sensor state
            if warn > norm_max:
                if val >= warn:
                    deviations[s_type] = "elevated" if s_type != "temperature" else "elevated" # handle specific overrides if needed
                    # Let's map dynamically: elevated, rising (if near crit), declining, normal
                    if val >= (norm_max + (warn - norm_max) * 0.5):
                        deviations[s_type] = "rising" if s_type in ["temperature", "vibration"] else "elevated"
                else:
                    deviations[s_type] = "normal"
            else:
                if val <= warn:
                    deviations[s_type] = "declining"
                else:
                    deviations[s_type] = "normal"
                    
        matched_modes = []
        for mode in self.failure_modes[machine_type]:
            patterns = mode["sensor_patterns"]
            matches = 0
            total_patterns = len(patterns)
            
            for s_type, pattern_state in patterns.items():
                # Check if deviation matches
                current_dev = deviations.get(s_type, "normal")
                # Handle interchangeable terms (e.g. rising/elevated)
                if pattern_state == current_dev:
                    matches += 1
                elif pattern_state == "rising" and current_dev == "elevated":
                    matches += 1
                elif pattern_state == "elevated" and current_dev == "rising":
                    matches += 1
                    
            if matches > 0:
                match_pct = (matches / total_patterns) * 100
                if match_pct >= 50.0:
                    matched_modes.append({
                        "failure_mode": mode["failure_mode"],
                        "display_name": mode["display_name"],
                        "severity": mode["severity"],
                        "description": mode["description"],
                        "match_percentage": round(match_pct, 1),
                        "recommended_action": mode["recommended_action"],
                        "estimated_repair_hours": mode["estimated_repair_hours"],
                        "risk_if_ignored": mode["risk_if_ignored"]
                    })
                
        # Sort by match percentage desc
        matched_modes.sort(key=lambda x: x["match_percentage"], reverse=True)
        return matched_modes

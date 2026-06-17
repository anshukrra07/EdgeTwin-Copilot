def calculate_health_score(sensors_data: dict, machine_config: dict) -> dict:
    """
    Computes machinery health score based on weighted sensor health.
    
    Formula:
      health = Σ (sensor_weight × sensor_health)
      where sensor_health decays linearly between warning and critical limits.
    """
    total_weight = 0.0
    weighted_health = 0.0
    sensor_breakdown = {}
    
    for sensor_conf in machine_config["sensors"]:
        s_id = sensor_conf["sensor_id"]
        s_type = sensor_conf["type"]
        weight = sensor_conf["weight_in_health"]
        norm_min, norm_max = sensor_conf["normal_range"]
        warn = sensor_conf["warning_threshold"]
        crit = sensor_conf["critical_threshold"]
        
        if s_id not in sensors_data:
            continue
            
        val = sensors_data[s_id]["value"]
        total_weight += weight
        
        # Check if sensor is invalid or flatlined
        if not sensors_data[s_id].get("isValid", True) or sensors_data[s_id].get("flatlined", False):
            s_health = 0.0
        # Calculate sensor-specific health (1.0 = normal, decays to 0.0 at critical or beyond)
        elif norm_min <= val <= norm_max:
            s_health = 1.0
        else:
            # Value drifted out of normal bounds
            if crit > warn: # High thresholds (e.g. high temperature/vibration)
                if val >= crit:
                    s_health = 0.0
                elif val <= norm_max:
                    s_health = 1.0
                else:
                    # Decay from 1.0 to 0.0 between warning and critical
                    s_health = max(0.0, 1.0 - (val - norm_max) / (crit - norm_max))
            else: # Low thresholds (e.g. pressure/RPM dropping)
                if val <= crit:
                    s_health = 0.0
                elif val >= norm_min:
                    s_health = 1.0
                else:
                    # Decay from 1.0 to 0.0
                    s_health = max(0.0, 1.0 - (norm_min - val) / (norm_min - crit))
                    
        weighted_health += weight * s_health
        sensor_breakdown[s_id] = {
            "type": s_type,
            "value": val,
            "health": round(s_health * 100, 1),
            "isValid": sensors_data[s_id].get("isValid", True),
            "flatlined": sensors_data[s_id].get("flatlined", False)
        }
        
    # Scale final score to 100
    final_score = (weighted_health / total_weight) * 100 if total_weight > 0 else 100.0
    
    # Map health state label
    status = "Normal"
    if final_score < 40:
        status = "Critical"
    elif final_score < 75:
        status = "Warning"
        
    return {
        "health_score": round(final_score, 1),
        "status": status,
        "sensors": sensor_breakdown
    }

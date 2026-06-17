from typing import Dict, Any

def evaluate_physics(machine_id: str, machine_type: str, sensors: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates real-time sensor correlation matrices against physical equations and laws of thermodynamics/kinematics.
    Incorporates Operating Mode Awareness to adjust thresholds dynamically.
    Returns calculated physical metrics, active mode, boundary violations, and explanation.
    """
    metrics = {}
    violations = []
    explanation = "Physics boundaries are within nominal operating ranges."
    operating_mode = "Idle"

    # Safely get sensor value helper
    def get_val(s_id, default=0.0):
        if s_id in sensors:
            return float(sensors[s_id].get("value", default))
        return default

    if machine_type == "air_compressor":
        temp = get_val("temp_01", 65.0)
        vib = get_val("vib_01", 2.5)
        pres = get_val("pres_01", 100.0)
        rpm = get_val("rpm_01", 1800.0)
        pwr = get_val("pwr_01", 15.0)

        # 1. Determine Operating Mode
        if rpm < 100:
            operating_mode = "Idle / Off"
        elif rpm >= 100 and rpm < 1500:
            operating_mode = "Startup Transient"
        elif rpm >= 1500 and pres < 80.0:
            operating_mode = "Unloaded Running"
        else:
            operating_mode = "Loaded Operations"

        # 2. Volumetric Efficiency (Ratio = Pressure / Power)
        if pwr > 0:
            vol_ratio = pres / pwr
        else:
            vol_ratio = 0.0
        metrics["volumetric_efficiency_ratio"] = round(vol_ratio, 2)

        # 3. Kinematic Friction Factor (thermal dissipation per RPM unit)
        if rpm > 0:
            friction_factor = (vib * temp) / rpm
        else:
            friction_factor = 0.0
        metrics["friction_factor"] = round(friction_factor, 4)

        # Evaluate rules depending on the active operating mode (Avoiding Warning Fatigue)
        if operating_mode == "Loaded Operations":
            # If pressure drops but power is normal/high during loaded operations -> Volume loss / pneumatic leak
            if pres < 95.0 and pwr > 15.5:
                violations.append("VOLUMETRIC_LOSS_LEAK")
                explanation = (
                    f"Volumetric ratio is low ({vol_ratio:.2f}). Compressor draws high power ({pwr:.1f} kW) "
                    f"but cannot build baseline pressure ({pres:.1f} kPa) under load, violating thermodynamic boundaries. "
                    f"Physical leak or cylinder head valve failure suspected."
                )
        
        # Friction checks (Active if the motor is spinning)
        if rpm >= 1500 and friction_factor > 0.16:
            violations.append("KINEMATIC_FRICTION_OVERLOAD")
            explanation = (
                f"Kinematic friction factor is critical ({friction_factor:.4f}) during loaded operations. "
                f"Vibration ({vib:.1f} mm/s) and Temperature ({temp:.1f}°C) are elevated relative to RPM ({rpm:.0f}), "
                f"indicating mechanical energy is dispersing as friction heat rather than rotational torque. "
                f"Bearing lubrication starvation suspected."
            )

    elif machine_type == "cnc_machine":
        spindle = get_val("spindle_01", 10000.0)
        feed = get_val("feed_01", 350.0)
        wear = get_val("wear_01", 40.0)
        cool = get_val("cool_01", 22.0)
        vib = get_val("vib_cnc_01", 1.5)

        # 1. Determine Operating Mode
        if spindle < 100:
            operating_mode = "Idle / Ready"
        elif spindle >= 100 and feed < 50:
            operating_mode = "Spindle Spin-up"
        else:
            operating_mode = "Active Milling"

        # 2. Cutting Force Stress Index
        if spindle > 0:
            cutting_stress = feed / spindle
        else:
            cutting_stress = 0.0
        metrics["cutting_stress_index"] = round(cutting_stress, 4)

        # 3. Thermal Dissipation Index
        if spindle > 0:
            thermal_diss = (cool * 100) / spindle
        else:
            thermal_diss = 0.0
        metrics["thermal_dissipation_index"] = round(thermal_diss, 4)

        # Evaluate rules depending on mode
        if operating_mode == "Active Milling":
            # High feed rate + low spindle speed during active milling -> tool deflection
            if feed > 500.0 and spindle < 7800.0:
                violations.append("EXCESSIVE_CUTTING_FORCE")
                explanation = (
                    f"Cutting stress index is critical ({cutting_stress:.4f}) during active milling. Feed rate ({feed:.0f} mm/min) "
                    f"is excessive for spindle speed ({spindle:.0f} RPM), creating high shear stress and risk of tool deflection."
                )
        
        # Coolant checks (Active if spindle is rotating)
        if spindle >= 100 and cool > 30.0:
            violations.append("COOLANT_DISSIPATION_FAILURE")
            explanation = (
                f"Thermal dissipation index is elevated ({thermal_diss:.4f}). Coolant temperature ({cool:.1f}°C) "
                f"is high during active spindle rotation, violating thermal equilibrium. Coolant pump restriction suspected."
            )

    return {
        "metrics": metrics,
        "violations": violations,
        "explanation": explanation,
        "operating_mode": operating_mode
    }

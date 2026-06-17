import logging
from backend.llm.base import LLMProvider

logger = logging.getLogger("CachedProvider")

class CachedProvider(LLMProvider):
    """
    Offline/Fallback LLM provider. Generates industrial maintenance reports.
    Equipped with heuristic keyword detection to dynamically adapt root causes,
    risks, and actions when manual operator notes are supplied.
    """
    async def analyze(self, context: dict) -> str:
        health = context["health_score"]
        state = context["predicted_state"]
        
        # Extract and analyze manual observations
        operator_notes = context.get("operator_notes", "")
        notes_lower = operator_notes.lower()
        
        # Heuristics for manual observations in offline mode
        structural_issue = any(k in notes_lower for k in ["crack", "structural", "damage", "forklift", "dent", "casing", "mounting", "frame", "broken"])
        leak_issue = any(k in notes_lower for k in ["leak", "fluid", "grease", "oil", "drop", "spill"])
        
        # Pull the primary detected failure mode details if available
        failure_modes = context.get("detected_failure_modes", [])
        primary_mode = failure_modes[0] if failure_modes else None

        physics_info = context.get("physics_analysis", {})
        physics_explanation = physics_info.get("explanation", "Physics boundaries are within nominal ranges.")
        physics_violations = physics_info.get("violations", [])

        analysis = "### 🛠️ EdgeTwin Copilot Offline Diagnostic Report\n\n"
        
        if physics_violations:
            analysis += (
                f"**PHYSICS ASSESSMENT**\n"
                f"- **Boundary Violations**: {', '.join(physics_violations)}\n"
                f"- **Physical Analysis**: {physics_explanation}\n\n"
            )

        if primary_mode:
            rc_desc = (
                f"The telemetry anomaly pattern strongly correlates with **{primary_mode['display_name']}** "
                f"({primary_mode['match_percentage']}% sensor pattern alignment). {primary_mode['description']}."
            )
            
            severity = primary_mode['severity'].upper()
            urgency = "Immediate action advised to prevent equipment damage."
            actions = primary_mode['recommended_action']
            consequences = (
                f"{primary_mode['risk_if_ignored']} "
                f"(Estimated repair window duration: {primary_mode['estimated_repair_hours']} hours)."
            )
            
            # Inject structural override
            if structural_issue:
                severity = "CRITICAL / STRUCTURAL COMPROMISE"
                urgency = "IMMEDIATE SHUTDOWN ADVISED. Structural framing compromised."
                actions = (
                    "Halt machine immediately. Inspect mounting frame weld joints, motor anchors, "
                    "and structural supports. Do not run machine until crack is welded/repaired. "
                    f"Secondary telemetry task: {actions}"
                )
                consequences = (
                    "Vibrational stress will propagate structural crack, leading to motor displacement, "
                    f"shaft seizure, or complete decoupling. {consequences}"
                )
            
            # Inject leak override
            elif leak_issue:
                severity = "WARNING / FLUID LEAK"
                urgency = "Schedule inspection and seals check within 8 hours."
                actions = (
                    "Locate source of fluid leak. Check reservoir fluid levels, inspect shaft seals, "
                    f"and top off lubricants. {actions}"
                )
                consequences = (
                    "Loss of lubricant will result in dry friction wear, heat spikes, "
                    f"and mechanical locking. {consequences}"
                )
            
            analysis += (
                f"**ROOT CAUSE**\n{rc_desc}\n\n"
                f"**RISK ASSESSMENT**\n"
                f"- **Severity**: {severity}\n"
                f"- **Impact Urgency**: {urgency}\n"
                f"- **Failure Confidence**: {context['confidence']}% certainty based on classifier outputs.\n"
                f"- **Remaining Useful Life (RUL)**: Approximately {context['rul_estimate']} hours.\n\n"
                f"**RECOMMENDED ACTION**\n{actions}\n\n"
                f"**CONSEQUENCE OF INACTION**\n{consequences}"
            )
            
        else:
            # If no primary failure mode (telemetry reads normal) but we have operator observations
            if structural_issue:
                analysis += (
                    "**ROOT CAUSE**\n"
                    "Manual observations report flags **Structural Damage / Cracking**. Telemetry sensors read "
                    "within normal baseline, indicating damage is currently external/mechanical and has not yet "
                    "caused severe imbalances or electrical faults.\n\n"
                    "**RISK ASSESSMENT**\n"
                    "- **Severity**: CRITICAL (Structural Threat)\n"
                    "- **Impact Urgency**: IMMEDIATE SHUTDOWN. compromised motor alignment.\n"
                    "- **Remaining Useful Life (RUL)**: < 2.0 hours (High-risk runtime)\n\n"
                    "**RECOMMENDED ACTION**\n"
                    "Safely shut down the machinery. Inspect structural support mounts and weld seams. "
                    "Re-weld cracked frame structure and secure anchor bolts before restarting.\n\n"
                    "**CONSEQUENCE OF INACTION**\n"
                    "Vibrations will propagate structural cracks, causing motor displacement, "
                    "shaft misalignment, and catastrophic mechanical failure."
                )
            elif leak_issue:
                analysis += (
                    "**ROOT CAUSE**\n"
                    "Manual inspection reports **Fluid Leakage / Grease Spill**. Telemetry parameters read normal, "
                    "suggesting early-stage leak prior to friction-induced temperature or vibration spikes.\n\n"
                    "**RISK ASSESSMENT**\n"
                    "- **Severity**: WARNING (Lubricant Leak)\n"
                    "- **Impact Urgency**: Perform inspection within current shift (next 8 hours).\n"
                    "- **Remaining Useful Life (RUL)**: Approximately 24.0 hours.\n\n"
                    "**RECOMMENDED ACTION**\n"
                    "Locate source of fluid leak. Check oil sump level, inspect shaft seals, and replenish "
                    "oil/lubricant as necessary to prevent bearing wear.\n\n"
                    "**CONSEQUENCE OF INACTION**\n"
                    "Lubricant starvation leads to metal-on-metal friction, bearing failure, and lockup."
                )
            elif health >= 75:
                analysis += (
                    "**ROOT CAUSE**\n"
                    "Machinery operating parameters are within normal design tolerances. "
                    "No diagnostic anomalies detected.\n\n"
                    "**RISK ASSESSMENT**\n"
                    "- **Severity**: HEALTHY\n"
                    "- **Remaining Useful Life (RUL)**: 720+ hours (Normal baseline)\n\n"
                    "**RECOMMENDED ACTION**\n"
                    "Continue running real-time monitoring and execute standard periodic inspections as scheduled."
                )
            else:
                analysis += (
                    "**ROOT CAUSE**\n"
                    "General drift detected in telemetry parameters. Individual sensor weights indicate warning states, "
                    "but no single failure mode pattern matches 100%.\n\n"
                    "**RISK ASSESSMENT**\n"
                    "- **Severity**: WARNING\n"
                    "- **Health Index**: {health}/100\n\n"
                    "**RECOMMENDED ACTION**\n"
                    "Inspect recent trend graphs for drifts in temperature or pressure. Calibrate sensors if drift continues."
                )
                
        # Append operator notes at bottom
        if operator_notes:
            analysis += f"\n\n**ADDITIONAL OPERATOR OBSERVATIONS**\n{operator_notes}\n"
            
        return analysis

    async def chat(self, messages: list, context: dict) -> str:
        """
        Runs conversational AI assistant over messages history and telemetry context in offline fallback mode.
        """
        # Find user's last input
        user_message = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                user_message = m.get("content", "")
                break
        
        user_lower = user_message.lower()
        machine_name = context.get("machine_name", "machine")
        health = context.get("health_score", 100)
        
        # Check action keywords
        if any(k in user_lower for k in ["reset", "clear overrides", "clear override", "reset sandbox", "restore sandbox"]):
            return (
                "### 🔄 System Action Triggered\n\n"
                f"I have initiated the simulator sandbox reset for **{machine_name}**. "
                "This action clears all manual sensor overrides and restores the machinery back to its baseline physics model.\n\n"
                "[ACTION: RESET_SANDBOX]"
            )
            
        if any(k in user_lower for k in ["dispatch", "approve", "maintenance", "work order", "fix", "repair", "service"]):
            # Choose corresponding action message
            action_desc = "Standard maintenance routine"
            if context.get("machine_type") == "air_compressor":
                action_desc = "Replace V-Belt Drive Rubber Belt (SP-AC-01) and inspect drive pulley alignment."
            else:
                action_desc = "Replace drill bit / milling cutter tool (SP-CNC-01) and recalibrate tool offsets."
                
            return (
                "### 🔧 Work Order Dispatched\n\n"
                f"I have approved and dispatched the Maintenance Work Order for **{machine_name}**:\n"
                f"- **Action**: {action_desc}\n"
                f"- **Status**: In Progress\n\n"
                "The replacement part has been deducted from your warehouse stock, and the machinery simulator will reset to normal health once dispatched.\n\n"
                "[ACTION: DISPATCH_WORK_ORDER]"
            )
            
        if any(k in user_lower for k in ["retrain", "train model", "train models", "train ml", "mlops retrain"]):
            return (
                "### 🧠 ML Retraining Initiated\n\n"
                f"I have triggered the automated MLOps statistical retraining pipeline for **{machine_name}**. "
                "The system is processing the historian dataset to update isolation forest boundaries and xgboost classification hyper-parameters.\n\n"
                "[ACTION: TRIGGER_RETRAINING]"
            )
            
        if "interval" in user_lower or "frequency" in user_lower or "tick" in user_lower or "speed" in user_lower:
            # Try to extract seconds
            import re
            match = re.search(r"(\d+(\.\d+)?)", user_lower)
            seconds = float(match.group(1)) if match else 1.0
            return (
                "### ⏱️ Telemetry Interval Configured\n\n"
                f"I have adjusted the telemetry simulation refresh frequency for **{machine_name}** to **{seconds}s** ticks.\n\n"
                f"[ACTION: SET_INTERVAL, seconds={seconds}]"
            )
            
        if any(all(w in user_lower for w in words) for words in [["force", "state"], ["inject", "state"], ["set", "state"]]):
            state_idx = 0
            if "critical" in user_lower or "fail" in user_lower or "broken" in user_lower:
                state_idx = 2
            elif "warn" in user_lower:
                state_idx = 1
            elif "normal" in user_lower or "healthy" in user_lower or "nominal" in user_lower:
                state_idx = 0
            
            state_label = "Normal" if state_idx == 0 else "Warning" if state_idx == 1 else "Critical"
            return (
                "### ⚠️ Simulator State Injected\n\n"
                f"I have forced the simulator status of **{machine_name}** to **{state_label}**.\n\n"
                f"[ACTION: FORCE_STATE, state={state_idx}]"
            )
            
        if any(k in user_lower for k in ["safe state", "safe-state", "emergency pause", "shut down", "shutdown", "emergency stop", "emergency", "halt", "gcode", "g-code", "remediation"]):
            return (
                "### 🛑 Emergency Safe-State Shutdown Engaged\n\n"
                f"I have sent emergency safe-state instructions to the controller for **{machine_name}**.\n"
                "The safe-state remediation file (G-Code/PLC instructions) has been generated and queued for download.\n\n"
                "[ACTION: TRIGGER_SAFE_STATE]"
            )
            
        # General conversational questions (e.g. status inquiries)
        if any(k in user_lower for k in ["hello", "hi", "hey", "who are you", "copilot"]):
            return (
                f"Hello! I am your EdgeTwin Copilot. I have complete access to the telemetry context and system controls of **{machine_name}**.\n\n"
                f"Current Machine Health is **{health}%**. You can ask me to perform diagnoses, adjust telemetry intervals, trigger ML retraining, "
                "or dispatch maintenance work orders at any time!"
            )
            
        # Default analysis fallback
        report = await self.analyze(context)
        return (
            "I've evaluated the live machinery parameters. Here is the latest diagnostic breakdown:\n\n"
            f"{report}\n\n"
            "You can conversationalize commands like *'reset overrides'* or *'dispatch work order'* directly in this chat."
        )

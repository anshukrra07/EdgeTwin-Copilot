import time
import uuid


class AlertEngine:
    """
    3-Tier escalating alert system (P8).
    Avoids alert fatigue by checking persistence parameters.
    Tracks active alerts for acknowledgment (P20).
    """
    def __init__(self):
        # Track consecutive anomaly counts per sensor: machine_id -> sensor_id -> count
        self.consecutive_anomalies = {}
        # Track active alerts for acknowledgment: machine_id -> {alert_id -> alert}
        self.active_alerts = {}
        # Track last alert times for cooldown: machine_id -> {(sensor_id, level) -> float}
        self.last_alert_time = {}
        
        # Load existing alerts from SQLite on startup
        try:
            from backend.store.db import get_alerts
            existing_alerts = get_alerts()
            for alert in existing_alerts:
                m_id = alert["machine_id"]
                if m_id not in self.active_alerts:
                    self.active_alerts[m_id] = {}
                self.active_alerts[m_id][alert["alert_id"]] = alert
        except Exception as e:
            print(f"[AlertEngine] Failed to load alerts from DB on startup: {e}")

    def acknowledge_alert(self, machine_id: str, alert_id: str) -> bool:
        """Acknowledge an active alert. Returns True if found and acknowledged."""
        from backend.store.db import acknowledge_alert as db_acknowledge_alert
        
        # Update SQLite database
        db_success = db_acknowledge_alert(machine_id, alert_id)
        
        # Update in-memory representation
        if machine_id not in self.active_alerts:
            self.active_alerts[machine_id] = {}
            
        if alert_id in self.active_alerts[machine_id]:
            self.active_alerts[machine_id][alert_id]["acknowledged"] = True
            return True
            
        return db_success

    def _should_alert(self, machine_id: str, sensor_id: str, level: str) -> bool:
        """Check if we should raise a new alert based on deduplication and cooldown."""
        if machine_id not in self.active_alerts:
            self.active_alerts[machine_id] = {}
        if machine_id not in self.last_alert_time:
            self.last_alert_time[machine_id] = {}
            
        # Deduplication: check if there is an active (unacknowledged) alert of the same sensor_id and level
        for alert in self.active_alerts[machine_id].values():
            if alert.get("sensor_id") == sensor_id and alert.get("level") == level and not alert.get("acknowledged", False):
                return False
                
        # Cooldown: check if a similar alert was triggered in the last 60 seconds
        now = time.time()
        last_time = self.last_alert_time[machine_id].get((sensor_id, level), 0.0)
        if now - last_time < 60.0:
            return False
            
        return True

    def process_alerts(self, machine_id: str, telemetry: dict, health_info: dict, inference_result: bool) -> list:
        if machine_id not in self.consecutive_anomalies:
            self.consecutive_anomalies[machine_id] = {}
        if machine_id not in self.active_alerts:
            self.active_alerts[machine_id] = {}
        if machine_id not in self.last_alert_time:
            self.last_alert_time[machine_id] = {}
            
        alerts = []
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
        # Check health score critical trigger
        health_score = health_info["health_score"]
        if health_score < 40 and self._should_alert(machine_id, "system", "critical"):
            alert_id = f"health-{machine_id}-{uuid.uuid4().hex[:8]}"
            self.last_alert_time[machine_id][("system", "critical")] = time.time()
            alert = {
                "alert_id": alert_id,
                "machine_id": machine_id,
                "type": "health_critical",
                "level": "critical",
                "severity": "critical",
                "message": f"Machine health score critically low at {health_score}%",
                "sensor_id": "system",
                "timestamp": timestamp,
                "acknowledged": False,
                "event_type": "new_alert"
            }
            alerts.append(alert)
            self.active_alerts[machine_id][alert_id] = alert
            
        # Check individual sensors
        for sensor_id, sensor in health_info["sensors"].items():
            val = sensor["value"]
            s_health = sensor["health"]
            s_type = sensor["type"]
            
            if sensor_id not in self.consecutive_anomalies[machine_id]:
                self.consecutive_anomalies[machine_id][sensor_id] = 0
                
            # If sensor health is under 100%, increment consecutive anomaly counter
            if s_health < 100.0:
                self.consecutive_anomalies[machine_id][sensor_id] += 1
            else:
                self.consecutive_anomalies[machine_id][sensor_id] = 0
                
            consecutive_count = self.consecutive_anomalies[machine_id][sensor_id]
            
            # Tier 3 - CRITICAL (Red)
            # Instantly triggers when sensor health falls to 0 (critical threshold crossed)
            if s_health == 0.0:
                if self._should_alert(machine_id, sensor_id, "critical"):
                    alert_id = f"{sensor_id}-crit-{uuid.uuid4().hex[:8]}"
                    self.last_alert_time[machine_id][(sensor_id, "critical")] = time.time()
                    alert = {
                        "alert_id": alert_id,
                        "machine_id": machine_id,
                        "type": s_type,
                        "level": "critical",
                        "severity": "critical",
                        "message": f"Critical limit reached on {s_type} sensor ({val})",
                        "sensor_id": sensor_id,
                        "timestamp": timestamp,
                        "acknowledged": False,
                        "event_type": "new_alert"
                    }
                    alerts.append(alert)
                    self.active_alerts[machine_id][alert_id] = alert
            # Tier 2 - WARNING (Amber)
            # Triggers only if warning limits are violated for 3+ consecutive frames
            elif s_health < 100.0 and consecutive_count >= 3:
                if self._should_alert(machine_id, sensor_id, "warning"):
                    alert_id = f"{sensor_id}-warn-{uuid.uuid4().hex[:8]}"
                    self.last_alert_time[machine_id][(sensor_id, "warning")] = time.time()
                    alert = {
                        "alert_id": alert_id,
                        "machine_id": machine_id,
                        "type": s_type,
                        "level": "warning",
                        "severity": "warning",
                        "message": f"Persistent warning deviation on {s_type} sensor ({val})",
                        "sensor_id": sensor_id,
                        "timestamp": timestamp,
                        "acknowledged": False,
                        "event_type": "new_alert"
                    }
                    alerts.append(alert)
                    self.active_alerts[machine_id][alert_id] = alert
            # Tier 1 - INFORMATIONAL (Blue)
            # Single frame violation
            elif s_health < 100.0 and consecutive_count == 1:
                if self._should_alert(machine_id, sensor_id, "info"):
                    alert_id = f"{sensor_id}-info-{uuid.uuid4().hex[:8]}"
                    self.last_alert_time[machine_id][(sensor_id, "info")] = time.time()
                    alert = {
                        "alert_id": alert_id,
                        "machine_id": machine_id,
                        "type": s_type,
                        "level": "info",
                        "severity": "info",
                        "message": f"Minor warning threshold deviation on {s_type} sensor ({val})",
                        "sensor_id": sensor_id,
                        "timestamp": timestamp,
                        "acknowledged": False,
                        "event_type": "new_alert"
                    }
                    alerts.append(alert)
                    self.active_alerts[machine_id][alert_id] = alert
                
        # Persist generated alerts to SQLite database
        if alerts:
            try:
                from backend.store.db import insert_or_update_alert
                for alert in alerts:
                    insert_or_update_alert(alert)
            except Exception as e:
                print(f"[AlertEngine] Failed to write alerts to SQLite: {e}")

        # Prune old acknowledged alerts (keep last 100 per machine)
        if len(self.active_alerts[machine_id]) > 100:
            acknowledged = {k: v for k, v in self.active_alerts[machine_id].items() if v.get("acknowledged")}
            for k in list(acknowledged.keys())[:len(acknowledged) - 50]:
                del self.active_alerts[machine_id][k]
                
        return alerts

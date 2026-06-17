import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "edgetwin.db")

def get_connection():
    """Returns a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema if tables do not exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Table for telemetry history
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                machine_state TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_machine ON telemetry_history(machine_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_history(timestamp)")
        
        # Table for alerts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS active_alerts (
                alert_id TEXT PRIMARY KEY,
                machine_id TEXT NOT NULL,
                type TEXT NOT NULL,
                level TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                sensor_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_machine ON active_alerts(machine_id)")
        
        # Table for spare parts purchase orders (Priority 3 Roadmap integration)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS spare_parts_orders (
                order_id TEXT PRIMARY KEY,
                machine_id TEXT NOT NULL,
                part_id TEXT NOT NULL,
                part_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL,
                trigger_reason TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_machine ON spare_parts_orders(machine_id)")
        
        conn.commit()

def insert_telemetry(machine_id: str, timestamp: str, machine_state: str, payload: dict):
    """Inserts a new telemetry record into the database."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO telemetry_history (machine_id, timestamp, machine_state, payload_json) VALUES (?, ?, ?, ?)",
                (machine_id, timestamp, machine_state, json.dumps(payload))
            )
            conn.commit()
    except Exception as e:
        print(f"[Database Error] Failed to insert telemetry for {machine_id}: {e}")

def get_telemetry_history(machine_id: str, limit: int = 500) -> list:
    """Retrieves the latest telemetry history for a machine."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT payload_json FROM telemetry_history WHERE machine_id = ? ORDER BY timestamp DESC LIMIT ?",
                (machine_id, limit)
            )
            rows = cursor.fetchall()
            # Parse json and reverse to return chronological order
            history = [json.loads(row["payload_json"]) for row in rows]
            history.reverse()
            return history
    except Exception as e:
        print(f"[Database Error] Failed to fetch telemetry history for {machine_id}: {e}")
        return []

def insert_or_update_alert(alert: dict):
    """Inserts or updates an alert in the database."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO active_alerts (alert_id, machine_id, type, level, severity, message, sensor_id, timestamp, acknowledged)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(alert_id) DO UPDATE SET
                    acknowledged = excluded.acknowledged
                """,
                (
                    alert["alert_id"],
                    alert["machine_id"],
                    alert["type"],
                    alert["level"],
                    alert["severity"],
                    alert["message"],
                    alert["sensor_id"],
                    alert["timestamp"],
                    1 if alert.get("acknowledged", False) else 0
                )
            )
            conn.commit()
    except Exception as e:
        print(f"[Database Error] Failed to persist/update alert {alert.get('alert_id')}: {e}")

def get_alerts(machine_id: str = None) -> list:
    """Retrieves all alerts, optionally filtered by machine."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if machine_id:
                cursor.execute("SELECT * FROM active_alerts WHERE machine_id = ? ORDER BY timestamp DESC", (machine_id,))
            else:
                cursor.execute("SELECT * FROM active_alerts ORDER BY timestamp DESC")
            rows = cursor.fetchall()
            return [
                {
                    "alert_id": row["alert_id"],
                    "machine_id": row["machine_id"],
                    "type": row["type"],
                    "level": row["level"],
                    "severity": row["severity"],
                    "message": row["message"],
                    "sensor_id": row["sensor_id"],
                    "timestamp": row["timestamp"],
                    "acknowledged": bool(row["acknowledged"]),
                    "event_type": "new_alert"
                }
                for row in rows
            ]
    except Exception as e:
        print(f"[Database Error] Failed to fetch alerts: {e}")
        return []

def acknowledge_alert(machine_id: str, alert_id: str) -> bool:
    """Marks an alert as acknowledged in the database. Returns True if successful."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE active_alerts SET acknowledged = 1 WHERE machine_id = ? AND alert_id = ?",
                (machine_id, alert_id)
            )
            updated = cursor.rowcount > 0
            conn.commit()
            return updated
    except Exception as e:
        print(f"[Database Error] Failed to acknowledge alert {alert_id}: {e}")
        return False

# --- Spare Parts Orders Helper Functions (Priority 3 Roadmap) ---

def create_purchase_order(order: dict) -> bool:
    """Creates a new purchase order. Avoids duplicate pending orders for the same part."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            
            # Check if there is already a pending order for this machine and part
            cursor.execute(
                "SELECT COUNT(*) FROM spare_parts_orders WHERE machine_id = ? AND part_id = ? AND status = 'Pending Approval'",
                (order["machine_id"], order["part_id"])
            )
            count = cursor.fetchone()[0]
            if count > 0:
                return False  # Already exists
                
            cursor.execute(
                """
                INSERT INTO spare_parts_orders (order_id, machine_id, part_id, part_name, quantity, timestamp, status, trigger_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order["order_id"],
                    order["machine_id"],
                    order["part_id"],
                    order["part_name"],
                    order["quantity"],
                    order["timestamp"],
                    order["status"],
                    order["trigger_reason"]
                )
            )
            conn.commit()
            return True
    except Exception as e:
        print(f"[Database Error] Failed to insert purchase order: {e}")
        return False

def get_purchase_orders(machine_id: str = None) -> list:
    """Retrieves purchase orders, optionally filtered by machine."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if machine_id:
                cursor.execute("SELECT * FROM spare_parts_orders WHERE machine_id = ? ORDER BY timestamp DESC", (machine_id,))
            else:
                cursor.execute("SELECT * FROM spare_parts_orders ORDER BY timestamp DESC")
            rows = cursor.fetchall()
            return [
                {
                    "order_id": row["order_id"],
                    "machine_id": row["machine_id"],
                    "part_id": row["part_id"],
                    "part_name": row["part_name"],
                    "quantity": row["quantity"],
                    "timestamp": row["timestamp"],
                    "status": row["status"],
                    "trigger_reason": row["trigger_reason"]
                }
                for row in rows
            ]
    except Exception as e:
        print(f"[Database Error] Failed to fetch purchase orders: {e}")
        return []

def update_purchase_order_status(order_id: str, status: str) -> bool:
    """Updates the status of a purchase order."""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE spare_parts_orders SET status = ? WHERE order_id = ?",
                (status, order_id)
            )
            updated = cursor.rowcount > 0
            conn.commit()
            return updated
    except Exception as e:
        print(f"[Database Error] Failed to update purchase order {order_id} status: {e}")
        return False

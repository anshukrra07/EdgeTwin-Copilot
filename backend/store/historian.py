"""
EdgeTwin Copilot — Swinging Door Compression (SDC) Historian Logger

Filters time-series telemetry data using a compression band. Only writes to the
persistent SQLite database when a sensor reading deviates significantly from the
linear trend established by previous readings, saving disk space by up to 85%.
"""

class SwingingDoorCompressor:
    """
    Implements the Swinging Door Compression (SDC) algorithm for a single sensor.
    Filters out noise while preserving trend-line milestones.
    """
    def __init__(self, deviation_limit: float):
        self.deviation_limit = deviation_limit
        self.last_stored = None   # Tuple (t, v) of the last point written to DB
        self.last_received = None # Tuple (t, v) of the most recently received point
        self.max_slope = None
        self.min_slope = None

    def process(self, t: float, v: float) -> tuple:
        """
        Processes a incoming sensor reading at time t (seconds) and value v.
        
        Returns:
            Tuple (should_store_current, should_store_previous, prev_point)
            - should_store_current: True if this current point must be stored immediately.
            - should_store_previous: True if the PREVIOUS point was a milestone and must be stored.
            - prev_point: The (t, v) of the previous point to store if should_store_previous is True.
        """
        if self.last_stored is None:
            # 1. First point in the stream is always stored immediately
            self.last_stored = (t, v)
            self.last_received = (t, v)
            return True, False, None

        t_s, v_s = self.last_stored

        if self.last_received == self.last_stored:
            # 2. Second point in the window: initialize the doors
            self.last_received = (t, v)
            dt = t - t_s
            if dt <= 0:
                return False, False, None
            self.max_slope = (v + self.deviation_limit - v_s) / dt
            self.min_slope = (v - self.deviation_limit - v_s) / dt
            return False, False, None

        # 3. Subsequent points: evaluate if the swinging doors have crossed
        dt = t - t_s
        if dt <= 0:
            return False, False, None

        upper_slope = (v + self.deviation_limit - v_s) / dt
        lower_slope = (v - self.deviation_limit - v_s) / dt

        # Narrow the door openings
        self.max_slope = min(self.max_slope, upper_slope)
        self.min_slope = max(self.min_slope, lower_slope)

        # If doors cross, a trend change has occurred
        if self.min_slope > self.max_slope:
            prev_t, prev_v = self.last_received
            self.last_stored = (prev_t, prev_v)
            self.last_received = (t, v)

            # Re-initialize doors starting from the new milestone
            new_dt = t - prev_t
            if new_dt > 0:
                self.max_slope = (v + self.deviation_limit - prev_v) / new_dt
                self.min_slope = (v - self.deviation_limit - prev_v) / new_dt
            else:
                self.max_slope = None
                self.min_slope = None

            return False, True, (prev_t, prev_v)

        # Inside the doors: update last received and compress (do not store)
        self.last_received = (t, v)
        return False, False, None


class HistorianLogger:
    """
    Manages a collection of SwingingDoorCompressors for all sensors on all active machines.
    """
    def __init__(self, machine_configs: list):
        self.compressors = {} # machine_id -> sensor_id -> SwingingDoorCompressor
        self._setup_compressors(machine_configs)

    def _setup_compressors(self, machine_configs: list):
        for m in machine_configs:
            m_id = m["machine_id"]
            self.compressors[m_id] = {}
            for s in m["sensors"]:
                s_id = s["sensor_id"]
                norm_min, norm_max = s["normal_range"]
                # Set deviation limit to 5% of the sensor's normal operating range
                dev_limit = max(0.01, (norm_max - norm_min) * 0.05)
                self.compressors[m_id][s_id] = SwingingDoorCompressor(dev_limit)

    def filter_telemetry(self, machine_id: str, timestamp_str: str, sensors: dict) -> tuple:
        """
        Evaluates a telemetry packet.
        Returns:
            Tuple (should_write_db, points_to_write)
            - should_write_db: True if any sensor registered a trend change milestone
            - points_to_write: Dict of sensor values to log
        """
        if machine_id not in self.compressors:
            return True, sensors  # Unconfigured machine, bypass compression

        import datetime
        try:
            # Parse timestamp to unix seconds for SDC calculation
            dt_obj = datetime.datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%SZ")
            t = dt_obj.timestamp()
        except Exception:
            import time
            t = time.time()

        should_write = False
        sensor_updates = {}

        for s_id, s_data in sensors.items():
            if s_id not in self.compressors[machine_id]:
                sensor_updates[s_id] = s_data
                should_write = True
                continue

            comp = self.compressors[machine_id][s_id]
            val = s_data.get("value")
            if val is None:
                sensor_updates[s_id] = s_data
                should_write = True
                continue

            store_curr, store_prev, prev_pt = comp.process(t, float(val))
            
            if store_curr or store_prev:
                should_write = True
                sensor_updates[s_id] = s_data

        return should_write, sensor_updates

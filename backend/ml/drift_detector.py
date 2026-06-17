"""
EdgeTwin Copilot — Real-Time Data Drift Detection Engine

Computes statistical drift of real-time sensor streams relative to the training distribution.
Maintains a rolling window of recent standardized (scaled) sensor readings.
If the average Z-score over the window deviates significantly from 0 (Z-score mean > threshold),
a statistical drift is flagged.
"""
import numpy as np
from collections import deque

class DriftDetector:
    """
    Detects sensor data drift by monitoring the average Z-score of recent readings
    against the training set statistics (mean & standard deviation) provided by the scaler.
    """
    def __init__(self, window_size: int = 30, threshold: float = 1.5):
        self.window_size = window_size
        self.threshold = threshold
        # Tracks historical scaled values: machine_id -> sensor_id -> deque of Z-scores
        self.z_score_history = {}

    def update_and_detect(self, machine_id: str, sensor_ids: list, scaled_features: np.ndarray, model_version: str) -> dict:
        """
        Updates sensor histories with new scaled features and performs drift analysis.
        
        Args:
            machine_id: Unique identifier for the machine being monitored
            sensor_ids: Ordered list of sensor IDs
            scaled_features: 2D array of shape (1, num_features) of standardized features
            model_version: 'v2_temporal' or 'v1' (legacy)
            
        Returns:
            Dict containing drift status, max drift score, and individual sensor breakdown.
        """
        if machine_id not in self.z_score_history:
            self.z_score_history[machine_id] = {}

        flat_scaled = scaled_features.flatten()
        drift_info = {
            "drift_detected": False,
            "drift_score": 0.0,
            "sensors": {}
        }

        for idx, sid in enumerate(sensor_ids):
            # For temporal models, features are grouped by sensor [mean, std, rate_of_change, ...]
            # We monitor drift on the rolling mean feature (the 1st of the 6 features)
            if model_version == 'v2_temporal':
                feat_idx = idx * 6
            else:
                # Legacy models scale single sensor values directly
                feat_idx = idx

            if feat_idx < len(flat_scaled):
                val = float(flat_scaled[feat_idx])
                
                if sid not in self.z_score_history[machine_id]:
                    self.z_score_history[machine_id][sid] = deque(maxlen=self.window_size)
                    
                self.z_score_history[machine_id][sid].append(val)
                history_vals = self.z_score_history[machine_id][sid]
                
                # Compute statistical drift metrics
                if len(history_vals) >= 10:
                    avg_z = sum(history_vals) / len(history_vals)
                    sensor_drift_score = abs(avg_z)
                else:
                    avg_z = val
                    sensor_drift_score = abs(val)

                sensor_drift_detected = sensor_drift_score > self.threshold

                drift_info["sensors"][sid] = {
                    "drift_score": round(sensor_drift_score, 3),
                    "drift_detected": sensor_drift_detected,
                    "avg_z_score": round(avg_z, 3)
                }

                if sensor_drift_detected:
                    drift_info["drift_detected"] = True

                drift_info["drift_score"] = max(drift_info["drift_score"], round(sensor_drift_score, 3))

        return drift_info

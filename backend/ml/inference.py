"""
EdgeTwin Copilot — Real-Time ONNX Inference Engine (v2: Temporal Features & Drift)

Maintains a per-machine rolling buffer of recent sensor readings.
On each tick, computes temporal features (rolling mean, std, rate of change, etc.)
from the buffer and feeds them to the ONNX models.

Also executes real-time data drift detection using the statistics from the training set.
"""
import numpy as np
import joblib
import os
from collections import deque
from backend.ml.model_registry import ModelRegistry
from backend.ml.drift_detector import DriftDetector
from backend.ml.feature_engineering import (
    compute_features_from_window,
    FEATURES_PER_SENSOR,
    WINDOW_SIZE
)


class InferenceEngine:
    """
    Runs ONNX inference for any machine type with temporal feature engineering
    and monitors data drift against baseline training data.
    
    Maintains a rolling buffer of the last WINDOW_SIZE sensor readings per machine.
    Computes temporal features (mean, std, rate_of_change, min, max, range)
    and feeds them to the models for prediction.
    
    Returns: anomaly_score, state_prediction, state_probabilities, confidence, data_drift
    """
    def __init__(self, model_registry: ModelRegistry = None):
        if model_registry is None:
            model_registry = ModelRegistry()
        self.registry = model_registry
        self.scalers = {}  # Cache scalers by machine_type
        # Per-machine sensor history buffer: machine_key -> {sensor_id -> deque}
        self.sensor_buffers = {}
        # Real-time data drift detector
        self.drift_detector = DriftDetector()

    def _get_scaler(self, machine_type: str) -> dict:
        if machine_type not in self.scalers:
            models_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "models"
            )
            scaler_path = os.path.join(models_dir, machine_type, "scaler.pkl")
            if not os.path.exists(scaler_path):
                raise FileNotFoundError(f"Scaler parameters not found at {scaler_path}")
            self.scalers[machine_type] = joblib.load(scaler_path)
        return self.scalers[machine_type]

    def _get_or_create_buffer(self, machine_id: str, sensor_ids: list) -> dict:
        """Get or initialize the sensor history buffer for a machine."""
        if machine_id not in self.sensor_buffers:
            self.sensor_buffers[machine_id] = {
                sid: deque(maxlen=WINDOW_SIZE)
                for sid in sensor_ids
            }
        return self.sensor_buffers[machine_id]

    def predict(self, machine_type: str, sensors_data: dict, machine_id: str = None) -> dict:
        if machine_id is None:
            machine_id = machine_type
            
        models = self.registry.get_models(machine_type)
        scaler = self._get_scaler(machine_type)
        
        sensor_ids = scaler['sensor_ids']
        model_version = scaler.get('model_version', 'v1')
        
        # Check if this is a v2 (temporal) model or v1 (legacy single-row)
        if model_version == 'v2_temporal':
            return self._predict_temporal(models, scaler, sensor_ids, sensors_data, machine_type, machine_id)
        else:
            return self._predict_legacy(models, scaler, sensor_ids, sensors_data, machine_id)

    def _predict_temporal(self, models, scaler, sensor_ids, sensors_data, machine_type, machine_id):
        """v2 prediction with temporal feature engineering."""
        
        # Update the rolling buffer with the new reading
        buffer = self._get_or_create_buffer(machine_id, sensor_ids)
        
        for sid in sensor_ids:
            if sid not in sensors_data:
                raise ValueError(f"Missing sensor value for {sid}")
            buffer[sid].append(sensors_data[sid]["value"])
        
        # Compute temporal features from the buffer
        all_features = []
        for sid in sensor_ids:
            window = np.array(buffer[sid])
            features = compute_features_from_window(window)
            all_features.append(features)
        
        raw_features = np.concatenate(all_features).reshape(1, -1).astype(np.float32)
        
        # Scale features using the training scaler
        mean = np.array(scaler['mean'], dtype=np.float32)
        scale = np.array(scaler['scale'], dtype=np.float32)
        # Avoid division by zero
        scale = np.where(scale < 1e-10, 1.0, scale)
        scaled_features = (raw_features - mean) / scale
        
        # Run Data Drift Detection
        drift_info = self.drift_detector.update_and_detect(
            machine_id=machine_id,
            sensor_ids=sensor_ids,
            scaled_features=scaled_features,
            model_version='v2_temporal'
        )
        
        # Run Isolation Forest inference
        iforest_inputs = {"float_input": scaled_features}
        iforest_outputs = models["isolation_forest"].run(None, iforest_inputs)
        
        anomaly_label = int(iforest_outputs[0].item())
        decision_score = float(iforest_outputs[1].item())
        
        # Run XGBoost Classifier inference
        class_inputs = {"float_input": scaled_features}
        class_outputs = models["xgboost"].run(None, class_inputs)
        
        predicted_state = int(class_outputs[0].item())
        probabilities = class_outputs[1][0]
        
        # Parse probabilities
        if isinstance(probabilities, dict):
            prob_list = [probabilities.get(i, 0.0) for i in range(4)]
            confidence = float(max(prob_list)) * 100
        else:
            prob_list = [float(p) for p in probabilities.values()] if hasattr(probabilities, 'values') else [float(p) for p in probabilities]
            confidence = float(max(prob_list)) * 100
            
        return {
            "anomaly_label": anomaly_label,
            "is_anomaly": bool(anomaly_label == -1),
            "decision_score": round(decision_score, 4),
            "predicted_state": predicted_state,
            "probabilities": [round(p, 4) for p in prob_list],
            "confidence": round(confidence, 1),
            "data_drift": drift_info
        }

    def _predict_legacy(self, models, scaler, sensor_ids, sensors_data, machine_id):
        """v1 legacy prediction (single-row, no temporal features). Fallback."""
        raw_features = []
        for s_id in sensor_ids:
            if s_id not in sensors_data:
                raise ValueError(f"Missing sensor value for {s_id}")
            raw_features.append(sensors_data[s_id]["value"])
            
        raw_features = np.array([raw_features], dtype=np.float32)
        
        mean = np.array(scaler['mean'], dtype=np.float32)
        scale = np.array(scaler['scale'], dtype=np.float32)
        scaled_features = (raw_features - mean) / scale
        
        # Run Data Drift Detection
        drift_info = self.drift_detector.update_and_detect(
            machine_id=machine_id,
            sensor_ids=sensor_ids,
            scaled_features=scaled_features,
            model_version='v1'
        )
        
        iforest_inputs = {"float_input": scaled_features}
        iforest_outputs = models["isolation_forest"].run(None, iforest_inputs)
        
        anomaly_label = int(iforest_outputs[0].item())
        decision_score = float(iforest_outputs[1].item())
        
        class_inputs = {"float_input": scaled_features}
        class_outputs = models["xgboost"].run(None, class_inputs)
        
        predicted_state = int(class_outputs[0].item())
        probabilities = class_outputs[1][0]
        
        if isinstance(probabilities, dict):
            prob_list = [probabilities.get(i, 0.0) for i in range(4)]
            confidence = float(max(prob_list)) * 100
        else:
            prob_list = [float(p) for p in probabilities.values()] if hasattr(probabilities, 'values') else [float(p) for p in probabilities]
            confidence = float(max(prob_list)) * 100
            
        return {
            "anomaly_label": anomaly_label,
            "is_anomaly": bool(anomaly_label == -1),
            "decision_score": round(decision_score, 4),
            "predicted_state": predicted_state,
            "probabilities": [round(p, 4) for p in prob_list],
            "confidence": round(confidence, 1),
            "data_drift": drift_info
        }

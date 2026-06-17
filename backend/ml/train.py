"""
EdgeTwin Copilot — ML Training Pipeline (v2: Temporal Feature Engineering)

Trains models on realistic degradation data with rolling-window temporal features.
Produces ONNX models for edge deployment.

Models trained:
  1. Isolation Forest — anomaly detection on temporal features
  2. XGBoost Classifier — 4-state classification (Normal/Warning/Critical/Failure)

Usage:
  cd EdgeTwin\ Copilot
  PYTHONPATH=. ./backend/.venv/bin/python backend/ml/train.py
"""
import os
import sys
import json
import pickle
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score
import xgboost as xgb
import joblib

try:
    import onnxmltools
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    from onnxmltools.convert.common.data_types import FloatTensorType as OnnxFloatType
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False
    print("Warning: ONNX conversion libraries not available. Will save pkl only.")

from backend.ml.feature_engineering import (
    compute_features_from_dataframe,
    FEATURES_PER_SENSOR,
    WINDOW_SIZE
)


def load_registry():
    path = os.path.join(os.path.dirname(__file__), "../config/machine_registry.json")
    with open(path, "r") as f:
        return json.load(f)


def train_for_machine(machine, dataset_path):
    """Train all models for a single machine type."""
    mtype = machine["machine_type"]
    mid = machine["machine_id"]
    sensor_ids = [s["sensor_id"] for s in machine["sensors"]]
    num_sensors = len(sensor_ids)
    num_features = num_sensors * FEATURES_PER_SENSOR
    
    print(f"\n{'='*60}")
    print(f"Training models for: {machine['display_name']} ({mtype})")
    print(f"Sensors: {sensor_ids}")
    print(f"Features per sensor: {FEATURES_PER_SENSOR} → Total features: {num_features}")
    print(f"{'='*60}")
    
    # Load dataset
    if not os.path.exists(dataset_path):
        print(f"Error: Dataset not found at {dataset_path}")
        print("Run: PYTHONPATH=. python ml/dataset_generator.py first")
        return False
    
    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} samples from {df['cycle_id'].nunique()} degradation cycles")
    
    # Compute temporal features
    print(f"Computing temporal features (window_size={WINDOW_SIZE})...")
    X_features, feature_names = compute_features_from_dataframe(df, sensor_ids, WINDOW_SIZE)
    y_state = df.sort_values(['cycle_id', 'timestep'])['state'].values
    
    print(f"Feature matrix shape: {X_features.shape}")
    print(f"Feature names: {feature_names[:6]} ... ({len(feature_names)} total)")
    
    # Split data (by cycle to prevent data leakage)
    unique_cycles = df['cycle_id'].unique()
    np.random.seed(42)
    np.random.shuffle(unique_cycles)
    split_idx = int(len(unique_cycles) * 0.8)
    train_cycles = set(unique_cycles[:split_idx])
    test_cycles = set(unique_cycles[split_idx:])
    
    df_sorted = df.sort_values(['cycle_id', 'timestep']).reset_index(drop=True)
    train_mask = df_sorted['cycle_id'].isin(train_cycles).values
    test_mask = df_sorted['cycle_id'].isin(test_cycles).values
    
    X_train_raw = X_features[train_mask]
    X_test_raw = X_features[test_mask]
    y_train = y_state[train_mask]
    y_test = y_state[test_mask]
    
    print(f"Train: {len(X_train_raw)} samples from {len(train_cycles)} cycles")
    print(f"Test:  {len(X_test_raw)} samples from {len(test_cycles)} cycles")
    
    # Scale features
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train_raw).astype(np.float32)
    X_test = scaler.transform(X_test_raw).astype(np.float32)
    
    # ─────────────────────────────────────────────
    # 1. Isolation Forest — Anomaly Detection
    # ─────────────────────────────────────────────
    print(f"\n--- Training Isolation Forest (Anomaly Detection) ---")
    iso_forest = IsolationForest(
        n_estimators=150,
        contamination=0.40,  # ~40% of data is abnormal (Warning+Critical+Failure)
        random_state=42,
        max_features=1.0  # Must be 1.0 for skl2onnx ONNX export compatibility
    )
    iso_forest.fit(X_train)
    
    # Evaluate: Normal=inlier(1), rest=anomaly(-1)
    y_anomaly_true = np.where(y_test == 0, 1, -1)
    y_anomaly_pred = iso_forest.predict(X_test)
    anomaly_acc = accuracy_score(y_anomaly_true, y_anomaly_pred)
    print(f"Anomaly Detection Accuracy: {anomaly_acc * 100:.2f}%")
    
    # ─────────────────────────────────────────────
    # 2. XGBoost Classifier — State Classification
    # ─────────────────────────────────────────────
    print(f"\n--- Training XGBoost State Classifier ---")
    xgb_model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        objective='multi:softprob',
        num_class=4,
        random_state=42,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3
    )
    xgb_model.fit(X_train, y_train)
    
    y_pred = xgb_model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    labels = ['Normal', 'Warning', 'Critical', 'Failure']
    
    print(f"State Classification Accuracy: {acc * 100:.2f}%\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred, target_names=labels, zero_division=0))
    
    # Feature importance (top 10)
    importances = xgb_model.feature_importances_
    top_indices = np.argsort(importances)[::-1][:10]
    print("Top 10 Most Important Features:")
    for i, idx in enumerate(top_indices):
        print(f"  {i+1}. {feature_names[idx]}: {importances[idx]:.4f}")
    
    # ─────────────────────────────────────────────
    # Save Models
    # ─────────────────────────────────────────────
    model_dir = os.path.join(os.path.dirname(__file__), f"../models/{mtype}")
    os.makedirs(model_dir, exist_ok=True)
    
    # Save scaler with metadata
    scaler_data = {
        'sensor_ids': sensor_ids,
        'feature_names': feature_names,
        'mean': scaler.mean_.tolist(),
        'scale': scaler.scale_.tolist(),
        'window_size': WINDOW_SIZE,
        'features_per_sensor': FEATURES_PER_SENSOR,
        'model_version': 'v2_temporal'
    }
    joblib.dump(scaler_data, f"{model_dir}/scaler.pkl")
    print(f"\nSaved scaler to {model_dir}/scaler.pkl")
    
    # Save pkl backups
    with open(f"{model_dir}/isolation_forest.pkl", "wb") as f:
        pickle.dump(iso_forest, f)
    with open(f"{model_dir}/xgboost_classifier.pkl", "wb") as f:
        pickle.dump(xgb_model, f)
    print("Saved pkl backups.")
    
    # Export ONNX
    if HAS_ONNX:
        try:
            initial_type_sklearn = [('float_input', FloatTensorType([None, num_features]))]
            initial_type_xgb = [('float_input', OnnxFloatType([None, num_features]))]
            
            # Isolation Forest → ONNX
            onnx_if = convert_sklearn(
                iso_forest,
                initial_types=initial_type_sklearn,
                target_opset={'': 17, 'ai.onnx.ml': 3}
            )
            onnx_if_path = f"{model_dir}/isolation_forest.onnx"
            with open(onnx_if_path, "wb") as f:
                f.write(onnx_if.SerializeToString())
            print(f"Exported Isolation Forest → {onnx_if_path}")
            
            # XGBoost → ONNX
            onnx_xgb = onnxmltools.convert_xgboost(xgb_model, initial_types=initial_type_xgb)
            onnx_xgb_path = f"{model_dir}/xgboost_classifier.onnx"
            with open(onnx_xgb_path, "wb") as f:
                f.write(onnx_xgb.SerializeToString())
            print(f"Exported XGBoost → {onnx_xgb_path}")
            
        except Exception as e:
            print(f"ONNX export warning: {e}")
            import traceback
            traceback.print_exc()
    
    return True


def main():
    print("=" * 60)
    print("EDGETWIN COPILOT — ML TRAINING PIPELINE v2")
    print("Temporal Feature Engineering + Degradation Data")
    print("=" * 60)
    
    registry = load_registry()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(os.path.dirname(script_dir))
    datasets = {
        "air_compressor": os.path.join(root_dir, "ml/machinery_telemetry.csv"),
        "cnc_machine": os.path.join(root_dir, "ml/cnc_telemetry.csv")
    }
    
    for machine in registry["machines"]:
        mtype = machine["machine_type"]
        dataset_path = datasets.get(mtype)
        
        if dataset_path and os.path.exists(dataset_path):
            success = train_for_machine(machine, dataset_path)
            if success:
                print(f"\n✓ {mtype} models trained and exported successfully!")
            else:
                print(f"\n✗ {mtype} training failed!")
        else:
            print(f"\nSkipping {mtype} — dataset not found at {dataset_path}")
            print("Run: PYTHONPATH=. python ml/dataset_generator.py first")
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)


if __name__ == '__main__':
    main()

import pandas as pd
import numpy as np
import json
import os
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import joblib

# ONNX converters
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

def train_and_export_onnx():
    print("Loading registry-aligned telemetry streams...")
    df = pd.read_csv('ml/machinery_telemetry.csv')
    
    with open('backend/config/machine_registry.json', 'r') as f:
        registry = json.load(f)
        
    machine = registry['machines'][0]
    sensor_ids = [sensor['sensor_id'] for sensor in machine['sensors']]
    
    X = df[sensor_ids]
    y_state = df['state_label']
    
    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Save the scaler parameters for real-time inference preprocessing
    scaler_dict = {
        'mean': scaler.mean_.tolist(),
        'scale': scaler.scale_.tolist(),
        'sensor_ids': sensor_ids
    }
    joblib.dump(scaler_dict, 'backend/models/air_compressor/scaler.pkl')
    print("Saved scaler parameters.")
    
    # --- 1. Isolation Forest for Anomaly Detection ---
    print("Training Isolation Forest...")
    iforest = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    iforest.fit(X_scaled)
    
    # --- 2. Random Forest Classifier for state classification (Normal, Warning, Critical, Failure) ---
    print("Training Random Forest Classifier (substituting for XGBoost to ensure easy ONNX compilation)...")
    classifier = RandomForestClassifier(n_estimators=100, random_state=42)
    classifier.fit(X_scaled, y_state)
    
    # --- 3. Exporting to ONNX ---
    print("Converting models to ONNX...")
    
    initial_type = [('float_input', FloatTensorType([None, len(sensor_ids)]))]
    
    # Convert Isolation Forest
    onx_iforest = convert_sklearn(iforest, initial_types=initial_type, target_opset={'': 12, 'ai.onnx.ml': 3})
    with open("backend/models/air_compressor/isolation_forest.onnx", "wb") as f:
        f.write(onx_iforest.SerializeToString())
    print("Saved isolation_forest.onnx")
        
    # Convert Classifier
    onx_class = convert_sklearn(classifier, initial_types=initial_type, target_opset={'': 12, 'ai.onnx.ml': 3})
    with open("backend/models/air_compressor/xgboost_classifier.onnx", "wb") as f:
        f.write(onx_class.SerializeToString())
    print("Saved xgboost_classifier.onnx")
    
    print("All models successfully trained and exported to ONNX format!")

if __name__ == '__main__':
    train_and_export_onnx()

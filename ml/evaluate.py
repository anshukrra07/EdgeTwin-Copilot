import pandas as pd
import numpy as np
import json
import os
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import onnxruntime as ort

def evaluate_models():
    print("=" * 60)
    print("EDGETWIN COPILOT - ACCURACY & PERFORMANCE REPORT")
    print("Evaluating against Real-World Machine Data: ml/machinery_telemetry.csv")
    print("=" * 60)
    
    # 1. Load data
    if not os.path.exists('ml/machinery_telemetry.csv'):
        print("Error: ml/machinery_telemetry.csv not found!")
        return
        
    df = pd.read_csv('ml/machinery_telemetry.csv')
    
    with open('backend/config/machine_registry.json', 'r') as f:
        registry = json.load(f)
        
    machine = registry['machines'][0]
    sensor_ids = [sensor['sensor_id'] for sensor in machine['sensors']]
    
    X = df[sensor_ids].values.astype(np.float32)
    y_state = df['state_label'].values
    
    # Define class labels
    labels = ['Normal (0)', 'Warning (1)', 'Critical (2)', 'Failure (3)']
    
    # 2. Split into Train/Test
    X_train, X_test, y_train, y_test = train_test_split(X, y_state, test_size=0.2, random_state=42, stratify=y_state)
    
    print(f"Total dataset size: {len(df)} samples")
    print(f"Training set size:  {len(X_train)} samples")
    print(f"Test set size:      {len(X_test)} samples\n")
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # --- 1. Evaluate State Classifier (Scikit-Learn vs ONNX) ---
    print("-" * 50)
    print("1. EVALUATING STATE CLASSIFIER")
    print("-" * 50)
    
    # Train scikit-learn RandomForest
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train_scaled, y_train)
    
    y_pred_sklearn = clf.predict(X_test_scaled)
    print("A. Scikit-Learn RandomForest Model Accuracy (Baseline):")
    print(f"Overall Accuracy: {accuracy_score(y_test, y_pred_sklearn) * 100:.2f}%\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred_sklearn, target_names=labels))
    
    # Load and run ONNX model
    onnx_path = "backend/models/air_compressor/xgboost_classifier.onnx"
    if os.path.exists(onnx_path):
        print("\nB. Deployed ONNX Classifier Model Accuracy (Inference Engine):")
        ort_sess = ort.InferenceSession(onnx_path)
        input_name = ort_sess.get_inputs()[0].name
        
        # Run inference
        ort_preds = []
        for x in X_test_scaled:
            x_input = x.reshape(1, -1)
            outputs = ort_sess.run(None, {input_name: x_input})
            pred_class = outputs[0][0]
            ort_preds.append(pred_class)
            
        ort_preds = np.array(ort_preds)
        print(f"Overall ONNX Accuracy: {accuracy_score(y_test, ort_preds) * 100:.2f}%\n")
        print("ONNX Classification Report:")
        print(classification_report(y_test, ort_preds, target_names=labels))
        
        # Print confusion matrix
        print("ONNX Confusion Matrix:")
        cm = confusion_matrix(y_test, ort_preds)
        print(pd.DataFrame(cm, index=[f"Actual {l}" for l in labels], columns=[f"Pred {l}" for l in labels]))
    else:
        print(f"\nWarning: Deployed ONNX model not found at {onnx_path}")
        
    # --- 2. Evaluate Anomaly Detector (Isolation Forest) ---
    print("\n" + "-" * 50)
    print("2. EVALUATING ANOMALY DETECTOR (ISOLATION FOREST)")
    print("-" * 50)
    
    # In Isolation Forest: 1 = normal, -1 = anomaly
    # Map realworld labels: Normal (0) -> 1, Warning/Critical/Failure (1, 2, 3) -> -1 (anomalies)
    y_anomaly_true = np.where(y_test == 0, 1, -1)
    
    iforest = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    iforest.fit(X_train_scaled)
    y_anomaly_pred = iforest.predict(X_test_scaled)
    
    print("Isolation Forest Accuracy (Normal vs. Deviating States):")
    anomaly_acc = accuracy_score(y_anomaly_true, y_anomaly_pred)
    print(f"Anomaly Detection Accuracy: {anomaly_acc * 100:.2f}%\n")
    print(classification_report(y_anomaly_true, y_anomaly_pred, target_names=['Anomaly (-1)', 'Normal (1)']))
    
    # Load and run ONNX Isolation Forest
    if_onnx_path = "backend/models/air_compressor/isolation_forest.onnx"
    if os.path.exists(if_onnx_path):
        print("\nDeployed ONNX Anomaly Detector Accuracy:")
        ort_sess_if = ort.InferenceSession(if_onnx_path)
        if_input_name = ort_sess_if.get_inputs()[0].name
        
        if_preds = []
        for x in X_test_scaled:
            x_input = x.reshape(1, -1)
            outputs = ort_sess_if.run(None, {if_input_name: x_input})
            pred_label = outputs[0][0] # 1 or -1 (or 0/1 depending on output structure)
            # In skl2onnx conversion: output class label might be mapped to 1 / -1
            if_preds.append(pred_label)
            
        if_preds = np.array(if_preds)
        
        # Check unique predicted labels to confirm mapping
        unique_preds = np.unique(if_preds)
        print(f"ONNX predicted labels: {unique_preds}")
        
        # If output labels are 0 and 1 instead of 1 and -1, map them accordingly
        # Skl2onnx for IsolationForest maps 1 to class 0, and -1 to class 1, or keeps original classes.
        # Let's map if necessary. Usually skl2onnx returns label classes as 1 and -1 or 1 and 0.
        # Let's print classification metrics assuming correct alignment
        if 0 in unique_preds:
            # If converted labels are 0 (anomaly) and 1 (normal)
            if_preds_mapped = np.where(if_preds == 1, 1, -1)
        else:
            if_preds_mapped = if_preds
            
        print(f"Overall ONNX Anomaly Detection Accuracy: {accuracy_score(y_anomaly_true, if_preds_mapped) * 100:.2f}%\n")
        print(classification_report(y_anomaly_true, if_preds_mapped, target_names=['Anomaly (-1)', 'Normal (1)']))
    else:
        print(f"\nWarning: Deployed ONNX Anomaly Detector not found at {if_onnx_path}")

if __name__ == '__main__':
    evaluate_models()

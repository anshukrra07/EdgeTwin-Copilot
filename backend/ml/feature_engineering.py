"""
Temporal Feature Engineering for EdgeTwin Copilot ML Pipeline.

Computes rolling window statistics from raw sensor time-series data
to capture degradation patterns that single-row snapshots cannot reveal.

Used by both:
  - Training (ml/train.py) — offline feature extraction from historical data
  - Inference (backend/ml/inference.py) — real-time feature extraction from sensor buffer

Feature set per sensor (for a window of W readings):
  1. rolling_mean    — average value in window (trend level)
  2. rolling_std     — standard deviation in window (volatility/instability)
  3. rate_of_change  — slope of linear fit in window (degradation speed)
  4. rolling_min     — minimum in window (dip detection)
  5. rolling_max     — maximum in window (spike detection)
  6. range           — max - min in window (spread)

Total features = num_sensors × 6
"""
import numpy as np


WINDOW_SIZE = 20  # Number of recent readings to use for feature computation


def compute_features_from_window(window: np.ndarray) -> np.ndarray:
    """
    Compute temporal features from a single sensor window.
    
    Args:
        window: 1D array of shape (W,) — last W readings for one sensor
        
    Returns:
        1D array of shape (6,) — [mean, std, rate_of_change, min, max, range]
    """
    if len(window) < 2:
        val = window[0] if len(window) > 0 else 0.0
        return np.array([val, 0.0, 0.0, val, val, 0.0], dtype=np.float32)
    
    w = np.array(window, dtype=np.float64)
    
    mean = np.mean(w)
    std = np.std(w)
    w_min = np.min(w)
    w_max = np.max(w)
    w_range = w_max - w_min
    
    # Rate of change: slope of linear regression over the window
    x = np.arange(len(w), dtype=np.float64)
    if len(w) >= 2:
        # Simple linear regression slope: Σ((x-x̄)(y-ȳ)) / Σ((x-x̄)²)
        x_mean = np.mean(x)
        y_mean = mean
        numerator = np.sum((x - x_mean) * (w - y_mean))
        denominator = np.sum((x - x_mean) ** 2)
        rate_of_change = numerator / denominator if denominator > 1e-10 else 0.0
    else:
        rate_of_change = 0.0
    
    return np.array([mean, std, rate_of_change, w_min, w_max, w_range], dtype=np.float32)


def compute_features_for_all_sensors(sensor_windows: dict, sensor_ids: list) -> np.ndarray:
    """
    Compute temporal features for all sensors from their respective windows.
    
    Args:
        sensor_windows: dict of sensor_id -> list/array of recent values
        sensor_ids: ordered list of sensor IDs (defines feature order)
        
    Returns:
        1D array of shape (num_sensors × 6,) — concatenated features for all sensors
    """
    all_features = []
    
    for sid in sensor_ids:
        window = sensor_windows.get(sid, [])
        if len(window) == 0:
            features = np.zeros(6, dtype=np.float32)
        else:
            features = compute_features_from_window(np.array(window))
        all_features.append(features)
    
    return np.concatenate(all_features).astype(np.float32)


def compute_features_from_dataframe(df, sensor_ids, window_size=WINDOW_SIZE):
    """
    Compute temporal features for an entire DataFrame (used during training).
    
    Processes each row with a rolling window of the previous `window_size` readings.
    For rows near the start of a cycle, uses whatever history is available.
    
    Args:
        df: DataFrame with columns for each sensor_id, plus 'cycle_id' and 'timestep'
        sensor_ids: list of sensor column names
        window_size: number of past readings to use
        
    Returns:
        2D numpy array of shape (num_rows, num_sensors × 6)
    """
    feature_names = []
    for sid in sensor_ids:
        for feat in ['mean', 'std', 'roc', 'min', 'max', 'range']:
            feature_names.append(f"{sid}_{feat}")
    
    all_features = []
    
    # Process each cycle independently (no cross-cycle contamination)
    for cycle_id in df['cycle_id'].unique():
        cycle_data = df[df['cycle_id'] == cycle_id].sort_values('timestep')
        
        for i in range(len(cycle_data)):
            # Get window of up to window_size previous readings (including current)
            start_idx = max(0, i - window_size + 1)
            window_data = cycle_data.iloc[start_idx:i + 1]
            
            row_features = []
            for sid in sensor_ids:
                sensor_window = window_data[sid].values
                features = compute_features_from_window(sensor_window)
                row_features.append(features)
            
            all_features.append(np.concatenate(row_features))
    
    result = np.array(all_features, dtype=np.float32)
    return result, feature_names


# Feature count per sensor — used by other modules
FEATURES_PER_SENSOR = 6

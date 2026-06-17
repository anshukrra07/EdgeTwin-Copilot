import numpy as np
import time
import datetime

def parse_timestamp(ts_str: str) -> float:
    """Parses standard ISO/UTC timestamps to Unix epoch float."""
    try:
        return datetime.datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
    except Exception:
        try:
            # Fallback for ISO format with timezones
            return datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
        except Exception:
            return time.time()

def estimate_rul(health_history: list, current_status: str) -> tuple:
    """
    Estimates Remaining Useful Life (RUL) in hours using exponential curve fitting.
    Returns a tuple: (estimated_hours, lower_bound_95_ci, upper_bound_95_ci)
    
    Formula: h(t) = a * exp(b * t)
    We fit: ln(h(t)) = ln(a) + b * t
    Failure threshold: h_fail = 40.0
    """
    # Fallback lookup table in hours
    fallback_map = {
        "Normal": (720.0, 648.0, 792.0),     # 30 days (±10%)
        "Warning": (240.0, 192.0, 288.0),    # 10 days (±20%)
        "Critical": (36.0, 24.0, 48.0),      # 1.5 days (±33%)
        "Failure": (0.0, 0.0, 0.0)
    }
    
    # Needs at least 8 data points to establish a stable degradation curve fit
    if len(health_history) < 8:
        return fallback_map.get(current_status, (720.0, 648.0, 792.0))
        
    # Extract health scores and timestamps
    valid_points = []
    for h in health_history:
        ts_str = h.get("timestamp")
        h_score = h.get("analysis", {}).get("health_score", 100.0)
        if ts_str and h_score > 0.0:
            # Clamp health to at least 1.0 to allow log calculation
            h_score_clamped = max(1.0, float(h_score))
            valid_points.append((parse_timestamp(ts_str), h_score_clamped))
            
    if len(valid_points) < 8:
        return fallback_map.get(current_status, (720.0, 648.0, 792.0))
        
    # Sort chronologically by timestamp
    valid_points.sort(key=lambda x: x[0])
    
    # Calculate elapsed hours from the first point
    t_start = valid_points[0][0]
    t = np.array([(p[0] - t_start) / 3600.0 for p in valid_points], dtype=np.float64)
    y = np.log([p[1] for p in valid_points], dtype=np.float64)
    
    # Fit linear regression: y = b * t + ln_a
    # We use numpy polyfit
    try:
        coefs, residuals, rank, singular_values, rcond = np.polyfit(t, y, 1, full=True)
        b = coefs[0]
        ln_a = coefs[1]
    except Exception:
        return fallback_map.get(current_status, (720.0, 648.0, 792.0))
        
    # If slope is positive or close to zero, it means health is stable or improving.
    # No degradation trend is present, so use state-based fallback bounds.
    if b >= -1e-5:
        return fallback_map.get(current_status, (720.0, 648.0, 792.0))
        
    # Calculate failure time when health = 40.0
    y_fail = np.log(40.0)
    t_latest = t[-1]
    
    t_fail = (y_fail - ln_a) / b
    expected_rul = max(0.0, t_fail - t_latest)
    
    # Calculate standard errors of the regression parameters to compute confidence intervals
    n = len(t)
    if n > 2:
        # Sum of squared residuals
        y_pred = b * t + ln_a
        ssr = np.sum((y - y_pred) ** 2)
        s_squared = ssr / (n - 2)
        
        t_mean = np.mean(t)
        sum_t_diff_sq = np.sum((t - t_mean) ** 2)
        
        # Avoid division by zero
        if sum_t_diff_sq > 1e-8 and s_squared > 0:
            se_b = np.sqrt(s_squared / sum_t_diff_sq)
            se_ln_a = np.sqrt(s_squared * (1.0 / n + (t_mean ** 2) / sum_t_diff_sq))
            
            # Critical value for 95% confidence (Student's t approx. standard normal multiplier of 2.0)
            t_crit = 2.0
            
            # Vary b and ln_a within their confidence limits to construct the upper/lower bounds of failure time
            # Max RUL occurs when degradation is slowest (b is closest to 0, i.e., b_max = b + t_crit * se_b)
            # Min RUL occurs when degradation is fastest (b is most negative, i.e., b_min = b - t_crit * se_b)
            b_min = b - t_crit * se_b
            b_max = b + t_crit * se_b
            
            ln_a_min = ln_a - t_crit * se_ln_a
            ln_a_max = ln_a + t_crit * se_ln_a
            
            # Clamp b bounds to be strictly negative to prevent infinite projections
            b_min = min(b_min, -1e-6)
            b_max = min(b_max, -1e-6)
            
            t_fail_lower = (y_fail - ln_a_min) / b_min
            t_fail_upper = (y_fail - ln_a_max) / b_max
            
            lower_rul = max(0.0, t_fail_lower - t_latest)
            upper_rul = max(lower_rul, t_fail_upper - t_latest)
            
            # Cap the range to reasonable bounds (e.g., maximum 30 days projection)
            max_hours = 720.0
            expected_rul = min(expected_rul, max_hours)
            lower_rul = min(lower_rul, max_hours)
            upper_rul = min(upper_rul, max_hours)
            
            # If the calculations result in inverted bounds due to scaling, sort them
            bounds = sorted([lower_rul, upper_rul])
            
            return (round(expected_rul, 1), round(bounds[0], 1), round(bounds[1], 1))
            
    # Default confidence intervals if history is too small to calculate standard error
    lower_rul = max(0.0, expected_rul * 0.8)
    upper_rul = min(720.0, expected_rul * 1.2)
    return (round(expected_rul, 1), round(lower_rul, 1), round(upper_rul, 1))

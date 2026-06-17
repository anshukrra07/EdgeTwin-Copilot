"""
Realistic Run-to-Failure Degradation Dataset Generator for EdgeTwin Copilot.

Generates multi-cycle temporal data where sensors gradually degrade over time,
mimicking real industrial failure modes: bearing wear, thermal runaway,
pressure leakage, and lubrication breakdown.

Each cycle runs 200-600 timesteps from healthy → failure, producing data
that has genuine temporal patterns ML models can learn from.
"""
import numpy as np
import pandas as pd
import json
import os


def generate_degradation_cycle(machine, cycle_length, cycle_id, rng):
    """
    Generate one complete run-to-failure cycle for a machine.
    
    The cycle progresses through 4 phases:
      Phase 1 (0-60%):    Normal — random walk within normal bounds
      Phase 2 (60-80%):   Warning — random walk drifting towards warning thresholds  
      Phase 3 (80-92%):   Critical — random walk drifting towards critical thresholds
      Phase 4 (92-100%):  Failure — sensor values beyond critical thresholds
    """
    rows = []
    current_values = {}
    
    # Initialize values
    for sensor in machine["sensors"]:
        sid = sensor["sensor_id"]
        norm_min, norm_max = sensor["normal_range"]
        current_values[sid] = rng.uniform(norm_min, norm_max)
    
    for step in range(cycle_length):
        progress = step / cycle_length  # 0.0 → 1.0
        
        row = {"cycle_id": cycle_id, "timestep": step}
        
        # Determine current phase/state
        if progress < 0.60:
            state = "Normal"
            state_label = 0
        elif progress < 0.80:
            state = "Warning"
            state_label = 1
        elif progress < 0.92:
            state = "Critical"
            state_label = 2
        else:
            state = "Failure"
            state_label = 3
            
        for sensor in machine["sensors"]:
            sid = sensor["sensor_id"]
            norm_min, norm_max = sensor["normal_range"]
            warn = sensor["warning_threshold"]
            crit = sensor["critical_threshold"]
            s_type = sensor["type"]
            
            # Determine bounds based on phase
            if state == "Normal":
                target_min, target_max = norm_min, norm_max
            elif state == "Warning":
                if warn > norm_max:
                    target_min, target_max = warn, crit - (crit - warn) * 0.1
                else:
                    target_min, target_max = crit + (warn - crit) * 0.1, warn
            elif state == "Critical":
                if crit > warn:
                    target_min, target_max = crit, crit + (crit - warn) * 0.5
                else:
                    target_min, target_max = crit - (warn - crit) * 0.5, crit
            else: # Failure
                if crit > warn:
                    target_min, target_max = crit + (crit - warn), crit + (crit - warn) * 2.0
                else:
                    target_min, target_max = crit - (warn - crit) * 2.0, crit - (warn - crit)
                    
            current_val = current_values[sid]
            range_span = abs(target_max - target_min)
            step_size = range_span * 0.05
            
            if current_val < target_min:
                current_val += step_size
            elif current_val > target_max:
                current_val -= step_size
            else:
                # Add small noise within bounds
                noise = rng.uniform(-step_size, step_size)
                current_val += noise
                
            # Keep within the target bounds once inside
            if target_min <= current_val <= target_max:
                pass
            elif current_val < target_min:
                current_val = target_min
            elif current_val > target_max:
                current_val = target_max
                
            current_values[sid] = current_val
            val = current_val
            
            # Rounding for cleanliness
            if s_type == "rpm":
                val = round(val, 1)
            elif s_type == "temperature":
                val = round(val, 2)
            else:
                val = round(val, 3)
                
            row[sid] = val
        
        row["state"] = state_label
        row["rul_steps"] = cycle_length - step
        rows.append(row)
        
    return rows


def generate_telemetry_dataset(num_cycles=30, random_seed=42):
    """
    Generate a multi-cycle run-to-failure dataset.
    
    Args:
        num_cycles: Number of independent run-to-failure cycles
        random_seed: For reproducibility
    
    Returns:
        DataFrame with columns: cycle_id, timestep, sensor values, state, rul_steps
    """
    rng = np.random.default_rng(random_seed)
    
    # Load machine config
    registry_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'backend', 'config', 'machine_registry.json'
    )
    if not os.path.exists(registry_path):
        registry_path = os.path.join(
            os.path.dirname(__file__),
            '..', 'backend', 'config', 'machine_registry.json'
        )
    
    with open(registry_path, 'r') as f:
        registry = json.load(f)
    
    machine = registry['machines'][0]  # Air compressor
    
    all_rows = []
    for cycle_id in range(num_cycles):
        # Each cycle has a different length (200-600 steps) to add variation
        cycle_length = rng.integers(200, 600)
        cycle_rows = generate_degradation_cycle(machine, cycle_length, cycle_id, rng)
        all_rows.extend(cycle_rows)
    
    df = pd.DataFrame(all_rows)
    
    print(f"Generated {len(df)} total samples across {num_cycles} degradation cycles")
    print(f"State distribution:")
    state_names = {0: "Normal", 1: "Warning", 2: "Critical", 3: "Failure"}
    for state_val, count in df['state'].value_counts().sort_index().items():
        print(f"  {state_names[state_val]}: {count} ({count/len(df)*100:.1f}%)")
    
    return df


def generate_cnc_dataset(num_cycles=30, random_seed=43):
    """Generate dataset for CNC machine using same degradation logic."""
    rng = np.random.default_rng(random_seed)
    
    registry_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'backend', 'config', 'machine_registry.json'
    )
    if not os.path.exists(registry_path):
        registry_path = os.path.join(
            os.path.dirname(__file__),
            '..', 'backend', 'config', 'machine_registry.json'
        )
    
    with open(registry_path, 'r') as f:
        registry = json.load(f)
    
    machine = registry['machines'][1]  # CNC machine
    
    all_rows = []
    for cycle_id in range(num_cycles):
        cycle_length = rng.integers(200, 600)
        cycle_rows = generate_degradation_cycle(machine, cycle_length, cycle_id, rng)
        all_rows.extend(cycle_rows)
    
    return pd.DataFrame(all_rows)


if __name__ == '__main__':
    print("=" * 60)
    print("EDGETWIN COPILOT — Realistic Degradation Dataset Generator")
    print("=" * 60)
    
    # Generate air compressor dataset
    print("\n--- Air Compressor Dataset ---")
    df_ac = generate_telemetry_dataset(num_cycles=30)
    os.makedirs('ml', exist_ok=True)
    df_ac.to_csv('ml/machinery_telemetry.csv', index=False)
    print(f"Saved to ml/machinery_telemetry.csv ({df_ac.shape})")
    
    # Generate CNC dataset
    print("\n--- CNC Machine Dataset ---")
    df_cnc = generate_cnc_dataset(num_cycles=30)
    df_cnc.to_csv('ml/cnc_telemetry.csv', index=False)
    print(f"Saved to ml/cnc_telemetry.csv ({df_cnc.shape})")
    
    print("\nDone!")

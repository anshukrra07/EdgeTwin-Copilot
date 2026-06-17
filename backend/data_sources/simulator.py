import random
import time
import json
import os
from typing import Dict
from backend.data_sources.base import DataSource

class SimulatorSource(DataSource):
    def __init__(self, registry_path: str = None):
        if registry_path is None:
            registry_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), 
                "config", 
                "machine_registry.json"
            )
        
        with open(registry_path, "r") as f:
            self.registry = json.load(f)
            
        # Track states and steps per machine
        self.machine_states = {}
        self.steps = {}
        
        for machine in self.registry["machines"]:
            m_id = machine["machine_id"]
            self.machine_states[m_id] = "Normal"
            self.steps[m_id] = 0

    def set_machine_state(self, machine_id: str, state: str):
        if machine_id in self.machine_states and state in ["Normal", "Warning", "Critical", "Failure"]:
            self.machine_states[machine_id] = state

    async def get_reading(self, machine_id: str) -> Dict:
        # Find machine config
        machine = None
        for m in self.registry["machines"]:
            if m["machine_id"] == machine_id:
                machine = m
                break
                
        if not machine:
            raise ValueError(f"Machine with ID {machine_id} not found in registry.")
            
        state = self.machine_states[machine_id]
        self.steps[machine_id] += 1
        step = self.steps[machine_id]
        
        sensors_payload = {}
        
        for sensor in machine["sensors"]:
            s_id = sensor["sensor_id"]
            s_type = sensor["type"]
            unit = sensor["unit"]
            norm_min, norm_max = sensor["normal_range"]
            warn_thresh = sensor["warning_threshold"]
            crit_thresh = sensor["critical_threshold"]
            
            # Determine generation bounds based on current state
            if state == "Normal":
                target_min, target_max = norm_min, norm_max
            elif state == "Warning":
                if warn_thresh > norm_max:
                    target_min, target_max = warn_thresh, crit_thresh - (crit_thresh - warn_thresh) * 0.1
                else:
                    target_min, target_max = crit_thresh + (warn_thresh - crit_thresh) * 0.1, warn_thresh
            elif state == "Critical":
                if crit_thresh > warn_thresh:
                    target_min, target_max = crit_thresh, crit_thresh + (crit_thresh - warn_thresh) * 0.5
                else:
                    target_min, target_max = crit_thresh - (warn_thresh - crit_thresh) * 0.5, crit_thresh
            else: # Failure
                if crit_thresh > warn_thresh:
                    target_min, target_max = crit_thresh + (crit_thresh - warn_thresh), crit_thresh + (crit_thresh - warn_thresh) * 2.0
                else:
                    target_min, target_max = crit_thresh - (warn_thresh - crit_thresh) * 2.0, crit_thresh - (warn_thresh - crit_thresh)
                    
            # Use random walk for smooth transitions instead of jumping
            if not hasattr(self, "current_values"):
                self.current_values = {}
            if machine_id not in self.current_values:
                self.current_values[machine_id] = {}
            
            if s_id not in self.current_values[machine_id]:
                self.current_values[machine_id][s_id] = random.uniform(norm_min, norm_max)
                
            current_val = self.current_values[machine_id][s_id]
            
            # Move towards the target bounds
            range_span = abs(target_max - target_min)
            step_size = range_span * 0.05
            
            if current_val < target_min:
                current_val += step_size
            elif current_val > target_max:
                current_val -= step_size
            else:
                # Add small noise within bounds
                noise = random.uniform(-step_size, step_size)
                current_val += noise
                
            # Keep within the target bounds once inside
            if target_min <= current_val <= target_max:
                pass
            elif current_val < target_min:
                current_val = target_min
            elif current_val > target_max:
                current_val = target_max
                
            self.current_values[machine_id][s_id] = current_val
            val = current_val
            
            # Rounding for cleanliness
            if s_type == "rpm":
                val = round(val, 1)
            elif s_type == "temperature":
                val = round(val, 2)
            else:
                val = round(val, 3)
                
            sensors_payload[s_id] = {
                "value": val,
                "type": s_type,
                "unit": unit
            }
            
        return {
            "machine_id": machine_id,
            "machine_type": machine["machine_type"],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "machine_state": state,
            "sensors": sensors_payload
        }

    async def start(self):
        pass

    async def stop(self):
        pass

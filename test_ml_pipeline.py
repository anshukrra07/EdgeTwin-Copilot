import urllib.request
import urllib.parse
import time
import json
import sys

BASE_URL = "http://localhost:8000"

def get_history(machine_id):
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/machines/{machine_id}/history?limit=1")
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                if data:
                    return data[-1]["analysis"]
    except Exception as e:
        print(f"Error fetching history: {e}")
    return None

def force_state(machine_id, state):
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/machines/{machine_id}/state/{state}", method="POST")
        req.add_header("Authorization", "Bearer operator-session-token-secret-1234")
        with urllib.request.urlopen(req) as response:
            return response.status == 200
    except Exception as e:
        print(f"Error forcing state: {e}")
        return False

def print_status(machine_id, analysis):
    if not analysis:
        print(f"[{machine_id}] No data available")
        return
        
    print(f"[{machine_id}] Health: {analysis.get('health_score')}, "
          f"Status: {analysis.get('status')}, "
          f"Predicted State: {analysis.get('predicted_state')}, "
          f"Anomaly: {analysis.get('is_anomaly')}, "
          f"Confidence: {analysis.get('confidence')}")

def run_test(machine_id):
    print(f"\n{'='*50}")
    print(f"DEEP TEST: {machine_id}")
    print(f"{'='*50}")
    
    print("\n1. Testing NORMAL state...")
    force_state(machine_id, 0)
    time.sleep(3) # Wait for buffer to clear out previous bad state
    analysis = get_history(machine_id)
    print_status(machine_id, analysis)
    
    print("\n2. Testing WARNING state...")
    force_state(machine_id, 1)
    time.sleep(4) # Wait for temporal features to pick up the trend
    analysis = get_history(machine_id)
    print_status(machine_id, analysis)
    
    print("\n3. Testing CRITICAL state...")
    force_state(machine_id, 2)
    time.sleep(4)
    analysis = get_history(machine_id)
    print_status(machine_id, analysis)
    
    print("\n4. Resetting to NORMAL...")
    force_state(machine_id, 0)
    time.sleep(2)
    analysis = get_history(machine_id)
    print_status(machine_id, analysis)

if __name__ == "__main__":
    try:
        run_test("AC-001")
        run_test("CNC-001")
        print("\nTest completed successfully!")
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)

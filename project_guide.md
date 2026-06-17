# 🏭 EdgeTwin Copilot — Comprehensive System Architecture & Developer Guide

Welcome to the **EdgeTwin Copilot** developer guide. This document serves as a complete reference outlining the technologies, system mechanics, directory topology, and edge analytical pipelines of this predictive maintenance platform.

---

## 🛠️ Technology Stack

The platform is designed with an **edge-first, decoupled architecture** that splits visual execution, local statistical inference, and generative analytics.

| Layer | Technologies Used | Purpose |
|---|---|---|
| **Frontend WebGL** | React (Vite), Three.js (Fiber), TailwindCSS, Recharts, Lucide Icons | High-fidelity dynamic 3D asset viewer, real-time charts, operator controls, and alert dashboards. |
| **API Gateway** | Python 3.11, FastAPI, Uvicorn, Websockets | High-performance async REST endpoints, state-changing commands, and pub-sub WebSocket telemetry streams. |
| **Edge ML Engine** | ONNX Runtime (CPU/Edge optimized), Scikit-Learn, XGBoost | Low-latency Isolation Forest anomaly classification and XGBoost failure state probability mapping. |
| **Storage & Historian** | SQLite 3, Swinging Door Compression (SDC) | High-compression historical time-series storage, active alert logging, and spare parts purchase orders. |
| **GenAI Reasoning** | Groq (Llama 3.3/Scout), Local Ollama, Cached Fallback | Interactive conversational chat terminal, telemetry context aggregation, and system action tag parsing (dispatch, reset, safety). |

---

## 📐 System Pipeline Topology

```mermaid
flowchart TB
    subgraph Data Sources
        SIM["Telemetry Simulator"]
        DB_HIST["SQLite DB (telemetry_history)"]
    end

    subgraph "Ingestion & Validation"
        VAL["Sensor Range & NaN Filter"]
        FLAT["Sensor Flatline Detector"]
        SDC["Swinging Door Compressor"]
    end

    subgraph "Analytics & Edge Inference"
        BUFF["In-Memory isolated deques (Window=20)"]
        FE["Temporal Feature Engineer"]
        IF["Isolation Forest (ONNX)"]
        XGB["XGBoost Classifier (ONNX)"]
        PHYS["Physics Engine (Thermodynamics)"]
        RUL["Exponential Curve RUL Fit"]
        ALERT["3-Tier Escalating Alert Engine"]
    end

    subgraph "Closed-Loop Systems"
        BOM["BOM Spare Parts Inventory"]
        PO["Purchase Order System"]
        REMED["Remediation Code Generator"]
    end

    subgraph "Presentation Layer"
        WS["WebSocket Telemetry & Alerts"]
        REST["FASTAPI Endpoints / Auth Gateway"]
        UI["React 3D Twin & Chat Copilot"]
    end

    SIM --> VAL --> FLAT
    FLAT --> SDC
    SDC -- "Trend Milestone" --> DB_HIST
    FLAT --> BUFF
    BUFF --> FE --> IF & XGB
    FLAT --> PHYS
    IF & XGB --> ALERT
    PHYS --> ALERT
    ALERT --> RUL
    ALERT -- "Critical State" --> BOM
    BOM -- "Low Stock" --> PO
    ALERT & RUL & PHYS --> WS & REST
    WS & REST --> UI
```

---

## 📂 Project Directory Structure

```
EdgeTwin Copilot/
├── backend/
│   ├── api/
│   │   ├── routes_machines.py       # REST endpoints for asset list, metadata, and controls
│   │   ├── routes_copilot.py        # Alternative LLM API endpoints
│   │   └── websocket_hub.py         # Sub/Pub connection groups for real-time streams
│   │
│   ├── config/
│   │   ├── machine_registry.json    # Master registry defining thresholds, BOM stock, and sensors
│   │   └── failure_modes.json       # Heuristics mapping deviations to named failure modes
│   │
│   ├── data_sources/
│   │   ├── base.py                  # Abstract Data Source contract
│   │   ├── simulator.py             # Random walk telemetry simulator
│   │   └── mqtt.py                  # Stub for real-world MQTT broker ingestion
│   │
│   ├── engine/
│   │   ├── anomaly.py               # Alert engine with persistence, deduplication, and cooldowns
│   │   ├── failure_mapper.py        # Pattern matcher mapping deviations to failures
│   │   ├── health_score.py          # Linear decay formula mapping sensor health to health score
│   │   ├── physics.py               # Thermodynamic/Kinematic check violating physical laws
│   │   └── rul.py                   # Exponential decay curve fitting with 95% Confidence Intervals
│   │
│   ├── llm/
│   │   ├── base.py                  # Abstract LLM wrapper
│   │   ├── groq_provider.py         # Groq LLaMA client
│   │   ├── ollama_provider.py       # Local Ollama client (fully offline edge mode)
│   │   ├── cached_provider.py       # Offline static heuristic response fallback
│   │   └── prompt_templates.py      # Structured system prompts containing XML boundaries
│   │
│   ├── ml/
│   │   ├── feature_engineering.py   # Sliding window feature calculator (Mean, Std, RoC, etc.)
│   │   ├── drift_detector.py        # Real-time sensor Z-score drift detector
│   │   ├── inference.py             # Temporal ONNX predictor
│   │   ├── train.py                 # Offline Scikit-Learn / XGBoost trainer
│   │   └── model_registry.py        # Lazy loader caching ONNX sessions
│   │
│   ├── models/                      # Folder containing compiled ONNX binaries & scaling PKLs
│   │   ├── air_compressor/
│   │   │   ├── isolation_forest.onnx
│   │   │   ├── xgboost_classifier.onnx
│   │   │   └── scaler.pkl
│   │   └── cnc_machine/
│   │
│   ├── store/
│   │   ├── db.py                    # SQLite connection initialization, queries, and updates
│   │   ├── history.py               # SDC-filtered telemetry logger
│   │   └── historian.py             # Swinging Door Compression algorithm
│   │
│   ├── main.py                      # FastAPI root hosting background threads and server startup
│   └── requirements.txt             # Python backend dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ThreeDigitalTwin.jsx  # WebGL Three.js renderer (pulleys, sparks, stack lights)
│   │   │   ├── SensorChart.jsx      # Throttled Recharts real-time line charts
│   │   │   ├── HealthGauge.jsx      # Animated SVG circular health status indicator
│   │   │   ├── CopilotPanel.jsx     # Conversational chat UI and HITL actions
│   │   │   ├── AssetGraph.jsx       # Interactive SVG asset dependency topology
│   │   │   └── MLOpsConsole.jsx     # Drift metrics & retraining logging interface
│   │   │
│   │   ├── context/
│   │   │   └── MachineContext.jsx   # Shared global state hook
│   │   ├── App.jsx                  # Root shell containing login layout and workspace routes
│   │   └── main.jsx
│   └── package.json                 # Frontend dependencies
│
├── ml/                              # Offline datasets for training
│   ├── dataset_generator.py         # Standalone CSV dataset simulator
│   └── train.py                     # Root training script triggering compilation
│
├── architecture_design.md           # Developer guidelines and stages reference
└── industrial_audit_report.md       # Audit checklist details
```

---

## 🔩 Key System Mechanisms

### 1. Ingestion Quality & Sensor Validation
Before data enters the ML or physics engines:
* **Midpoint Fallback**: Values containing `NaN`, `null`, or `infinite` are rejected and replaced by the sensor's midpoint value.
* **Flatline Detection**: A rolling deque of the last 15 readings is monitored. If 10 consecutive readings are identical, the sensor is flagged as `isValid = False` (faulty), forcing its health score contribution to `0.0`.

### 2. Swinging Door Compression (SDC) Historian
To prevent disk bloat on edge units, telemetry is compressed before SQLite write:
* **Algorithmic Band**: The compiler creates a sliding door envelope representing a $\pm 5\%$ normal operating range.
* **Milestone Logging**: If incoming values deviate linearly from the established trend, the doors "close", and the trend milestone is flushed to `telemetry_history`. This saves up to 85% disk space.

### 3. Physics-Informed Boundary Checks
Telemetry is run through structural physical constraints to identify anomalies before they show up in ML models:
* **Air Compressor**: Calculates *Volumetric Efficiency* ($\text{Pressure} / \text{Power}$) and *Kinematic Friction Factor* ($(\text{Vibration} \times \text{Temperature}) / \text{RPM}$).
* **CNC Mill**: Tracks *Cutting Stress* ($\text{Feed Rate} / \text{Spindle Speed}$) and *Thermal Dissipation* ($\text{Coolant Temp} \times 100 / \text{Spindle Speed}$).
* **Operating Mode Awareness**: Modifies checks depending on whether the machine is `Idle`, `Startup Transient`, or `Loaded`.

### 4. Exponential Degradation RUL Model
Estimated Remaining Useful Life (RUL) fits health degradation points ($h$) over elapsed time ($t$) into an exponential curve:
$$h(t) = a \cdot e^{b \cdot t}$$
By fitting $\ln(h(t)) = \ln(a) + b \cdot t$, standard error parameters are calculated to compute a **95% Confidence Interval** for the failure projection time (where health score hits 40%).

### 5. Closed-Loop Inventory & Purchase Orders (BOM)
* **Auto PO creation**: If an ONNX prediction identifies a failure mode at $\ge 50\%$ confidence and its corresponding spare part stock levels are $\le 1$, a purchase order status is added to `spare_parts_orders` with the status `"Pending Approval"`.
* **Keyword deduction**: When operators log a maintenance checklist containing keywords (e.g. `"belt"`, `"oil"`, `"cutter"`), inventory is auto-deducted. Operators can approve pending purchase orders on the **Orders** tab to restock inventory in real-time.

### 6. Conversational Agentic Chat & Control Action Tags
The system includes a conversational chat terminal enabling operators to query diagnostics, modify simulation properties, and approve repairs.
* **Telemetry Context Binding**: On every chat message, the backend compiles a system message (`MAINTENANCE_CHAT_SYSTEM_PROMPT`) containing raw sensor readings, deviations, physics violations, RUL calculations, and warehouse inventory quantities.
* **System Action Tags**: The LLM provider (or Cached fallback) outputs a brackets-wrapped action tag to trigger backend changes. The FastAPI chat route (`/api/copilot/chat`) parses these tags using regex:
  * `[ACTION: RESET_SANDBOX]`: Deletes entry in `sandbox_overrides` to restore normal simulation.
  * `[ACTION: DISPATCH_WORK_ORDER]`: Mapped from failure modes to spare parts; deducts warehouse stock, updates maintenance ledger logs, and resets machine health to 100%.
  * `[ACTION: SET_INTERVAL, seconds=X]`: Updates global telemetry ticker interval (seconds).
  * `[ACTION: FORCE_STATE, state=X]`: Injects Normal (0), Warning (1), or Critical (2) simulator state.
  * `[ACTION: TRIGGER_RETRAINING]`: Launches asynchronous model retraining.
  * `[ACTION: TRIGGER_SAFE_STATE]`: Pauses operations and initiates safe-state G-Code/PLC logic downloads.
* **Dynamic Controller Remediation Generator**: When a critical failure mode or safe-state request occurs, the backend dynamically generates remediation logic via `/api/machines/{machine_id}/remediation`:
  * **CNC Milling Machine**: Compiles absolute positioning G-Code (`.gcode`) that shuts off the spindle (`M05`), retracts the tool in Z-axis (`G00 Z10.0`), moves the table to safe loading coordinates (`G00 X0.0 Y0.0`), and shuts off the coolant pump (`M09`).
  * **Air Compressor**: Compiles structured text PLC logic (`.st`) that shuts off the main motor contactor, keeps the cooling fan active to dissipate heat, closes the solenoid valve, and opens the bypass valve to bleed pressure lines.
* **Interactive Remediation Cards**: The Copilot chat terminal (`CopilotPanel.jsx`) detects safety-remediation alerts and renders a custom gradient card inside the feed showing the generated code sequences and providing a button to download the controller script directly.
* **Glove-Friendly Action Chips**: The panel renders contextual tap-buttons (`🔧 Dispatch`, `🔄 Clear Overrides`, `⏱️ Set Interval 1s`, `🧠 Retrain ML`, `🛑 Safe-State Pause`) right above the chat input box for touch screens.
* **Event-Driven AI Diagnostics Updates**: To prevent infinite LLM generation loops on every 1-second telemetry tick, the Copilot tracks an `eventKey` comprising: `${isAnomaly}_${alertLevel}_${activeFailureMode}`. The Copilot only auto-triggers a new LLM diagnostic report when this semantic state key changes (e.g. failure mode switches or severity escalates).
* **Auto-Slide Open Panel Trigger**: In `App.jsx`, a `prevAnomalyRef` tracks the state transitions of `currentTelemetry?.analysis?.is_anomaly`. If the machine transitions from nominal to an anomalous state (under either backend or local edge inference), the panel slides open automatically.

### 7. High-Fidelity 3D Exploded Twin Alignment
The WebGL viewport (`ThreeDigitalTwin.jsx`) dynamically animates the mechanical assets based on the selected machine type and visualization mode.
* **Exploded View Disassembly**:
  * **Air Compressor**: Translates the air tank casing, motor assembly, fan belt, and filters outward to reveal interior components.
  * **CNC Milling Machine**: Translates the enclosure gantry, guide rails, spindle block, and cutting heads outward.
* **Ground Circular Platform Alignment**: During the explode animation, the circular ground plate guide mesh, radial guide rings, and coordinate lines dynamically shift downward in synchrony with the leveling feet. This preserves proper mechanical relationships, preventing visual gaps or floating models.

---

## 🔒 Security Gateways & Safeguards

1. **Bearer Authentication Middleware**: All write actions (changing speed intervals, sandbox overrides, manual telemetry updates, purchase order approvals) are locked behind standard bearer validation:
   * Header: `Authorization: Bearer operator-session-token-secret-1234`
2. **Prompt Injection Shielding**: Operator manual log text is parsed to strip brackets (`[]`) and tags (`<>`), and checked against blocklisted injection commands (e.g. `ignore previous directions`). The notes are wrapped in XML blocks:
   `[OPERATOR OBSERVATION START] ... [OPERATOR OBSERVATION END]`
3. **API Rate Limiting**: REST endpoint usage is monitored via a sliding window rate limiter, restricting each client IP to a maximum of 100 requests per minute to prevent LLM cost overflows.

---

## 🚀 Running & Verification Guide

### 1. Generating Data & Retraining Models
Run from the project root:
```bash
# Generate datasets
PYTHONPATH=. python ml/dataset_generator.py

# Train baseline ONNX models
PYTHONPATH=. python backend/ml/train.py
```

### 2. Starting the Backend Server
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*API docs will be active at `http://localhost:8000/docs`.*

### 3. Starting the React UI
```bash
cd frontend
npm install
npm run dev
```
*Dashboard will be active at `http://localhost:5173` (Credential: `admin` / `admin`).*

### 4. Production Cloud Deployment (Vercel + Render)

#### A. Frontend Web App (Vercel)
* **Root Directory**: Configure to **`frontend`** (monorepo subfolder).
* **Framework Preset**: `Vite`
* **SPA Routing**: The `frontend/vercel.json` configures dynamic URL rewrites to `/index.html` to prevent `404` errors when reloading dashboards or orders routes.
* **Environment Variables**:
  * `VITE_API_URL`: Points to your deployed HTTP backend URL (e.g. `https://edgetwin-copilot.onrender.com`).
  * `VITE_WS_URL`: Points to your deployed WebSocket URL (e.g. `wss://edgetwin-copilot.onrender.com`).

#### B. API Gateway & ML Pipeline (Render Container)
* **Language**: `Docker` (Render automatically compiles and runs the root `Dockerfile`).
* **Root Directory**: Leave **blank / empty** (must compile from the project root to fetch the `ml/` baseline training CSVs).
* **Environment Variables**:
  * `LLM_PROVIDER`: `groq` (or `cached` fallback).
  * `GROQ_API_KEY`: *your API key*.
* **Persistent Disk (Optional - requires Starter plan)**:
  * Mount Path: `/app/backend/store`
  * Size: `1 GiB`
  *(On the Render Free Tier, SQLite database updates and retrained ONNX models are ephemeral and reset when the container goes to sleep or restarts.)*

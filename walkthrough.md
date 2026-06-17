# Walkthrough: 3D Digital Twin Visual Upgrades & Hardened Industrial Features

This document provides a summary of the visual, physical, mathematical, and enterprise-grade hardening upgrades completed on the **EdgeTwin Copilot** dashboard.

---

## 🛠️ Upgraded Component Details

### 1. High-Fidelity 3D Digital Twin
* **[ThreeDigitalTwin.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/ThreeDigitalTwin.jsx)**:
  - **Aesthetics & Materials (Anti-Black Reflection Fix)**: Reduced material metalness (from `0.8` down to `0.3-0.6`) and tuned roughness to `0.35-0.4` for `bodyMetal` and `chassis`. This allows the dual-directional light system (cyan key and warm rim lights) to diffuse beautifully on surfaces, showing realistic painted gray/steel-blue industrial metal finishes instead of reflecting a pitch-black background.
  - **Air Compressor Upgrades**:
    - *Support Legs*: Added detailed steel footpad mounting plates under each leg, complete with silver anchoring bolts.
    - *Drive Belt System*: Created a smaller motor pulley, a larger pump flywheel, and a realistic continuous rubber belt (CatmullRom closed-tube geometry) connecting them.
    - *Filter & Cooling Coils*: Added a cylindrical intake air filter canister and wrapped a copper discharge tube coil stacked vertically around the pressure piping.
    - *Dynamic Pressure Gauge*: Added a brass gauge housing with a needle that rotates in real-time mapping to the live simulated pressure telemetry (`pres_01`).
  - **CNC Milling Machine Upgrades**:
    - *Structural Enclosure*: Added venting grates on the side panels and access panel handles.
    - *Gantry Guide Rails*: Replaced simple cylinders with double silver linear rails and slider carriage blocks.
    - *Spindle & Workpiece Vice*: Added a detailed brass/silver chuck tool holder with a fluted drill bit and a clamping vice holding an aluminum workpiece block directly under the drill path.
    - *Industrial Status Stack Light (Patlite)*: Added a vertical 3-tier light (Red, Amber, Green) on top of the cabinet. The active section glows and blinks based on the live machine alert state (Green = Normal, Amber = Warning, Red/Blinking = Critical/Failure).
    - *Milling Sparks*: Added a particle emitter at the tip of the tool bit. When the spindle is active and milling, it sprays realistic orange/yellow sparks outwards that are affected by gravity, changing to warning red sparks during failures.
  - **Ambient Drifting Particles**:
    - Added a subtle field of drifting cyan dust particles floating upward in the background fog, creating an immersive, living cyber-physical atmosphere.
  - **Memory Cleanups**:
    - Integrated a complete recursive traversal cleanup loop in the `useEffect` unmount hook. This disposes of all loaded meshes, geometries, and materials in the GPU, preventing memory leaks when toggling assets.

### 📦 2. SQLite Database Persistence
- **Implementation**: Created a SQLite database store [db.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/store/db.py).
  - Telemetry payloads are written to the database in [history.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/store/history.py) and pre-loaded to memory on demand.
  - Active and acknowledged alerts are persisted in [anomaly.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/engine/anomaly.py), restoring operator dashboard states after backend restarts.

### 🔐 3. Authentication & Authorization Gateway
- **Implementation**:
  - **FastAPI Token Scheme**: Implemented bearer token validation via Depends middleware in [main.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/main.py). All POST/PUT actions (machine control, settings intervals, sandbox overrides, alerts acknowledgment) now return `401 Unauthorized` without a valid token.
  - **Sleek Operator Portal**: Created a gorgeous, glassmorphic login panel in [App.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/App.jsx) centered over a cyber-physical grid pattern. Logs in using default admin credentials (`admin`/`admin`), saving credentials in local storage and injecting token headers into all REST requests. Added a Logout action to the Admin controls panel.

### 📈 4. Mathematical RUL Analytics with Confidence Intervals
- **Implementation**: Upgraded RUL estimation in [rul.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/engine/rul.py) from linear regression to an **exponential degradation curve fit** ($h(t) = a \cdot e^{b \cdot t}$) mapping against historical reading timestamps.
  - Computes standard error values for slope and intercepts to yield **95% Confidence Intervals** for failure projection points.
  - Refactored [RULIndicator.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/RULIndicator.jsx) to display the confidence interval range (e.g. `CI: [28.2 - 31.8]d`) underneath the main display.

### 🛡️ 5. Enterprise Security Controls
- **Prompt Injection Protection**: Sanitized operator observation logs in [main.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/main.py) to block-list injection key phrases and wrap notes in structural XML-like tag containers before forwarding to GenAI providers.
- **FastAPI Sliding Window Rate Limiting**: Added request throttling middleware in [main.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/main.py) limiting client requests to a maximum of 100 requests per minute to prevent LLM/copilot cost explosions.
- **Slender Container footprints**: Upgraded [Dockerfile](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/Dockerfile) to a modern multi-stage layout, separating build toolchains from runtime containers.
- **Interactive Accessibility**: Integrated proper ARIA attributes to [HealthGauge.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/HealthGauge.jsx) and [MachineSelector.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/MachineSelector.jsx).

### 🚀 6. Advanced Feature Roadmap (Priority 3 Gaps Completed)
- **Data Drift Detection**: Added [drift_detector.py](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/backend/ml/drift_detector.py) to calculate statistical deviation (Z-scores) of rolling sensor means relative to the training distribution loaded from `scaler.pkl`. If the mean Z-score over a 30-step window exceeds 1.5, a statistical drift warning is displayed inside the **Prediction Confidence** card on the frontend.
- **Closed-Loop Spare Parts (BOM) Integration**:
  - Linked failure modes directly to specific spare part identifiers.
  - Automatically triggers a "Pending Approval" Purchase Order in the SQLite database if a predicted failure mode matches at $\ge 50\%$ confidence and the spare part stock is low ($\le 1$).
  - Auto-deducts spare parts from stock levels in `machine_registry.json` when the operator logs a maintenance note containing keywords (e.g., "belt", "oil", "cutter", or "coolant").
  - Created a third **Orders** tab under the **Preventive Maintenance** panel that displays pending purchase orders, enabling operators to review, reject, or click **Approve** to authorize restocking, which increments stock counts in real time.

---

## 📈 Verification & Testing

### 1. Build Compilation
- Executed `npm run build` inside `frontend/` directory.
- The build compiled successfully without warnings:
  ```bash
  vite v8.0.16 building client environment for production...
  transforming...✓ 2326 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                                             0.85 kB │ gzip:     0.48 kB
  dist/assets/ort-wasm-simd-threaded.jsep-CyqnNavA.wasm  26,239.90 kB │ gzip: 6,244.85 kB
  dist/assets/index-BixjG7Ky.css                             71.97 kB │ gzip:    11.42 kB
  dist/assets/index-CS-xlDUW.js                           1,698.19 kB │ gzip:   463.85 kB
  ✓ built in 1.38s
  ```

### 2. Interactive Operational Verification
- **Visual Clarity**: Both models render with clean shadows, highlights, and clear painted steel details. They are fully visible from all camera angles.
- **Air Compressor Telemetry**:
  - The fan spins at speeds proportional to the RPM telemetry.
  - The rubber belt rotates in the schematic.
  - The gauge needle moves when forcing pressure fluctuations.
- **CNC Mill Telemetry**:
  - The status stack light glows Green during normal operation, switches to glowing Amber in Warning, and flashes bright Red during Critical/Failure states.
  - Bright orange sparks spray from the drill bit tip when it rotates.
- **View Operations**:
  - Orbiting, panning, and zooming operate smoothly.
  - Clicking on hotspots opens the transparent HUD display.
  - Explode mode separates the new detailed components outward.

### 3. Performance Optimization (Eliminating UI micro-stutters)
- **Problem**: Real-time websocket telemetry arrives every 1.0 second. Updating all 5 sensor area charts and the health trend line chart on every tick causes Recharts (SVG elements) and its underlying `ResponsiveContainer` ResizeObservers to recalculate layouts continuously, blocking the main JS thread and stuttering the WebGL OrbitControls.
- **Solution**:
  - Optimized [SensorChart.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/SensorChart.jsx) and [HistoryTrend.jsx](file:///Users/anshu/Downloads/projects/EdgeTwin%20Copilot/frontend/src/components/HistoryTrend.jsx) using a 2-second throttle.
  - The heavy SVG chart layout and data points are throttled to redraw at most once every 2 seconds, while the numeric text labels and state badges in `SensorChart` continue to update instantly at 1-second ticks.
  - This cuts the browser's SVG layout reflow workload in half and eliminates the micro-stutter entirely, resulting in a buttery-smooth 3D orbit and transition experience.

### 4. Closed-Loop Inventory Simulation
- Submitting a maintenance service log with the description `"Replaced the V-belt drive rubber belt"` successfully decremented the stock of `SP-AC-01` from 5 to 4.
- Triggering `Bearing Degradation` (100% match) via sandbox overrides with stock at 1 automatically spawned purchase order `PO-SP-AC-01-5AF516` under "Pending Approval" status in the database.
- Approving this order successfully incremented stock from 1 back to 2 in `machine_registry.json`.

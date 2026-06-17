import React, { createContext, useState, useEffect, useContext, useRef, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import * as ort from 'onnxruntime-web';
import { API_BASE, WS_BASE } from '../config';

// Configure path to CDN for WASM and worker assets to bypass Vite dev-server import restrictions
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';
// Restrict worker spawning to a single thread to eliminate browser thread compilation freezes
ort.env.wasm.numThreads = 1;

const MachineContext = createContext();

const WINDOW_SIZE = 20;

function computeFeaturesFromWindow(windowValues) {
  const len = windowValues.length;
  if (len === 0) return [0, 0, 0, 0, 0, 0];
  if (len === 1) {
    const val = windowValues[0];
    return [val, 0, 0, val, val, 0];
  }
  const mean = windowValues.reduce((a, b) => a + b, 0) / len;
  let sumSqDiff = 0;
  let min = windowValues[0];
  let max = windowValues[0];
  for (let i = 0; i < len; i++) {
    const val = windowValues[i];
    sumSqDiff += Math.pow(val - mean, 2);
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const std = Math.sqrt(sumSqDiff / len);
  const range = max - min;

  // Rate of change (regression slope)
  const x_mean = (len - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < len; i++) {
    numerator += (i - x_mean) * (windowValues[i] - mean);
    denominator += Math.pow(i - x_mean, 2);
  }
  const rate_of_change = denominator > 1e-10 ? numerator / denominator : 0.0;
  return [mean, std, rate_of_change, min, max, range];
}

function scaleFeatures(rawFeatures, scaler) {
  const scaled = new Float32Array(rawFeatures.length);
  for (let i = 0; i < rawFeatures.length; i++) {
    const m = scaler.mean[i] || 0.0;
    let s = scaler.scale[i] || 1.0;
    if (s < 1e-10) s = 1.0;
    scaled[i] = (rawFeatures[i] - m) / s;
  }
  return scaled;
}

export function MachineProvider({ children }) {
  const [machines, setMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSandboxActive, setIsSandboxActive] = useState(false);
  const [localInferenceEnabled, setLocalInferenceEnabled] = useState(false);
  const [localAnalysis, setLocalAnalysis] = useState(null);
  const [isSimulatingSafeState, setIsSimulatingSafeState] = useState(false);

  const iforestSessionRef = useRef(null);
  const xgboostSessionRef = useRef(null);
  const scalerRef = useRef(null);
  const sensorBuffersRef = useRef({});

  // Fetch machine configuration list on mount
  useEffect(() => {
    async function fetchMachines() {
      try {
        const res = await fetch(`${API_BASE}/api/machines`);
        const data = await res.json();
        setMachines(data);
        if (data.length > 0) {
          setSelectedMachineId(data[0].machine_id);
        }
      } catch (err) {
        console.error('Failed to load machine configurations:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMachines();
  }, []);

  // Fetch history and reset state when active machine changes
  useEffect(() => {
    if (!selectedMachineId) return;
    setIsSandboxActive(false);
    setLocalAnalysis(null);
    setIsSimulatingSafeState(false);
    iforestSessionRef.current = null;
    xgboostSessionRef.current = null;
    scalerRef.current = null;
    sensorBuffersRef.current = {};

    async function fetchHistory() {
      try {
        const res = await fetch(`${API_BASE}/api/machines/${selectedMachineId}/history?last_n=100`);
        const data = await res.json();
        setHistory(data);
      } catch (err) {
        console.error(`Failed to load history for machine ${selectedMachineId}:`, err);
      }
    }
    
    fetchHistory();
  }, [selectedMachineId]);

  // Load local models ON-DEMAND only when local edge inference is actively enabled
  useEffect(() => {
    if (!selectedMachineId || !localInferenceEnabled) return;

    // Skip if already loaded for the current machine
    if (iforestSessionRef.current && xgboostSessionRef.current && scalerRef.current) {
      return;
    }

    async function loadLocalModels() {
      try {
        console.log(`Loading local ONNX models on-demand for ${selectedMachineId}...`);
        const scalerRes = await fetch(`${API_BASE}/api/machines/${selectedMachineId}/scaler`);
        if (!scalerRes.ok) return;
        const scalerData = await scalerRes.json();
        scalerRef.current = scalerData;

        // Fetch model files as ArrayBuffers
        const iforestRes = await fetch(`${API_BASE}/api/machines/${selectedMachineId}/models/isolation_forest`);
        const iforestBuf = await iforestRes.arrayBuffer();
        iforestSessionRef.current = await ort.InferenceSession.create(iforestBuf, { executionProviders: ['wasm'] });

        const xgboostRes = await fetch(`${API_BASE}/api/machines/${selectedMachineId}/models/xgboost`);
        const xgboostBuf = await xgboostRes.arrayBuffer();
        xgboostSessionRef.current = await ort.InferenceSession.create(xgboostBuf, { executionProviders: ['wasm'] });
        
        console.log(`Local ONNX models loaded successfully for ${selectedMachineId}`);
      } catch (err) {
        console.error('Failed to load local ONNX models:', err);
      }
    }

    loadLocalModels();
  }, [selectedMachineId, localInferenceEnabled]);

  // Establish WebSocket connection for active machine telemetry
  const wsUrl = selectedMachineId 
    ? `${WS_BASE}/ws/telemetry/${selectedMachineId}`
    : null;
    
  const { data: wsData, isConnected } = useWebSocket(wsUrl || `${WS_BASE}/ws/telemetry/dummy`);

  // Handle incoming live telemetry stream and execute local ONNX inference
  useEffect(() => {
    if (!wsData) return;

    const runLocalInference = async () => {
      const iforest = iforestSessionRef.current;
      const xgboost = xgboostSessionRef.current;
      const scaler = scalerRef.current;
      if (!iforest || !xgboost || !scaler) return;

      try {
        const sensorIds = scaler.sensor_ids;
        const sensors = wsData.sensors;

        // Verify sensor existence
        for (const sid of sensorIds) {
          if (!sensors[sid]) return;
        }

        // 1. Maintain buffer
        const buffers = sensorBuffersRef.current;
        for (const sid of sensorIds) {
          if (!buffers[sid]) buffers[sid] = [];
          buffers[sid].push(sensors[sid].value);
          if (buffers[sid].length > WINDOW_SIZE) {
            buffers[sid].shift();
          }
        }

        // 2. Extract features
        let rawFeatures = [];
        if (scaler.model_version === 'v2_temporal') {
          for (const sid of sensorIds) {
            const vals = buffers[sid];
            const feats = computeFeaturesFromWindow(vals);
            rawFeatures.push(...feats);
          }
        } else {
          for (const sid of sensorIds) {
            rawFeatures.push(sensors[sid].value);
          }
        }

        // 3. Scale features
        const scaled = scaleFeatures(rawFeatures, scaler);

        // 4. Run Isolation Forest
        const tensorInput = new ort.Tensor('float32', scaled, [1, scaled.length]);
        const iforestOutputs = await iforest.run({ float_input: tensorInput });
        const outputNames = Object.keys(iforestOutputs);
        const anomalyLabel = Number(iforestOutputs[outputNames[0]].data[0]);
        const decisionScore = Number(iforestOutputs[outputNames[1]].data[0]);
        const isAnomaly = anomalyLabel === -1;

        // 5. Run XGBoost Classifier
        const xgboostOutputs = await xgboost.run({ float_input: tensorInput });
        const xgbOutputNames = Object.keys(xgboostOutputs);
        const xgbLabel = Number(xgboostOutputs[xgbOutputNames[0]].data[0]);
        const xgbProbs = Array.from(xgboostOutputs[xgbOutputNames[1]].data);
        const maxProb = Math.max(...xgbProbs);

        setLocalAnalysis({
          predicted_state: xgbLabel,
          confidence: Math.round(maxProb * 1000) / 10,
          is_anomaly: isAnomaly,
          anomaly_score: Math.round(decisionScore * 10000) / 10000,
          probabilities: xgbProbs.map(p => Math.round(p * 10000) / 10000),
          alert_level: isAnomaly ? "critical" : "none"
        });
      } catch (err) {
        console.error('Local ONNX inference execution failed:', err);
      }
    };

    runLocalInference();

    setHistory((prev) => {
      const updated = [...prev, wsData];
      return updated.slice(-100);
    });
  }, [wsData]);

  const getAuthHeaders = (extraHeaders = {}) => {
    const token = localStorage.getItem('edgetwin_token');
    return {
      ...extraHeaders,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const setSandboxValue = async (sensorId, value) => {
    if (!selectedMachineId) return;
    try {
      await fetch(`${API_BASE}/api/machines/${selectedMachineId}/sandbox`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ sensor_id: sensorId, value })
      });
    } catch (err) {
      console.error('Failed to set sandbox value:', err);
    }
  };

  const resetSandbox = async () => {
    if (!selectedMachineId) return;
    try {
      await fetch(`${API_BASE}/api/machines/${selectedMachineId}/sandbox/reset`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      setIsSandboxActive(false);
    } catch (err) {
      console.error('Failed to reset sandbox:', err);
    }
  };

  const refreshMachines = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/machines`);
      const data = await res.json();
      setMachines(data);
    } catch (err) {
      console.error('Failed to refresh machine configs:', err);
    }
  };

  const selectedMachine = machines.find(m => m.machine_id === selectedMachineId) || null;

  // Use memoization to swap telemetry values if local edge inference is enabled
  const currentTelemetry = useMemo(() => {
    const raw = history[history.length - 1] || null;
    if (!raw) return null;
    if (localInferenceEnabled && localAnalysis) {
      return {
        ...raw,
        analysis: {
          ...raw.analysis,
          predicted_state: localAnalysis.predicted_state,
          confidence: localAnalysis.confidence,
          is_anomaly: localAnalysis.is_anomaly,
          anomaly_score: localAnalysis.anomaly_score,
          alert_level: localAnalysis.alert_level,
          detected_failure_modes: localAnalysis.is_anomaly ? raw.analysis?.detected_failure_modes : []
        }
      };
    }
    return raw;
  }, [history, localInferenceEnabled, localAnalysis]);

  return (
    <MachineContext.Provider value={{
      machines,
      selectedMachineId,
      setSelectedMachineId,
      selectedMachine,
      currentTelemetry,
      history,
      isConnected,
      loading,
      isSandboxActive,
      setIsSandboxActive,
      setSandboxValue,
      resetSandbox,
      refreshMachines,
      localInferenceEnabled,
      setLocalInferenceEnabled,
      localAnalysis,
      isSimulatingSafeState,
      setIsSimulatingSafeState
    }}>
      {children}
    </MachineContext.Provider>
  );
}

export function useMachine() {
  return useContext(MachineContext);
}

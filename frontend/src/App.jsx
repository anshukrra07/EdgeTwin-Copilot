import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MachineProvider, useMachine } from './context/MachineContext';
import MachineSelector from './components/MachineSelector';
import { API_BASE } from './config';
import HealthGauge from './components/HealthGauge';
import RULIndicator from './components/RULIndicator';
import ConfidenceBadge from './components/ConfidenceBadge';
import SensorChart from './components/SensorChart';
import AlertFeed from './components/AlertFeed';
import FailureMode from './components/FailureMode';
import HistoryTrend from './components/HistoryTrend';
import CopilotPanel from './components/CopilotPanel';
import StatusBar from './components/StatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import ThreeDigitalTwin from './components/ThreeDigitalTwin';
import MaintenanceSchedule from './components/MaintenanceSchedule';
import StatusBeacon from './components/StatusBeacon';
import SensorStrip from './components/SensorStrip';
import AssetGraph from './components/AssetGraph';
import MLOpsConsole from './components/MLOpsConsole';
import { Cpu, AlertCircle, RefreshCw, Zap, Box, Timer, Sliders, BrainCircuit, Settings, X, ChevronDown, Network } from 'lucide-react';

function Dashboard() {
  const { 
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
    resetSandbox,
    refreshMachines,
    localInferenceEnabled,
    setLocalInferenceEnabled
  } = useMachine();

  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isMlopsOpen, setIsMlopsOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('');

  const uniqueSites = useMemo(() => {
    const sitesMap = {};
    machines.forEach(m => {
      if (m.site_id && m.site_name) {
        sitesMap[m.site_id] = m.site_name;
      }
    });
    if (Object.keys(sitesMap).length === 0) {
      sitesMap['site_chicago'] = 'Chicago HQ Facility';
    }
    return Object.entries(sitesMap).map(([id, name]) => ({ site_id: id, site_name: name }));
  }, [machines]);

  useEffect(() => {
    if (uniqueSites.length > 0 && !selectedSiteId) {
      const currentMachine = machines.find(m => m.machine_id === selectedMachineId);
      if (currentMachine && currentMachine.site_id) {
        setSelectedSiteId(currentMachine.site_id);
      } else {
        setSelectedSiteId(uniqueSites[0].site_id);
      }
    }
  }, [uniqueSites, selectedMachineId, machines, selectedSiteId]);

  useEffect(() => {
    if (selectedMachineId) {
      const currentMachine = machines.find(m => m.machine_id === selectedMachineId);
      if (currentMachine && currentMachine.site_id && currentMachine.site_id !== selectedSiteId) {
        setSelectedSiteId(currentMachine.site_id);
      }
    }
  }, [selectedMachineId, machines, selectedSiteId]);

  // Automatically open the AI Advisor panel when a new anomaly is detected (using currentTelemetry with edge-inference override support)
  const isAnomaly = !!currentTelemetry?.analysis?.is_anomaly;
  const prevAnomalyRef = useRef(false);

  useEffect(() => {
    if (isAnomaly && !prevAnomalyRef.current) {
      setIsCopilotOpen(true);
    }
    prevAnomalyRef.current = isAnomaly;
  }, [isAnomaly]);

  const handleSiteChange = (siteId) => {
    setSelectedSiteId(siteId);
    const siteMachines = machines.filter(m => m.site_id === siteId);
    if (siteMachines.length > 0) {
      setSelectedMachineId(siteMachines[0].machine_id);
    }
  };

  const filteredMachines = useMemo(() => {
    return machines.filter(m => m.site_id === selectedSiteId);
  }, [machines, selectedSiteId]);

  const handleForceState = async (stateIdx) => {
    try {
      const token = localStorage.getItem('edgetwin_token');
      await fetch(`${API_BASE}/api/machines/${selectedMachineId}/state/${stateIdx}`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch (err) {
      console.error('Failed to force state:', err);
    }
  };

  const [tickInterval, setTickInterval] = useState(1.0);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings/interval`)
      .then(r => r.json())
      .then(d => setTickInterval(d.interval))
      .catch(() => {});
  }, []);

  const handleSetInterval = async (seconds) => {
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`${API_BASE}/api/settings/interval/${seconds}`, { 
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) setTickInterval(seconds);
    } catch (err) {
      console.error('Failed to set interval:', err);
    }
  };

  if (loading || !selectedMachine) {
    return (
      <div className="min-h-screen bg-[#02040a] flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-2 border-cyan-500/20 rounded-full animate-ping absolute inset-0"></div>
          <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin relative" />
        </div>
        <span className="text-base font-semibold animate-pulse tracking-wider">Loading Digital Twin...</span>
        <span className="text-xs text-slate-600">Initializing systems</span>
      </div>
    );
  }

  // Get current readings
  const healthScore = currentTelemetry?.analysis?.health_score ?? 100.0;
  const penalty = currentTelemetry?.analysis?.anomaly_penalty ?? 0.0;
  const baseHealth = healthScore + penalty;
  
  // Construct breakdown matching HealthGauge expectations
  const breakdown = {};
  if (currentTelemetry?.analysis?.sensor_health && selectedMachine?.sensors) {
    Object.entries(currentTelemetry.analysis.sensor_health).forEach(([sid, item]) => {
      const sConf = selectedMachine.sensors.find(s => s.sensor_id === sid);
      const weight = sConf ? sConf.weight_in_health : 0.0;
      breakdown[sid] = {
        type: item.type,
        value: item.value,
        health: item.health / 100.0,
        weight: weight
      };
    });
  }

  const rulDays = currentTelemetry?.analysis?.remaining_useful_life !== undefined
    ? Math.round((currentTelemetry.analysis.remaining_useful_life / 24) * 10) / 10
    : 30.0;
  const rulDaysLower = currentTelemetry?.analysis?.remaining_useful_life_lower !== undefined
    ? Math.round((currentTelemetry.analysis.remaining_useful_life_lower / 24) * 10) / 10
    : 24.0;
  const rulDaysUpper = currentTelemetry?.analysis?.remaining_useful_life_upper !== undefined
    ? Math.round((currentTelemetry.analysis.remaining_useful_life_upper / 24) * 10) / 10
    : 36.0;
  const confidence = currentTelemetry?.analysis?.confidence ?? 100.0;
  const state_method = "Exponential Degradation Curve (95% CI)";
  const state_trend = currentTelemetry?.analysis?.rul_trend ?? 'Stable';
  const failureModes = currentTelemetry?.analysis?.detected_failure_modes ?? [];
  const alertLevel = currentTelemetry?.analysis?.alert_level ?? 'none';
  const predictedState = currentTelemetry?.analysis?.predicted_state;

  return (
    <div 
      className="h-screen flex flex-col text-slate-200 overflow-hidden font-sans select-none"
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, rgba(6,182,212,0.05) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(59,130,246,0.04) 0%, transparent 60%), #03050c'
      }}
    >
      
      {/* ═══════════════════════════════════════════════════════════
          HEADER — Clean operator bar: Logo | Machine | Status | ⚙️
          ═══════════════════════════════════════════════════════════ */}
      <header className="relative px-5 py-3 bg-slate-950/90 border-b border-cyan-500/10 backdrop-blur-2xl flex items-center justify-between z-30 shrink-0">
        {/* Accent glow line */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${isSandboxActive ? 'bg-gradient-to-r from-transparent via-amber-500/80 to-transparent animate-pulse-live' : 'bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent'}`}></div>
        
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 p-2.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Box className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider bg-gradient-to-r from-white via-cyan-300 to-blue-400 bg-clip-text text-transparent">EdgeTwin Copilot</h1>
            {isSandboxActive && (
              <span className="text-[10px] font-mono font-bold text-amber-400 animate-pulse-live uppercase tracking-wider">⚠ TEST MODE ACTIVE</span>
            )}
          </div>
        </div>

        {/* Center: Site & Machine Selectors */}
        <div className="flex items-center gap-3">
          {/* Site Selector */}
          <div className="flex items-center gap-2 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-400">Site:</span>
            <select
              value={selectedSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer pr-4 focus:ring-0 text-sm"
              aria-label="Select facility site"
            >
              {uniqueSites.map((site) => (
                <option key={site.site_id} value={site.site_id} className="bg-slate-950 text-white">
                  {site.site_name}
                </option>
              ))}
            </select>
          </div>

          <MachineSelector 
            machines={filteredMachines}
            selectedMachineId={selectedMachineId}
            setSelectedMachineId={setSelectedMachineId}
            alertLevel={alertLevel}
            predictedState={predictedState}
          />
        </div>

        {/* Right: Status Beacon + Topology + Settings Gear */}
        <div className="flex items-center gap-4">
          <StatusBeacon 
            alertLevel={alertLevel}
            predictedState={predictedState}
            healthScore={healthScore}
          />
          
          <button
            onClick={() => {
              setIsGraphOpen(!isGraphOpen);
              setIsSettingsOpen(false);
            }}
            className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer touch-target ${
              isGraphOpen
                ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white hover:border-cyan-500/30'
            }`}
            title="Asset Topology Graph"
          >
            <Network className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => {
              setIsSettingsOpen(!isSettingsOpen);
              setIsGraphOpen(false);
            }}
            className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer touch-target ${
              isSettingsOpen
                ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white hover:border-cyan-500/30'
            }`}
            title="Admin Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          ASSET TOPOLOGY PANEL — Slide-down asset graph
          ═══════════════════════════════════════════════════════ */}
      {isGraphOpen && (
        <div className="settings-overlay bg-slate-950/95 border-b border-cyan-500/15 backdrop-blur-xl px-6 py-4 animate-slide-down shrink-0 z-20 flex justify-center">
          <div className="w-full max-w-4xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                Asset Dependency Topology (AAS)
              </h3>
              <button
                onClick={() => setIsGraphOpen(false)}
                className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors animate-fade-in"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ErrorBoundary title="Asset Graph Failure">
              <AssetGraph activeSiteId={selectedSiteId} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SETTINGS PANEL — Slide-down admin controls (hidden by default)
          ═══════════════════════════════════════════════════════ */}
      {isSettingsOpen && (
        <div className="settings-overlay bg-slate-950/95 border-b border-cyan-500/15 backdrop-blur-xl px-6 py-4 animate-slide-down shrink-0 z-20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              Admin Controls
            </h3>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            {/* What-If Sandbox */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <Sliders className={`w-4 h-4 ${isSandboxActive ? 'text-amber-400 animate-pulse-live' : 'text-cyan-400'}`} />
              <span className="text-xs font-bold text-slate-400 uppercase">Test Mode:</span>
              <button
                onClick={() => {
                  if (isSandboxActive) { resetSandbox(); } else { setIsSandboxActive(true); }
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border ${
                  isSandboxActive
                    ? 'bg-amber-600/90 text-white border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                    : 'bg-slate-950/80 text-cyan-400 border-cyan-500/15 hover:border-cyan-500/40'
                }`}
              >
                {isSandboxActive ? 'RESET & EXIT' : 'ENTER'}
              </button>
            </div>

            {/* Edge ML Toggle */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <Cpu className={`w-4 h-4 ${localInferenceEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-xs font-bold text-slate-400 uppercase">ML Engine:</span>
              <button
                onClick={() => setLocalInferenceEnabled(!localInferenceEnabled)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border ${
                  localInferenceEnabled
                    ? 'bg-emerald-600/90 text-white border-emerald-500'
                    : 'bg-slate-950/80 text-emerald-500/70 border-emerald-500/15 hover:border-emerald-500/40'
                }`}
              >
                {localInferenceEnabled ? 'CLIENT' : 'SERVER'}
              </button>
            </div>

            {/* AI Copilot Toggle */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <BrainCircuit className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-slate-400 uppercase">AI Advisor:</span>
              <button
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border ${
                  isCopilotOpen
                    ? 'bg-blue-600/90 text-white border-blue-500'
                    : 'bg-slate-950/80 text-blue-400 border-blue-500/15 hover:border-blue-500/40'
                }`}
              >
                {isCopilotOpen ? 'OPEN' : 'CLOSED'}
              </button>
            </div>

            {/* MLOps Console Trigger */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <BrainCircuit className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-400 uppercase">MLOps Loop:</span>
              <button
                onClick={() => {
                  setIsMlopsOpen(true);
                  setIsSettingsOpen(false);
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border bg-slate-950/80 text-cyan-400 border-cyan-500/15 hover:border-cyan-500/40"
              >
                OPEN CONSOLE
              </button>
            </div>

            {/* Sim Controls */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-400 uppercase">Simulate:</span>
              {[
                { idx: 0, label: 'Normal', color: 'hover:bg-emerald-600 text-emerald-400 hover:text-white border-emerald-500/20 hover:border-emerald-500' },
                { idx: 1, label: 'Warning', color: 'hover:bg-amber-600 text-amber-400 hover:text-white border-amber-500/20 hover:border-amber-500' },
                { idx: 2, label: 'Critical', color: 'hover:bg-red-600 text-red-400 hover:text-white border-red-500/20 hover:border-red-500' },
                { idx: 3, label: 'Failure', color: 'hover:bg-red-950 text-red-500 hover:text-white border-red-500/40 hover:border-red-500' }
              ].map(({ idx, label, color }) => (
                <button 
                  key={idx}
                  onClick={() => handleForceState(idx)} 
                  className={`text-xs font-bold bg-slate-950/80 ${color} px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tick Speed Control */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <Timer className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-400 uppercase">Speed:</span>
              {[0.5, 1, 2, 5].map((sec) => (
                <button
                  key={sec}
                  onClick={() => handleSetInterval(sec)}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer border ${
                    tickInterval === sec
                      ? 'bg-cyan-600 text-white border-cyan-500'
                      : 'bg-slate-950/80 text-cyan-400/70 border-cyan-500/15 hover:bg-cyan-900/40'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            {/* Operator Logout */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">
                Operator: <span className="text-cyan-400">{localStorage.getItem('edgetwin_username') || 'admin'}</span>
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem('edgetwin_token');
                  localStorage.removeItem('edgetwin_username');
                  window.location.reload();
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/40 text-red-400 border border-red-500/20 hover:bg-red-500/25 active:scale-95 transition-all duration-200 cursor-pointer"
              >
                LOG OUT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MAIN COMMAND CENTER — Single-screen, no-scroll grid layout
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* === LEFT COLUMN: Health + RUL + Confidence === */}
        <div className="w-[280px] shrink-0 flex flex-col gap-3 p-4 overflow-y-auto scrollbar-thin border-r border-white/5">
          
          {/* Health Gauge — Dominant visual */}
          <ErrorBoundary title="Health Gauge Failure">
            <HealthGauge 
              healthScore={healthScore} 
              baseHealth={baseHealth} 
              penalty={penalty} 
              breakdown={breakdown} 
            />
          </ErrorBoundary>

          {/* RUL Indicator */}
          <ErrorBoundary title="RUL Estimator Failure">
            <RULIndicator 
              rulDays={rulDays} 
              rulDaysLower={rulDaysLower}
              rulDaysUpper={rulDaysUpper}
              method={state_method} 
              trend={state_trend} 
            />
          </ErrorBoundary>

          {/* Confidence Badge */}
          <ErrorBoundary title="Confidence Indicator Failure">
            <ConfidenceBadge 
              confidence={confidence} 
              dataDrift={currentTelemetry?.analysis?.data_drift}
            />
          </ErrorBoundary>

          {/* Maintenance Schedule */}
          <ErrorBoundary title="Maintenance Schedule Failure">
            <MaintenanceSchedule 
              selectedMachine={selectedMachine}
              selectedMachineId={selectedMachineId}
              healthScore={healthScore}
              onLogService={refreshMachines}
            />
          </ErrorBoundary>
        </div>

        {/* === CENTER COLUMN: 3D Digital Twin === */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* 3D Twin — Takes most of the center */}
          <div className="flex-1 min-h-0 p-4 pb-2">
            <ErrorBoundary title="3D Digital Twin Viewer Failure">
              <ThreeDigitalTwin 
                selectedMachine={selectedMachine} 
                currentTelemetry={currentTelemetry}
              />
            </ErrorBoundary>
          </div>

          {/* Health Trend — Compact strip below 3D */}
          <div className="h-[180px] shrink-0 px-4 pb-2">
            <ErrorBoundary title="History Trend Failure">
              <HistoryTrend history={history} />
            </ErrorBoundary>
          </div>
        </div>

        {/* === RIGHT COLUMN: Alerts + Failure Modes + Copilot === */}
        <div className={`shrink-0 flex flex-col overflow-hidden border-l border-white/5 transition-all duration-300 ${isCopilotOpen ? 'w-[380px]' : 'w-[340px]'}`}>
          
          {isCopilotOpen ? (
            /* AI Copilot takes the right column when active */
            <ErrorBoundary title="Copilot Sidebar Failure">
              <CopilotPanel 
                machineId={selectedMachineId} 
                machineType={selectedMachine.machine_type}
                alertLevel={alertLevel} 
                onClose={() => setIsCopilotOpen(false)}
              />
            </ErrorBoundary>
          ) : (
            /* Alerts + Failure Modes when copilot is closed */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Alerts Panel */}
              <div className="flex-1 min-h-0 p-3">
                <ErrorBoundary title="Alert Feed Failure">
                  <AlertFeed machineId={selectedMachineId} />
                </ErrorBoundary>
              </div>

              {/* Failure Modes */}
              <div className="flex-1 min-h-0 p-3 pt-0">
                <ErrorBoundary title="Failure Mode Analytics Failure">
                  <FailureMode failureModes={failureModes} />
                </ErrorBoundary>
              </div>

              {/* Open Copilot button */}
              <div className="p-3 pt-0">
                <button
                  onClick={() => setIsCopilotOpen(true)}
                  className="w-full bg-blue-600/10 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 hover:text-blue-300 rounded-xl py-3 px-4 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm font-bold"
                >
                  <BrainCircuit className="w-5 h-5" />
                  Open AI Advisor
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SENSOR STRIP — Compact horizontal sensor readings
          ═══════════════════════════════════════════════════════ */}
      <ErrorBoundary title="Sensor Strip Failure">
        <SensorStrip 
          sensors={selectedMachine.sensors}
          currentTelemetry={currentTelemetry}
          history={history}
        />
      </ErrorBoundary>

      {/* ═══════════════════════════════════════════════════════
          STATUS BAR — Connection + System Time
          ═══════════════════════════════════════════════════════ */}
      <ErrorBoundary title="Status Bar Failure">
        <StatusBar isConnected={isConnected} />
      </ErrorBoundary>

      <ErrorBoundary title="MLOps Console Failure">
        <MLOpsConsole isOpen={isMlopsOpen} onClose={() => setIsMlopsOpen(false)} />
      </ErrorBoundary>
      
    </div>
  );
}

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('edgetwin_token', data.token);
        localStorage.setItem('edgetwin_username', data.username);
        onLoginSuccess();
      } else {
        setError(data.detail || 'Invalid username or password.');
      }
    } catch (err) {
      setError('Connection to security gateway failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#02040a] flex flex-col items-center justify-center relative p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.08) 0%, transparent 70%), #03050c'
      }}
    >
      {/* Decorative floating grids */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.007)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.007)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none"></div>

      <div className="w-full max-w-sm glass border border-cyan-500/20 rounded-3xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        {/* Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
        
        <div className="flex flex-col items-center text-center gap-2 mb-6">
          <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 p-3.5 rounded-2xl mb-1 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
            <Box className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-xl font-black tracking-wider text-white bg-gradient-to-r from-white via-cyan-300 to-blue-400 bg-clip-text text-transparent">EdgeTwin Control</h2>
          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Operator Security Gateway</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              className="w-full bg-slate-950/80 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/35 transition-all leading-none font-mono"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950/80 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-605 focus:outline-none focus:border-cyan-500/35 transition-all leading-none font-mono"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold p-3 rounded-xl uppercase tracking-wider font-mono text-center">
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-xs cursor-pointer tracking-wider uppercase shadow-[0_5px_15px_rgba(6,182,212,0.15)] border border-cyan-500/20 active:scale-[0.98]"
          >
            {loading ? 'Authorizing...' : 'Establish Connection'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
            Edge Server: online
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('edgetwin_token'));

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <MachineProvider>
      <Dashboard />
    </MachineProvider>
  );
}

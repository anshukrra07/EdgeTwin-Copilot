import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, Loader2, Play, CheckCircle, AlertTriangle, ShieldCheck, Printer, X, Download, Power, Wrench, Send, RotateCcw } from 'lucide-react';
import { useMachine } from '../context/MachineContext';
import { API_BASE } from '../config';

function CopilotPanel({ machineId, machineType, alertLevel, onClose }) {
  const { currentTelemetry, selectedMachine, refreshMachines, isSimulatingSafeState, setIsSimulatingSafeState } = useMachine();
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [lastAnalyzedId, setLastAnalyzedId] = useState('');
  const [actionStatus, setActionStatus] = useState(''); // acknowledged, overridden, escalated, approved_work_order
  const [operatorNotes, setOperatorNotes] = useState('');
  const [lastAnalyzedKey, setLastAnalyzedKey] = useState('');

  const messagesEndRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const downloadRemediationCode = async () => {
    if (!machineId) return;
    try {
      const res = await fetch(`${API_BASE}/api/machines/${machineId}/remediation`);
      const data = await res.json();
      if (data.success && data.code) {
        const blob = new Blob([data.code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', data.filename || 'remediation_safe_state.gcode');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download remediation code:', err);
    }
  };

  const triggerAnalysis = async (force = false) => {
    if (!machineId) return;
    setLoading(true);
    setActionStatus('');
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`${API_BASE}/api/copilot/explain`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ machine_id: machineId, force, operator_notes: operatorNotes })
      });
      const data = await res.json();
      setExplanation(data.explanation);
      setLastAnalyzedId(machineId);

      // Create initial chat logs
      const isAnomaly = !!currentTelemetry?.analysis?.is_anomaly;
      const initialMsgs = [{ sender: 'copilot', text: data.explanation, type: 'text' }];
      if (isAnomaly) {
        initialMsgs.push({ sender: 'system', type: 'remediation' });
        initialMsgs.push({ sender: 'system', type: 'maintenance' });
      }
      setMessages(initialMsgs);
    } catch (err) {
      console.error('Failed to run copilot analysis:', err);
      setExplanation('### ERROR\nFailed to reach the EdgeTwin Copilot GenAI inference service.');
      setMessages([{ sender: 'copilot', text: '### ERROR\nFailed to reach the EdgeTwin Copilot GenAI inference service.', type: 'text' }]);
    } finally {
      setLoading(false);
    }
  };

  // Send conversational chat messages
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !machineId) return;

    const userText = chatInput;
    setChatInput('');
    setLoading(true);

    const newMessages = [...messages, { sender: 'user', text: userText, type: 'text' }];
    setMessages(newMessages);

    try {
      const token = localStorage.getItem('edgetwin_token');
      const historyPayload = newMessages
        .filter(m => m.type === 'text')
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

      const res = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          machine_id: machineId,
          messages: historyPayload,
          operator_notes: operatorNotes
        })
      });

      const data = await res.json();
      if (data.success) {
        let updatedMessages = [...newMessages, { sender: 'copilot', text: data.reply, type: 'text' }];

        // Check if backend executed an action tag
        if (data.executed_action) {
          const act = data.executed_action;
          updatedMessages.push({
            sender: 'system',
            text: act.message,
            type: 'action_log',
            metadata: act
          });

          // Trigger local state refreshes & downloads based on actions
          if (act.type === 'RESET_SANDBOX' || act.type === 'DISPATCH_WORK_ORDER') {
            await refreshMachines();
            setIsSimulatingSafeState(false);
          } else if (act.type === 'TRIGGER_SAFE_STATE') {
            setIsSimulatingSafeState(true);
            downloadRemediationCode();
          } else if (act.type === 'SET_INTERVAL' || act.type === 'FORCE_STATE') {
            await refreshMachines();
          }
        }

        setMessages(updatedMessages);
      } else {
        setMessages([...newMessages, { sender: 'copilot', text: '### Error\nFailed to get a response from Copilot.', type: 'text' }]);
      }
    } catch (err) {
      console.error('Failed to send chat message:', err);
      setMessages([...newMessages, { sender: 'copilot', text: '### Error\nConnection to EdgeTwin Copilot service lost.', type: 'text' }]);
    } finally {
      setLoading(false);
    }
  };

  // Send conversational direct command from quick chips
  const sendDirectCommand = async (commandText) => {
    if (loading || !machineId) return;
    setLoading(true);

    const newMessages = [...messages, { sender: 'user', text: commandText, type: 'text' }];
    setMessages(newMessages);

    try {
      const token = localStorage.getItem('edgetwin_token');
      const historyPayload = newMessages
        .filter(m => m.type === 'text')
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

      const res = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          machine_id: machineId,
          messages: historyPayload,
          operator_notes: operatorNotes
        })
      });

      const data = await res.json();
      if (data.success) {
        let updatedMessages = [...newMessages, { sender: 'copilot', text: data.reply, type: 'text' }];

        // Check if backend executed an action tag
        if (data.executed_action) {
          const act = data.executed_action;
          updatedMessages.push({
            sender: 'system',
            text: act.message,
            type: 'action_log',
            metadata: act
          });

          // Trigger local state refreshes & downloads based on actions
          if (act.type === 'RESET_SANDBOX' || act.type === 'DISPATCH_WORK_ORDER') {
            await refreshMachines();
            setIsSimulatingSafeState(false);
          } else if (act.type === 'TRIGGER_SAFE_STATE') {
            setIsSimulatingSafeState(true);
            downloadRemediationCode();
          } else if (act.type === 'SET_INTERVAL' || act.type === 'FORCE_STATE') {
            await refreshMachines();
          }
        }

        setMessages(updatedMessages);
      } else {
        setMessages([...newMessages, { sender: 'copilot', text: '### Error\nFailed to get a response from Copilot.', type: 'text' }]);
      }
    } catch (err) {
      console.error('Failed to send direct command:', err);
      setMessages([...newMessages, { sender: 'copilot', text: '### Error\nConnection to EdgeTwin Copilot service lost.', type: 'text' }]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-trigger explanation on anomaly detection or status changes
  useEffect(() => {
    if (!machineId || !currentTelemetry) return;

    const isAnomaly = !!currentTelemetry?.analysis?.is_anomaly;
    const detectedModes = currentTelemetry?.analysis?.detected_failure_modes || [];
    let activeFailureMode = null;
    let highestMatchPct = 0;
    detectedModes.forEach(mode => {
      if (mode.match_percentage > highestMatchPct) {
        highestMatchPct = mode.match_percentage;
        activeFailureMode = mode.failure_mode;
      }
    });

    const eventKey = `${isAnomaly}_${alertLevel}_${activeFailureMode}`;

    if (isAnomaly) {
      if (eventKey !== lastAnalyzedKey) {
        setLastAnalyzedKey(eventKey);
        triggerAnalysis();
      }
    } else {
      if (lastAnalyzedKey !== '') {
        setLastAnalyzedKey('');
      }
    }
  }, [currentTelemetry?.analysis?.is_anomaly, alertLevel, currentTelemetry?.analysis?.detected_failure_modes, machineId, lastAnalyzedKey]);

  // Reset explanation and history when changing machine
  useEffect(() => {
    setExplanation('');
    setLastAnalyzedId('');
    setActionStatus('');
    setOperatorNotes('');
    setMessages([]);
    setLastAnalyzedKey('');
  }, [machineId]);

  // Mappings of failure modes to part IDs
  const FAILURE_MODE_PARTS = {
    air_compressor: {
      bearing_wear: "SP-AC-01",
      pressure_leakage: "SP-AC-04",
      lubrication_failure: "SP-AC-03",
    },
    cnc_machine: {
      tool_breakage: "SP-CNC-01",
      spindle_bearing_failure: "SP-CNC-02",
      coolant_system_failure: "SP-CNC-03",
      axis_misalignment: "SP-CNC-04",
    }
  };

  // Get active failure mode
  const detectedModes = currentTelemetry?.analysis?.detected_failure_modes || [];
  let activeFailureMode = null;
  let highestMatchPct = 0;
  detectedModes.forEach(mode => {
    if (mode.match_percentage > highestMatchPct) {
      highestMatchPct = mode.match_percentage;
      activeFailureMode = mode.failure_mode;
    }
  });

  const partId = (machineType && activeFailureMode) ? FAILURE_MODE_PARTS[machineType]?.[activeFailureMode] : null;
  const sparePart = selectedMachine?.spare_parts?.find(p => p.part_id === partId);

  // Timeline based on RUL
  const rulVal = currentTelemetry?.analysis?.remaining_useful_life ?? 720;
  let suggestedTimeline = "Scheduled (Within 7 Days)";
  if (rulVal < 72 || alertLevel === 'critical' || alertLevel === 'failure') {
    suggestedTimeline = "Immediate (Within 24 Hours)";
  } else if (rulVal < 240 || alertLevel === 'warning') {
    suggestedTimeline = "Urgent (Within 3 Days)";
  }

  const getWorkOrderAction = () => {
    if (machineType === 'air_compressor') {
      if (activeFailureMode === 'bearing_wear') {
        return "Replace V-Belt Drive Rubber Belt (SP-AC-01) and inspect drive pulley alignment.";
      }
      if (activeFailureMode === 'pressure_leakage') {
        return "Inspect pressure vessel seams, check PRV safety valve operation, and replace PRV discharge pipe.";
      }
      if (activeFailureMode === 'lubrication_failure') {
        return "Flush pump crankcase oil, replace lubricating oil (SP-AC-03), and inspect seals.";
      }
      return "Perform comprehensive air compressor diagnostics, verify piping integrity, and inspect belt drive.";
    } else { // cnc_machine
      if (activeFailureMode === 'tool_breakage') {
        return "Replace drill bit / milling cutter tool (SP-CNC-01) and recalibrate tool offsets.";
      }
      if (activeFailureMode === 'spindle_bearing_failure') {
        return "Inspect spindle head housing, replace spindle shaft bearing (SP-CNC-02), and check runout.";
      }
      if (activeFailureMode === 'coolant_system_failure') {
        return "Clean chip tray, inspect coolant nozzle flow, and flush coolant pump line.";
      }
      if (activeFailureMode === 'axis_misalignment') {
        return "Inspect gantry guide rails, check ball screw lubrication, and calibrate axis home sensors.";
      }
      return "Perform CNC milling spindle alignment check, guide rail inspection, and coolant pump flush.";
    }
  };

  const workOrderActionText = getWorkOrderAction();
  const workOrderId = `WO-${machineId}-${(lastAnalyzedId || machineId).slice(-3)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const handleApproveWorkOrder = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`${API_BASE}/api/machines/${machineId}/maintenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ action: workOrderActionText })
      });
      if (res.ok) {
        setActionStatus('approved_work_order');
        setMessages(prev => [
          ...prev, 
          {
            sender: 'system',
            text: `Approved & Dispatched Work Order ${workOrderId}. Telemetry sandbox overrides reset to normal. Spare part stock updated.`,
            type: 'action_log',
            metadata: { type: 'DISPATCH_WORK_ORDER', success: true }
          }
        ]);
        await refreshMachines();
        setIsSimulatingSafeState(false);
      } else if (res.status === 401) {
        alert("Unauthorized: Please log in using the administrator control panel to approve work orders.");
      }
    } catch (err) {
      console.error('Failed to approve agentic work order:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearChatHistory = () => {
    setMessages([]);
    setExplanation('');
    setActionStatus('');
  };

  const renderFormattedExplanation = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let currentSection = null;
    let sectionKey = 0;

    const formatInlineText = (txt) => {
      const parts = txt.split(/\*\*(.*?)\*\*/g);
      return parts.map((part, index) => {
        if (index % 2 === 1) {
          return <strong key={index} className="font-extrabold text-white text-[11px]">{part}</strong>;
        }
        return part;
      });
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('###') || trimmed.includes('DIAGNOSTIC REPORT') || trimmed.includes('SYSTEM ACTION') || trimmed.includes('WORK ORDER') || trimmed.includes('RETRAINING') || trimmed.includes('ERROR')) {
        const titleText = trimmed.replace(/###\s*/, '').replace(/🛠️\s*/, '').replace(/🔄\s*/, '').replace(/🔧\s*/, '').replace(/🧠\s*/, '');
        elements.push(
          <div key={`header-${sectionKey++}`} className="border-b border-white/10 pb-2 mb-2 mt-1">
            <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
              {titleText}
            </h4>
          </div>
        );
        return;
      }

      const sectionMatch = trimmed.match(/^\*\*(ROOT CAUSE|RISK ASSESSMENT|RECOMMENDED ACTION|CONSEQUENCE OF INACTION|ADDITIONAL OPERATOR OBSERVATIONS)\*\*$/i);
      const numberedMatch = trimmed.match(/^(?:###\s*|\*\*)?(\d+\.\s*[A-Z\s_]+)(?:\*\*)?$/i);

      if (sectionMatch || numberedMatch) {
        const title = sectionMatch ? sectionMatch[1] : numberedMatch[1];
        if (currentSection) {
          elements.push(currentSection);
        }
        currentSection = {
          title: title.replace(/^\d+\.\s*/, ''),
          contentLines: []
        };
      } else {
        if (currentSection) {
          currentSection.contentLines.push(trimmed);
        } else {
          elements.push(
            <p key={`loose-${sectionKey++}`} className="text-[11px] text-slate-350 leading-relaxed font-sans mb-2">
              {formatInlineText(trimmed)}
            </p>
          );
        }
      }
    });

    if (currentSection) {
      elements.push(currentSection);
    }

    return (
      <div className="space-y-3">
        {elements.map((el, idx) => {
          if (React.isValidElement(el)) return el;
          
          return (
            <div key={idx} className="bg-gradient-to-br from-slate-950/90 to-slate-900/60 border border-white/5 rounded-xl p-3 card-hover">
              <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5 font-mono">{el.title}</h4>
              <div className="space-y-1.5">
                {el.contentLines.map((contentLine, cIdx) => (
                  <p key={cIdx} className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    {formatInlineText(contentLine)}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-[380px] bg-slate-900/65 border-l border-white/10 backdrop-blur-md flex flex-col h-full shrink-0 relative">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between no-print shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-blue-400 animate-pulse" />
          <div>
            <h3 className="font-bold text-white text-sm">Agentic AI Copilot</h3>
            <span className="text-[9px] text-slate-500 font-mono">Sense-Think-Act Controller</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={clearChatHistory}
            className="text-slate-500 hover:text-slate-300 p-1 transition-colors cursor-pointer"
            title="Clear Chat Logs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <span className="text-[9px] font-bold text-emerald-500 px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
            ONLINE
          </span>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 transition-colors cursor-pointer"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Advisory Feed - Chat Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center py-10 leading-relaxed font-mono px-4">
            <BrainCircuit className="w-8 h-8 text-slate-700 mb-3 animate-pulse" />
            Ready for industrial analysis.<br/>
            Click "Manual Diagnostics" below or trigger an anomaly to initiate diagnostic agent chat.
          </div>
        )}

        {messages.map((msg, index) => {
          if (msg.sender === 'user') {
            return (
              <div key={index} className="flex justify-end">
                <div className="max-w-[85%] bg-blue-600/15 border border-blue-500/20 rounded-2xl px-3.5 py-2.5 text-xs text-slate-200 font-sans shadow-md leading-relaxed">
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.sender === 'copilot') {
            return (
              <div key={index} className="flex justify-start">
                <div className="w-full max-w-[95%] space-y-2">
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 font-mono">
                    <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
                    <span>COPILOT DIAGNOSIS</span>
                  </div>
                  <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-4 text-xs text-slate-200 font-sans shadow-md relative overflow-hidden">
                    {renderFormattedExplanation(msg.text)}
                  </div>
                </div>
              </div>
            );
          }

          // System components inside the chat feed
          if (msg.sender === 'system') {
            if (msg.type === 'remediation') {
              return (
                <div key={index} className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden mb-1">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20 animate-pulse-live"></div>
                  
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-1.5 rounded-lg shrink-0">
                      <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse-live" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider font-mono">
                        Industrial Control Remediation
                      </h4>
                      <p className="text-[10px] text-slate-400 font-sans mt-0.5 leading-relaxed">
                        Automatic safety shutdown script generated.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-white/5 rounded-lg p-2.5 mb-3">
                    <span className="text-[9px] font-bold text-slate-500 block mb-1 uppercase font-mono tracking-wider">Sequence Code:</span>
                    <ul className="text-[10px] text-slate-300 font-mono space-y-1 pl-1 list-none">
                      {machineType === 'cnc_machine' ? (
                        <>
                          <li><span className="text-amber-500/80">▸</span> G90 ; Absolute coordinates</li>
                          <li><span className="text-amber-500/80">▸</span> M05 ; Halt spindle rotation</li>
                          <li><span className="text-amber-500/80">▸</span> G00 Z10.0 ; Retract head</li>
                          <li><span className="text-amber-500/80">▸</span> M09 / M30 ; End program</li>
                        </>
                      ) : (
                        <>
                          <li><span className="text-amber-500/80">▸</span> Main Motor Contactor: OFF</li>
                          <li><span className="text-amber-500/80">▸</span> Cooling Fan Contact: KEEP ON</li>
                          <li><span className="text-amber-500/80">▸</span> Solenoid Valve: FORCE CLOSED</li>
                          <li><span className="text-amber-500/80">▸</span> Exhaust Bypass: OPEN BLEED</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={downloadRemediationCode}
                      className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer border border-amber-500/20 shadow-[0_4px_12px_rgba(245,158,11,0.15)]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download {machineType === 'cnc_machine' ? 'G-Code (.gcode)' : 'PLC ST Logic (.st)'}</span>
                    </button>

                    <button
                      onClick={() => setIsSimulatingSafeState(prev => !prev)}
                      className={`w-full font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer border shadow-md ${
                        isSimulatingSafeState 
                          ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white border-red-500/20 shadow-[0_4px_12px_rgba(239,68,68,0.2)] animate-pulse-live'
                          : 'bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white border-cyan-500/20 shadow-[0_4px_12px_rgba(6,182,212,0.15)]'
                      }`}
                    >
                      <Power className={`w-3.5 h-3.5 ${isSimulatingSafeState ? 'animate-spin' : ''}`} style={isSimulatingSafeState ? { animationDuration: '3s' } : {}} />
                      <span>{isSimulatingSafeState ? 'Abort Safe-State Sim' : 'Simulate Safe-State Shutdown'}</span>
                    </button>
                  </div>
                </div>
              );
            }

            if (msg.type === 'maintenance') {
              return (
                <div key={index} className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-blue-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden text-left mb-1">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/20 via-blue-500 to-blue-500/20 animate-pulse-live"></div>
                  
                  <div className="flex items-start gap-2 mb-2.5">
                    <div className="bg-blue-500/10 border border-blue-500/30 p-1 rounded-lg shrink-0">
                      <Wrench className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-wider font-mono">
                        Agentic Maintenance Planner
                      </h4>
                      <p className="text-[8px] text-slate-400 font-sans mt-0.5 leading-relaxed">
                        Sense → Think → Act autonomous planning sequence.
                      </p>
                    </div>
                  </div>

                  {/* Step 1: BOM Stock Check */}
                  <div className="bg-slate-950/60 border border-white/5 rounded-lg p-2 mb-2">
                    <div className="text-[8px] font-bold text-slate-500 mb-1 uppercase font-mono tracking-wider flex justify-between">
                      <span>Step 1: BOM Stock Check</span>
                      {sparePart ? (
                        sparePart.stock > 0 ? (
                          <span className="text-emerald-400 font-bold">IN STOCK</span>
                        ) : (
                          <span className="text-red-400 font-bold">OUT (AUTO-PO TRIGGERED)</span>
                        )
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </div>
                    {sparePart ? (
                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className="text-slate-350 truncate pr-2" title={sparePart.name}>
                          {sparePart.name}
                        </span>
                        <span className={`font-bold shrink-0 ${sparePart.stock > 0 ? 'text-emerald-400' : 'text-red-400 animate-pulse'}`}>
                          Qty: {sparePart.stock}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[9px] font-mono text-slate-500 italic">
                        No direct spare part replacement required.
                      </div>
                    )}
                  </div>

                  {/* Step 2: Work Order Draft */}
                  <div className="bg-slate-950/60 border border-white/5 rounded-lg p-2 mb-2.5 space-y-1">
                    <div className="text-[8px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                      Step 2: Draft Work Order
                    </div>
                    <div className="text-[9px] font-mono space-y-0.5">
                      <div className="flex justify-between text-[8px]">
                        <span className="text-slate-550">ID:</span>
                        <span className="text-slate-300 font-bold">{workOrderId}</span>
                      </div>
                      <div className="flex justify-between text-[8px]">
                        <span className="text-slate-550">Timeline:</span>
                        <span className={`font-bold ${suggestedTimeline.includes('Immediate') ? 'text-red-400 animate-pulse' : suggestedTimeline.includes('Urgent') ? 'text-amber-400' : 'text-cyan-400'}`}>
                          {suggestedTimeline}
                        </span>
                      </div>
                      <div className="text-[8px] text-slate-550 pt-0.5">Recommended Action:</div>
                      <p className="text-[9px] text-slate-350 bg-slate-900/50 p-1.5 rounded leading-normal font-sans border border-white/5">
                        {workOrderActionText}
                      </p>
                    </div>
                  </div>

                  {/* Step 3: Approve & Execute */}
                  <button
                    onClick={handleApproveWorkOrder}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer border border-blue-500/20 shadow-[0_4px_12px_rgba(59,130,246,0.15)] active:scale-98 animate-pulse-live"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve & Dispatch Work Order</span>
                  </button>
                </div>
              );
            }

            if (msg.type === 'action_log') {
              return (
                <div key={index} className="flex justify-center my-1">
                  <div className="bg-slate-950/80 border border-emerald-500/25 rounded-xl py-2 px-3 flex items-center gap-2 max-w-[90%] shadow-[0_2px_8px_rgba(16,185,129,0.1)]">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                    <div className="text-left">
                      <span className="text-[9px] text-emerald-400 font-black tracking-wider uppercase font-mono block">System Action Log</span>
                      <span className="text-[10px] text-slate-350 font-sans leading-relaxed block">{msg.text}</span>
                    </div>
                  </div>
                </div>
              );
            }
          }

          return null;
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 bg-slate-950/20 border border-white/5 rounded-2xl px-3.5 py-2.5 text-xs text-slate-400 font-sans shadow-md">
              <Loader2 className="w-3.5 h-3.5 text-blue-450 animate-spin" />
              <span className="animate-pulse">Copilot is thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Glove-friendly Quick Action Chips */}
      {machineId && (
        <div className="px-3 pb-2 pt-1.5 flex flex-wrap gap-1.5 shrink-0 select-none border-t border-white/5 bg-slate-950/20 no-print">
          {currentTelemetry?.analysis?.is_anomaly && (
            <button
              type="button"
              onClick={handleApproveWorkOrder}
              disabled={loading}
              className="text-[9px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/25 px-2 py-0.5 rounded transition-colors cursor-pointer"
            >
              🔧 Dispatch Work Order
            </button>
          )}
          <button
            type="button"
            onClick={() => sendDirectCommand("Clear all sensor overrides")}
            disabled={loading}
            className="text-[9px] font-bold bg-slate-800/40 hover:bg-slate-800/70 text-slate-300 border border-white/5 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            🔄 Clear Overrides
          </button>
          <button
            type="button"
            onClick={() => sendDirectCommand("Set simulator tick interval to 1.0s")}
            disabled={loading}
            className="text-[9px] font-bold bg-slate-800/40 hover:bg-slate-800/70 text-slate-300 border border-white/5 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            ⏱️ Set Interval 1s
          </button>
          <button
            type="button"
            onClick={() => sendDirectCommand("Retrain the machine learning models")}
            disabled={loading}
            className="text-[9px] font-bold bg-slate-800/40 hover:bg-slate-805 text-slate-300 border border-white/5 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            🧠 Retrain ML
          </button>
          <button
            type="button"
            onClick={() => sendDirectCommand("Halt operations / emergency shutdown")}
            disabled={loading}
            className="text-[9px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-450 border border-amber-500/25 px-2 py-0.5 rounded transition-colors cursor-pointer"
          >
            🛑 Safe-State Pause
          </button>
        </div>
      )}

      {/* Input Form Footer */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 bg-slate-950/40 flex gap-2 items-center shrink-0 no-print">
        <input 
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask Copilot or request action..."
          className="flex-1 bg-slate-900/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-605 focus:outline-none focus:border-blue-500/35 transition-all font-sans"
          disabled={loading || !machineId}
        />
        <button
          type="submit"
          disabled={loading || !chatInput.trim() || !machineId}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold p-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
          title="Send message"
        >
          <Send className="w-3.5 h-3.5 fill-current" />
        </button>
      </form>

      {/* Legacy Trigger Footer (Runs diagnostic sequence manually) */}
      <div className="p-3 bg-slate-950/50 border-t border-white/5 flex gap-2 justify-between shrink-0 no-print">
        <button
          onClick={() => triggerAnalysis(true)}
          disabled={loading || !machineId}
          className="flex-1 bg-slate-950 hover:bg-slate-900 border border-white/5 hover:border-blue-500/20 disabled:bg-slate-950 disabled:text-slate-600 text-slate-350 font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs cursor-pointer"
        >
          <Play className="w-3 h-3 fill-current text-blue-400" />
          <span>Manual Diagnostics</span>
        </button>
        <button
          onClick={() => window.print()}
          disabled={messages.length === 0}
          className="bg-slate-950 hover:bg-slate-900 border border-white/5 disabled:opacity-40 text-slate-400 hover:text-slate-200 font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs cursor-pointer"
          title="Print Diagnostic Report"
        >
          <Printer className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
}

export default React.memo(CopilotPanel);

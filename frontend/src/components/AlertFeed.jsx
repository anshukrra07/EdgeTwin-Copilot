import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AlertTriangle, Bell, BellOff, CheckCircle } from 'lucide-react';

function AlertFeed({ machineId }) {
  const [alerts, setAlerts] = useState([]);
  const { data: wsMessage } = useWebSocket('ws://localhost:8000/ws/alerts');

  // Fetch initial alerts on mount or machine change
  useEffect(() => {
    if (!machineId) return;
    
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/machines/${machineId}/alerts`);
        if (res.ok) {
          const data = await res.json();
          setAlerts(data);
        }
      } catch (err) {
        console.error('Failed to fetch initial alerts:', err);
      }
    };
    
    fetchAlerts();
  }, [machineId]);

  // Handle incoming live alerts
  useEffect(() => {
    if (!wsMessage) return;

    if (wsMessage.event_type === 'new_alert') {
      const alert = wsMessage.alert || wsMessage;
      // Filter alert to matching active machine
      if (alert.machine_id !== machineId && wsMessage.machine_id !== machineId) return;

      setAlerts(prev => {
        // Avoid duplicate alerts by ID
        if (prev.some(a => a.alert_id === alert.alert_id)) return prev;
        return [alert, ...prev].slice(0, 50); // Sliding window max 50
      });
    } else if (wsMessage.event_type === 'alert_acknowledged') {
      setAlerts(prev => prev.map(a => 
        a.alert_id === wsMessage.alert_id ? { ...a, acknowledged: true } : a
      ));
    }
  }, [wsMessage, machineId]);

  const getAlertBorderColor = (level) => {
    if (level === 'critical') return 'border-l-red-500 bg-red-950/20';
    if (level === 'warning') return 'border-l-amber-500 bg-amber-950/10';
    return 'border-l-blue-500 bg-blue-950/10';
  };

  const handleAcknowledge = async (alertId) => {
    try {
      const token = localStorage.getItem('edgetwin_token');
      await fetch(`http://localhost:8000/api/machines/${machineId}/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-blue-400" />
          Alerts
        </h3>
        {alerts.length > 0 && (
          <button 
            onClick={() => setAlerts([])} 
            className="text-[10px] uppercase font-bold text-slate-500 hover:text-white transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-1.5">
            <BellOff className="w-6 h-6 opacity-30" />
            <span className="text-xs">All clear — no alerts</span>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.alert_id}
              className={`flex items-start justify-between border border-white/5 border-l-4 rounded-xl p-3 transition-all ${getAlertBorderColor(alert.level)} ${alert.acknowledged ? 'opacity-40' : ''}`}
            >
              <div className="flex gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${alert.level === 'critical' ? 'text-red-500' : alert.level === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} />
                <div>
                  <div className="text-sm font-bold text-slate-200">{alert.message}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{new Date(alert.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>

              {!alert.acknowledged ? (
                <button
                  onClick={() => handleAcknowledge(alert.alert_id)}
                  className="bg-slate-850 hover:bg-emerald-600 text-slate-400 hover:text-white border border-white/10 rounded p-1 transition-colors group min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="Acknowledge alert"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
              ) : (
                <span className="text-[9px] font-bold text-emerald-500 uppercase flex items-center gap-0.5 py-0.5 px-1 bg-emerald-500/10 border border-emerald-500/20 rounded">
                  ACKED
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default React.memo(AlertFeed);

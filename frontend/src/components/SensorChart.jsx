import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useMachine } from '../context/MachineContext';

const SensorChartVisual = React.memo(function SensorChartVisual({
  chartData,
  sensor_id,
  gradientColors,
  warning_threshold,
  critical_threshold
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={150}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad_${sensor_id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={gradientColors.start} stopOpacity={0.2} />
            <stop offset="95%" stopColor={gradientColors.end} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="time" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
        <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '10px', fontSize: '11px' }}
          labelStyle={{ color: '#94a3b8', fontSize: '9px' }}
          itemStyle={{ color: '#ffffff', fontWeight: 'bold' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={gradientColors.start}
          strokeWidth={2}
          fillOpacity={1}
          fill={`url(#grad_${sensor_id})`}
          isAnimationActive={false}
        />
        {/* Warning line */}
        <ReferenceLine y={warning_threshold} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />
        {/* Critical line */}
        <ReferenceLine y={critical_threshold} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
      </AreaChart>
    </ResponsiveContainer>
  );
});

export default function SensorChart({ sensorConfig, history }) {
  const { sensor_id, type, unit, warning_threshold, critical_threshold } = sensorConfig;
  const { isSandboxActive, setSandboxValue } = useMachine();

  // Real-time latest reading for labels (updates instantly on every tick)
  const latestTelemetry = history[history.length - 1];
  const latestReading = latestTelemetry?.sensors?.[sensor_id];
  const latestVal = latestReading ? latestReading.value : null;
  const displayVal = latestVal !== null && latestVal !== undefined ? (typeof latestVal === 'number' ? latestVal.toFixed(1) : latestVal) : 'N/A';

  // Throttled history data for the SVG chart rendering (prevents layout thrashing)
  const [throttledHistory, setThrottledHistory] = useState(history);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    // Allow SVG chart updates at most once every 2 seconds
    if (now - lastUpdateRef.current >= 2000) {
      setThrottledHistory(history);
      lastUpdateRef.current = now;
    } else {
      const remaining = 2000 - (now - lastUpdateRef.current);
      const timer = setTimeout(() => {
        setThrottledHistory(history);
        lastUpdateRef.current = Date.now();
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [history]);

  const [zoomLevel, setZoomLevel] = useState(30);

  // Process throttled history points for Recharts — memoized to prevent unnecessary visual re-renders
  const chartData = useMemo(() => {
    const data = throttledHistory.map(h => {
      const reading = h.sensors[sensor_id];
      return {
        time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        value: reading ? reading.value : null
      };
    });
    return data.slice(-zoomLevel);
  }, [throttledHistory, sensor_id, zoomLevel]);

  // Calculate sandbox slider bounds dynamically
  const norm_min = sensorConfig.normal_range[0];
  const norm_max = sensorConfig.normal_range[1];
  const minVal = Math.min(norm_min, warning_threshold, critical_threshold);
  const maxVal = Math.max(norm_max, warning_threshold, critical_threshold);
  const padding = (maxVal - minVal) * 0.25 || 10.0;
  const sliderMin = Math.max(0.0, minVal - padding);
  const sliderMax = maxVal + padding;

  const [sliderVal, setSliderVal] = useState(latestVal || norm_min);
  const [isSliding, setIsSliding] = useState(false);

  // Sync slider state with incoming telemetry if NOT sliding
  useEffect(() => {
    if (!isSliding && latestVal !== null && latestVal !== undefined) {
      setSliderVal(latestVal);
    }
  }, [latestVal, isSliding]);

  const handleSliderChange = (e) => {
    const newVal = parseFloat(e.target.value);
    setSliderVal(newVal);
    setSandboxValue(sensor_id, newVal);
  };

  // Determine status from health data or threshold comparison
  const getStatus = () => {
    if (latestVal === null || latestVal === undefined) return 'normal';
    const wt = warning_threshold;
    const ct = critical_threshold;
    if (ct > wt) {
      if (latestVal >= ct) return 'critical';
      if (latestVal >= wt) return 'warning';
    } else {
      if (latestVal <= ct) return 'critical';
      if (latestVal <= wt) return 'warning';
    }
    return 'normal';
  };

  const status = getStatus();

  const getStatusColor = (s) => {
    if (s === 'critical') return 'text-red-500 bg-red-500/10 border-red-500/20';
    if (s === 'warning') return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
  };

  const getGradientColor = (s) => {
    if (s === 'critical') return { start: '#ef4444', end: '#ef4444' };
    if (s === 'warning') return { start: '#f59e0b', end: '#f59e0b' };
    return { start: '#3b82f6', end: '#3b82f6' };
  };

  const gradientColors = useMemo(() => getGradientColor(status), [status]);

  return (
    <div className={`bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col transition-all duration-300 card-hover ${isSandboxActive ? 'h-[295px] border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'h-[240px]'}`}>
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{type}</span>
          <h4 className="text-lg font-black text-white leading-none mt-0.5">
            {displayVal} <span className="text-[10px] text-slate-500 font-medium">{unit}</span>
          </h4>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-950/80 border border-white/5 rounded-lg overflow-hidden p-0.5">
            {[15, 30, 100].map((points) => (
              <button
                key={points}
                onClick={() => setZoomLevel(points)}
                className={`px-1.5 py-0.5 text-[8px] font-bold font-mono rounded transition-all cursor-pointer ${
                  zoomLevel === points 
                    ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/25' 
                    : 'text-slate-550 hover:text-slate-355 border border-transparent'
                }`}
                title={`Show last ${points} readings`}
              >
                {points === 100 ? 'ALL' : `${points}s`}
              </button>
            ))}
          </div>

          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-full ${getStatusColor(status)}`}>
            {status}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[80px] min-w-[150px]">
        <SensorChartVisual
          chartData={chartData}
          sensor_id={sensor_id}
          gradientColors={gradientColors}
          warning_threshold={warning_threshold}
          critical_threshold={critical_threshold}
        />
      </div>

      {isSandboxActive && (
        <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1.5 animate-fade-in">
          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>Min: {sliderMin.toFixed(1)}</span>
            <span className="text-amber-400 font-bold">Override: {sliderVal.toFixed(1)} {unit}</span>
            <span>Max: {sliderMax.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={(sliderMax - sliderMin) / 100}
            value={sliderVal}
            onMouseDown={() => setIsSliding(true)}
            onTouchStart={() => setIsSliding(true)}
            onMouseUp={() => setIsSliding(false)}
            onTouchEnd={() => setIsSliding(false)}
            onChange={handleSliderChange}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 outline-none"
          />
        </div>
      )}
    </div>
  );
}

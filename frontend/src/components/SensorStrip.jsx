import React, { useState, useMemo, useCallback } from 'react';
import {
  Thermometer,
  Activity,
  Gauge,
  Zap,
  RotateCw,
  Droplets,
  Loader,
  Wrench,
  ArrowRight,
  X,
  BarChart3,
} from 'lucide-react';
import SensorChart from './SensorChart';

/* ═══════════════════════════════════════════
   Lookup Maps
   ═══════════════════════════════════════════ */

const SENSOR_ICONS = {
  temperature: Thermometer,
  vibration: Activity,
  pressure: Gauge,
  power_consumption: Zap,
  rpm: RotateCw,
  coolant_flow: Droplets,
  spindle_load: Loader,
  tool_wear: Wrench,
  feed_rate: ArrowRight,
};

const SENSOR_NAMES = {
  temperature: 'Temperature',
  vibration: 'Vibration',
  pressure: 'Pressure',
  power_consumption: 'Power',
  rpm: 'RPM',
  coolant_flow: 'Coolant',
  spindle_load: 'Spindle',
  tool_wear: 'Tool Wear',
  feed_rate: 'Feed Rate',
};

function getSensorName(type) {
  return SENSOR_NAMES[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

function getSensorIcon(type) {
  return SENSOR_ICONS[type] || BarChart3;
}

/* ═══════════════════════════════════════════
   Status helpers
   ═══════════════════════════════════════════ */

function getSensorStatus(value, warning_threshold, critical_threshold) {
  if (value == null) return 'normal';

  // Determine threshold direction
  if (critical_threshold > warning_threshold) {
    // Higher = worse (e.g., temperature, vibration)
    if (value >= critical_threshold) return 'critical';
    if (value >= warning_threshold) return 'warning';
    return 'normal';
  }
  // Lower = worse (e.g., coolant flow)
  if (value <= critical_threshold) return 'critical';
  if (value <= warning_threshold) return 'warning';
  return 'normal';
}

const STATUS_STYLES = {
  normal: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    barColor: '#10b981',
  },
  warning: {
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/8',
    dot: 'bg-amber-500',
    text: 'text-amber-400',
    barColor: '#f59e0b',
  },
  critical: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/8',
    dot: 'bg-red-500',
    text: 'text-red-400',
    barColor: '#ef4444',
  },
};

/* ═══════════════════════════════════════════
   Mini progress bar
   Visualises where the value sits relative to
   normal_range → warning → critical thresholds.
   ═══════════════════════════════════════════ */

function MiniBar({ value, normal_range, warning_threshold, critical_threshold, barColor }) {
  // Build a unified scale from the absolute minimum to absolute maximum
  const allVals = [
    ...(normal_range || []),
    warning_threshold,
    critical_threshold,
    value,
  ].filter((v) => v != null && !isNaN(v));

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));

  return (
    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   SensorPill (individual sensor tile)
   ═══════════════════════════════════════════ */

const SensorPill = React.memo(function SensorPill({ sensor, value, unit, status, onClick }) {
  const styles = STATUS_STYLES[status] || STATUS_STYLES.normal;
  const Icon = getSensorIcon(sensor.type);
  const name = getSensorName(sensor.type);
  const displayVal = value != null ? (typeof value === 'number' ? value.toFixed(1) : value) : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group flex flex-col gap-1 px-3.5 py-2.5 rounded-xl border backdrop-blur-sm
        transition-all duration-200 cursor-pointer min-w-[130px] max-w-[180px]
        hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]
        ${styles.border} ${styles.bg}
      `}
      style={{ minHeight: 76 }}
      aria-label={`View ${name} chart`}
    >
      {/* Top row: icon + name + status dot */}
      <div className="flex items-center gap-1.5 w-full">
        <Icon className={`w-4 h-4 flex-shrink-0 ${styles.text}`} strokeWidth={2} />
        <span className="text-xs font-semibold text-slate-300 truncate">{name}</span>
        <span className={`ml-auto w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className="text-[18px] font-black text-white leading-none tabular-nums">
          {displayVal}
        </span>
        <span className="text-[11px] text-slate-500 font-medium">{unit}</span>
      </div>

      {/* Mini progress bar */}
      <MiniBar
        value={value ?? 0}
        normal_range={sensor.normal_range}
        warning_threshold={sensor.warning_threshold}
        critical_threshold={sensor.critical_threshold}
        barColor={styles.barColor}
      />
    </button>
  );
});

/* ═══════════════════════════════════════════
   Expanded chart overlay
   ═══════════════════════════════════════════ */

function ChartOverlay({ sensor, history, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 glass-strong rounded-2xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
          aria-label="Close chart"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="mb-3">
          <h3 className="text-lg font-bold text-white">
            {getSensorName(sensor.type)}
          </h3>
          <p className="text-xs text-slate-500">
            {sensor.sensor_id} · {sensor.unit}
          </p>
        </div>

        {/* Full SensorChart */}
        <div className="h-[300px]">
          <SensorChart sensorConfig={sensor} history={history} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SensorStrip (main export)
   ═══════════════════════════════════════════ */

function SensorStrip({ sensors = [], currentTelemetry = {}, history = [] }) {
  const [expandedSensorId, setExpandedSensorId] = useState(null);

  const handlePillClick = useCallback((sensorId) => {
    setExpandedSensorId((prev) => (prev === sensorId ? null : sensorId));
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setExpandedSensorId(null);
  }, []);

  /* Resolve current values + statuses */
  const pillData = useMemo(() => {
    return sensors.map((sensor) => {
      const sensorTel = currentTelemetry?.sensors?.[sensor.sensor_id];
      const value = sensorTel?.value ?? null;
      const status = getSensorStatus(value, sensor.warning_threshold, sensor.critical_threshold);
      return { sensor, value, status };
    });
  }, [sensors, currentTelemetry]);

  const expandedSensor = expandedSensorId
    ? sensors.find((s) => s.sensor_id === expandedSensorId) ?? null
    : null;

  return (
    <>
      {/* Strip container */}
      <div className="bg-slate-900/60 border-t border-white/5 px-4 py-3">
        <div className="flex flex-wrap gap-2.5">
          {pillData.map(({ sensor, value, status }) => (
            <SensorPill
              key={sensor.sensor_id}
              sensor={sensor}
              value={value}
              unit={sensor.unit}
              status={status}
              onClick={() => handlePillClick(sensor.sensor_id)}
            />
          ))}
          {pillData.length === 0 && (
            <span className="text-sm text-slate-600 italic py-2">No sensors configured</span>
          )}
        </div>
      </div>

      {/* Expanded chart overlay */}
      {expandedSensor && (
        <ChartOverlay
          sensor={expandedSensor}
          history={history}
          onClose={handleCloseOverlay}
        />
      )}
    </>
  );
}

export default React.memo(SensorStrip);

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

const HistoryTrendVisual = React.memo(function HistoryTrendVisual({ trendData }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={150}>
      <LineChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
        <YAxis stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
          labelStyle={{ color: '#94a3b8', fontSize: '10px' }}
          itemStyle={{ color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default function HistoryTrend({ history }) {
  // Throttled history data for the SVG chart rendering
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

  // Format data for Recharts using throttled history — memoized to avoid redundant renders
  const trendData = useMemo(() => {
    return throttledHistory.map(h => ({
      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      score: h.analysis ? h.analysis.health_score : 100
    }));
  }, [throttledHistory]);

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-400 flex items-center gap-1.5 mb-3">
        <TrendingUp className="w-4 h-4 text-blue-400" />
        Health Trend
      </h3>

      <div className="flex-1 w-full h-full min-h-0">
        <HistoryTrendVisual trendData={trendData} />
      </div>
    </div>
  );
}

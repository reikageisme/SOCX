import React, { useMemo, useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ShieldAlert, Download, Activity } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface HeaderStatsProps {
  totalAttacks: number;
}

export const HeaderStats: React.FC<HeaderStatsProps> = ({ totalAttacks }) => {
  const { threatEvents } = useStore();
  
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => {
    const buckets = 20;
    const bucketSizeMs = 5000;
    const result = Array.from({ length: buckets }, (_, i) => ({
      time: i,
      value: 0
    }));

    threatEvents.forEach(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const diffMs = now - eventTime;
      if (diffMs >= 0 && diffMs < buckets * bucketSizeMs) {
        const bucketIndex = buckets - 1 - Math.floor(diffMs / bucketSizeMs);
        if (bucketIndex >= 0 && bucketIndex < buckets) {
          result[bucketIndex].value += 1;
        }
      }
    });
    return result;
  }, [threatEvents, now]);

  const handleExport = () => {
    // In a real implementation, this would use html2canvas to capture the map
    alert("Snapshot export functionality will capture the current map state.");
  };

  return (
    <div className="h-16 bg-[#0a0f1d] border-b border-gray-800 flex items-center justify-between px-6 shrink-0 z-20 shadow-lg">
      <div className="flex items-center gap-8">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/20 p-2 rounded-lg">
            <Activity className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-wider text-white uppercase font-inter leading-none">
              ACE CYBER SECURITY
            </h1>
            <span className="text-xs font-semibold text-cyan-500 uppercase tracking-[0.2em] mt-1">
              Live Threat Map
            </span>
          </div>
        </div>

        {/* Global Attacks Counter */}
        <div className="flex items-center gap-4 ml-12 border-l border-gray-800 pl-8">
          <div className="flex flex-col">
            <span className="text-cyan-500/70 font-bold tracking-[0.1em] text-[10px] uppercase mb-1 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              Global Attacks Today
            </span>
            <span className="text-3xl font-black text-white tracking-tight leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {totalAttacks.toLocaleString()}
            </span>
          </div>
          
          <div className="w-48 h-10 opacity-80 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#06b6d4" fillOpacity={1} fill="url(#colorUv)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 bg-transparent border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 px-5 py-2 rounded-sm text-sm font-bold uppercase tracking-wider transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Snapshot
        </button>
      </div>
    </div>
  );
};

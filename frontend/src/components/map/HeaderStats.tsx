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
    alert("Snapshot export functionality will capture the current map state.");
  };

  return (
    <div className="h-20 bg-transparent flex items-center justify-between px-8 z-20">
      <div className="flex items-center gap-12">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              {/* Radware style dots logo simulation */}
              <div className="grid grid-cols-3 gap-0.5">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i % 2 === 0 ? 'bg-cyan-500' : 'bg-red-500'}`}></div>
                ))}
              </div>
              <h1 className="text-[22px] font-black tracking-wider text-white lowercase font-inter leading-none">
                ace<span className="text-gray-400 font-normal">security</span>
              </h1>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 ml-6">
              Powered by ACE's<br/>Threat Intelligence
            </span>
          </div>
        </div>

        {/* Global Attacks Counter (moved right) */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-cyan-500 font-bold tracking-[0.1em] text-[10px] uppercase mb-1">
              Global Attacks Today
            </span>
            <span className="text-3xl font-black text-white tracking-tight leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {totalAttacks.toLocaleString()}
            </span>
          </div>
          
          <div className="w-32 h-8 opacity-80 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#06b6d4" fillOpacity={1} fill="url(#colorUv)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="bg-red-900/30 border border-red-800 text-red-500 hover:bg-red-900/50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors mr-2">
          Read 2026 Threat Report
        </button>
        <button 
          onClick={handleExport}
          className="bg-red-600 text-white hover:bg-red-700 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
        >
          Export Snapshot
        </button>
      </div>
    </div>
  );
};

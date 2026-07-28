import React, { useMemo, useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ShieldAlert } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface HeaderStatsProps {
  totalAttacks: number;
}

export const HeaderStats: React.FC<HeaderStatsProps> = ({ totalAttacks }) => {
  const { threatEvents } = useStore();
  
  // Force a re-render every second to update the graph based on Date.now()
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const chartData = useMemo(() => {
    const buckets = 20;
    const bucketSizeMs = 5000; // 5 seconds per bucket
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
  return (
    <div className="h-20 bg-[#0f1423] border-b border-gray-800 flex items-center justify-between px-6 shrink-0 z-10 shadow-lg">
      <div className="flex items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-soc-alert font-bold tracking-widest text-sm mb-1">
            <ShieldAlert className="w-4 h-4" />
            ATTACKS TODAY
          </div>
          <div className="text-4xl font-black text-white tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalAttacks.toLocaleString()}
          </div>
        </div>
        
        <div className="w-48 h-12 opacity-70">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#EF4444" fillOpacity={1} fill="url(#colorUv)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Placeholder for future global controls */}
      </div>
    </div>
  );
};

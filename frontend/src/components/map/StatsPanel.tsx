import { useMemo, useState } from 'react';
import type { ThreatEvent } from './ThreatMapLayout';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface StatsPanelProps {
  events: ThreatEvent[];
  isCollapsed?: boolean;
  onToggle?: () => void;
}

// Function to convert country code or name to emoji flag (simple heuristic)
const getFlagEmoji = (countryName: string) => {
  if (!countryName || countryName === 'Unknown' || countryName === 'Local') return '🏳️';
  // This is a placeholder. In a real app we'd map ISO codes to emoji.
  const map: Record<string, string> = {
    'United States': '🇺🇸', 'China': '🇨🇳', 'Russia': '🇷🇺', 'Brazil': '🇧🇷', 
    'Vietnam': '🇻🇳', 'Germany': '🇩🇪', 'France': '🇫🇷', 'India': '🇮🇳',
    'North Korea': '🇰🇵', 'South Korea': '🇰🇷', 'Japan': '🇯🇵', 'UK': '🇬🇧'
  };
  return map[countryName] || '🏳️';
};

export const StatsPanel: React.FC<StatsPanelProps> = ({ events, isCollapsed = false, onToggle }) => {
  const [interval, setInterval] = useState<'1h' | '24h' | '7d'>('1h');
  
  // In a full implementation, changing 'interval' would fetch historical data from /api/v1/incidents
  // For now, we calculate stats based on the live events passed in (or we could fetch if needed).
  // We use the live events to maintain "giữ nguyên nguồn dữ liệu thật đã có".

  const topSources = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.source.country] = (counts[e.source.country] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const topTargets = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.dest?.country || 'Unknown'] = (counts[e.dest?.country || 'Unknown'] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const topVectors = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const type = e.source_kind === 'global_threat_feed' ? 'Threat Intel Match' : e.type;
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const total = Math.max(events.length, 1);

  const renderPanel = (title: string, data: [string, number][]) => (
    <div className="mb-6">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] border-b border-gray-700/50 pb-2 mb-3">
        {title}
      </h3>
      <div className="space-y-3">
        {data.map(([label, count], i) => (
          <div key={label} className="text-sm">
            <div className="flex justify-between items-center text-gray-300 mb-1">
              <div className="flex items-center gap-2 truncate">
                <span className="text-gray-500 font-mono text-xs w-4">{i + 1}.</span>
                {title.includes('ATTACK') && !title.includes('VECTORS') && (
                  <span className="text-base leading-none">{getFlagEmoji(label)}</span>
                )}
                <span className="font-semibold text-xs truncate">{label}</span>
              </div>
              <span className="text-cyan-500 font-mono text-xs">{((count / total) * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full bg-[#1a2138] rounded-none h-1.5 overflow-hidden">
              <div className="bg-cyan-500 h-full shadow-[0_0_8px_#06b6d4]" style={{ width: `${(count / total) * 100}%` }}></div>
            </div>
          </div>
        ))}
        {data.length === 0 && <div className="text-xs text-gray-600 uppercase tracking-widest mt-4">No data available</div>}
      </div>
    </div>
  );

  return (
    <div className={`transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-[320px]'} bg-transparent flex flex-col z-10 relative overflow-hidden`}>
      <button 
        onClick={onToggle}
        className="absolute -left-6 top-4 bg-cyan-900/40 text-cyan-500 rounded-sm p-1 shadow-lg border border-cyan-800 hover:bg-cyan-800 z-50 transition-colors"
      >
        {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      <div className={`flex flex-col h-full overflow-hidden ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'} transition-opacity duration-300`}>
        <div className="flex-1 flex flex-col bg-[#050810]/60 backdrop-blur-sm border border-gray-800/60 rounded-sm shadow-2xl overflow-y-auto custom-scrollbar p-5">
          <h2 className="text-cyan-500 font-bold uppercase tracking-widest mb-6 border-b border-gray-800/50 pb-4">
            Live Cyber Threat Map
          </h2>
          
          {/* STATISTICS INTERVAL */}
          <div className="mb-6">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Statistics Interval</h3>
            <div className="relative">
              <select 
                value={interval}
                onChange={(e) => setInterval(e.target.value as any)}
                className="w-full bg-transparent border border-cyan-900/50 text-cyan-400 text-sm rounded-sm px-3 py-2 appearance-none outline-none focus:border-cyan-500 transition-colors cursor-pointer"
              >
                <option value="1h" className="bg-[#0a0f1d]">1 hour</option>
                <option value="24h" className="bg-[#0a0f1d]">24 hours</option>
                <option value="7d" className="bg-[#0a0f1d]">7 days</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-700">
                ▼
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            {renderPanel("Top Attackers", topSources)}
            {renderPanel("Top Attacked", topTargets)}
            {renderPanel("Top Network Attack Vectors", topVectors)}
          </div>
        </div>
      </div>
    </div>
  );
};

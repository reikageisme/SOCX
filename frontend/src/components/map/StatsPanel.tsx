import React, { useMemo } from 'react';
import type { ThreatEvent } from './ThreatMapLayout';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface StatsPanelProps {
  events: ThreatEvent[];
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ events, isCollapsed = false, onToggle }) => {
  const latestEvents = useMemo(() => events.slice(-5).reverse(), [events]);
  
  const topSources = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.source.country] = (counts[e.source.country] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const topTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const topTargets = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.dest?.country || 'Unknown'] = (counts[e.dest?.country || 'Unknown'] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const total = events.length || 1; // Prevent division by zero

  const renderProgress = (val: number, max: number, color: string) => (
    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${(val / max) * 100}%` }}></div>
    </div>
  );

  return (
    <div className={`transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-80'} bg-[#0f1423]/95 backdrop-blur-md border-l border-gray-800 flex flex-col z-10 shadow-2xl relative overflow-hidden`}>
      {onToggle && (
        <button 
          onClick={onToggle}
          className="absolute -left-3 top-8 bg-soc-accent text-white rounded-full p-1 shadow-lg border-2 border-soc-dark hover:bg-soc-accent/80 z-50 transition-colors"
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      )}

      <div className={`p-6 overflow-y-auto custom-scrollbar h-full ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'} transition-opacity duration-300`}>
        <div className="space-y-8 min-w-[270px]">
        
        {/* Top Sources */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Top Attack Sources</h3>
          <div className="space-y-3">
            {topSources.map(([country, count], i) => (
              <div key={country} className="text-sm">
                <div className="flex justify-between text-gray-300">
                  <span className="font-semibold">{i + 1}. {country}</span>
                  <span className="text-gray-500 font-mono">{((count / total) * 100).toFixed(0)}%</span>
                </div>
                {renderProgress(count, topSources[0]![1], 'bg-soc-alert')}
              </div>
            ))}
            {topSources.length === 0 && <div className="text-xs text-gray-600">No data available</div>}
          </div>
        </div>

        {/* Top Targets */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Top Targeted Countries</h3>
          <div className="space-y-3">
            {topTargets.map(([country, count], i) => (
              <div key={country} className="text-sm">
                <div className="flex justify-between text-gray-300">
                  <span className="font-semibold">{i + 1}. {country}</span>
                  <span className="text-gray-500 font-mono">{((count / total) * 100).toFixed(0)}%</span>
                </div>
                {renderProgress(count, topTargets[0]![1], 'bg-soc-accent')}
              </div>
            ))}
            {topTargets.length === 0 && <div className="text-xs text-gray-600">No data available</div>}
          </div>
        </div>

        {/* Top Types */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Top Attack Types</h3>
          <div className="space-y-4">
            {topTypes.map(([type, count], i) => (
              <div key={type} className="text-sm">
                <div className="flex justify-between text-gray-300">
                  <span className="font-semibold">{type}</span>
                  <span className="text-gray-500 font-mono">{((count / total) * 100).toFixed(0)}%</span>
                </div>
                {renderProgress(count, topTypes[0]![1], 'bg-soc-warning')}
              </div>
            ))}
            {topTypes.length === 0 && <div className="text-xs text-gray-600">No data available</div>}
          </div>
        </div>
        
        </div>
      </div>
    </div>
  );
};

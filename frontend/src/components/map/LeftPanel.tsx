import React from 'react';
import type { ThreatEvent } from './ThreatMapLayout';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LeftPanelProps {
  events: ThreatEvent[];
  activeLayers: string[];
  setActiveLayers: (layers: string[]) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ events, activeLayers, setActiveLayers, isCollapsed, onToggle }) => {
  const toggleLayer = (layer: string) => {
    if (activeLayers.includes(layer)) {
      setActiveLayers(activeLayers.filter(l => l !== layer));
    } else {
      setActiveLayers([...activeLayers, layer]);
    }
  };

  const layers = [
    { id: 'malicious_ip', label: 'Malware / Malicious IP', color: 'bg-red-500' },
    { id: 'Phishing', label: 'Phishing', color: 'bg-purple-500' },
    { id: 'Exploit', label: 'Exploit', color: 'bg-orange-500' },
    { id: 'DDoS', label: 'DDoS', color: 'bg-blue-500' },
    { id: 'SQL Injection', label: 'SQL Injection', color: 'bg-emerald-500' },
  ];

  return (
    <div className={`transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-80'} bg-[#0a0f1d]/95 backdrop-blur-md border-r border-gray-800 flex flex-col z-10 shadow-2xl relative`}>
      <button 
        onClick={onToggle}
        className="absolute -right-3 top-8 bg-cyan-500 text-white rounded-full p-1 shadow-lg border-2 border-[#0a0f1d] hover:bg-cyan-400 z-50 transition-colors"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`flex flex-col h-full overflow-hidden ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'} transition-opacity duration-300`}>
        {/* ATTACK TYPES */}
        <div className="p-6 pb-4 border-b border-gray-800/50">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4">Attack Types</h3>
          <div className="space-y-3">
            {layers.map(layer => (
              <label key={layer.id} className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center">
                  <input 
                    type="checkbox"
                    className="sr-only"
                    checked={activeLayers.includes(layer.id)}
                    onChange={() => toggleLayer(layer.id)}
                  />
                  <div className={`w-4 h-4 border rounded transition-colors ${activeLayers.includes(layer.id) ? 'border-cyan-500 bg-cyan-500/20' : 'border-gray-600 bg-transparent group-hover:border-gray-400'}`}>
                    {activeLayers.includes(layer.id) && (
                      <svg className="w-3 h-3 text-cyan-400 absolute top-0.5 left-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${layer.color} shadow-[0_0_8px_currentColor] opacity-80`} />
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors font-medium">
                    {layer.label}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* THREAT ALERTS */}
        <div className="flex-1 overflow-hidden flex flex-col pt-4">
          <h3 className="px-6 text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-3">Threat Alerts</h3>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 space-y-1 custom-scrollbar pb-4">
            {events.map((event) => (
              <div key={event.id} className="p-3 bg-[#13192b]/50 hover:bg-[#1a2138] rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-gray-700/50 mb-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-gray-500 font-mono tracking-wider">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                    event.type === 'Malware' || event.type === 'malicious_ip' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    event.type === 'Phishing' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                    event.type === 'Exploit' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  }`}>
                    {event.source_kind === 'global_threat_feed' ? 'INTEL' : event.type}
                  </span>
                </div>
                
                {event.source_kind === 'global_threat_feed' ? (
                  <div className="flex flex-col text-sm">
                    <span className="font-medium text-gray-300 truncate">
                      {event.source.country} • {event.reported_by}
                    </span>
                    <span className="text-[11px] text-cyan-500/70 truncate mt-0.5">
                      {event.malware_family !== 'Unknown' ? event.malware_family : 'Malicious IP'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span className="font-medium text-gray-300 w-10 truncate">{event.source.country}</span>
                    <span className="text-cyan-500/50 text-[10px]">▶</span>
                    <span className="font-medium text-white w-10 truncate">{event.dest?.country}</span>
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <div className="p-6 text-center text-gray-600 text-xs uppercase tracking-widest mt-10 border border-dashed border-gray-800 rounded-lg mx-2">Listening for threats...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

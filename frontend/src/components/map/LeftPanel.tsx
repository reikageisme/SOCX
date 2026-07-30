import React from 'react';
import type { ThreatEvent } from './ThreatMapLayout';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LeftPanelProps {
  events: ThreatEvent[];
  activeLayers: string[];
  setActiveLayers: (layers: string[]) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onEventClick?: (event: ThreatEvent) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ events, activeLayers, setActiveLayers, isCollapsed, onToggle, onEventClick }) => {
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
    <div className={`transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-[320px]'} bg-transparent flex flex-col z-10 relative`}>
      <button 
        onClick={onToggle}
        className="absolute -right-6 top-4 bg-cyan-900/40 text-cyan-500 rounded-sm p-1 shadow-lg border border-cyan-800 hover:bg-cyan-800 z-50 transition-colors"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`flex flex-col h-full overflow-hidden ${isCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'} transition-opacity duration-300 gap-6`}>
        {/* ATTACK TYPES */}
        <div className="bg-[#050810]/60 backdrop-blur-sm border border-gray-800/60 rounded-sm p-5 shadow-2xl">
          <h3 className="text-cyan-500 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            Attack Types
          </h3>
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
                  <div className={`w-4 h-4 border rounded-full transition-colors ${activeLayers.includes(layer.id) ? 'border-cyan-500' : 'border-gray-600 group-hover:border-gray-400'}`}>
                    {activeLayers.includes(layer.id) && (
                      <div className={`w-2 h-2 rounded-full absolute top-1 left-1 ${layer.color}`}></div>
                    )}
                  </div>
                </div>
                <span className={`text-[13px] font-semibold tracking-wide ${activeLayers.includes(layer.id) ? 'text-white' : 'text-gray-500'} group-hover:text-white transition-colors`}>
                  {layer.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* THREAT ALERTS */}
        <div className="flex-1 flex flex-col bg-[#050810]/60 backdrop-blur-sm border border-gray-800/60 rounded-sm shadow-2xl overflow-hidden">
          <h3 className="text-cyan-500 font-bold uppercase tracking-widest p-5 pb-2">
            Threat Alerts
          </h3>
          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2 custom-scrollbar">
            {events.map((event) => (
              <div 
                key={event.id} 
                onClick={() => onEventClick && onEventClick(event)}
                className="group cursor-pointer border-b border-gray-800/50 pb-2 mb-2 last:border-0 hover:bg-white/5 transition-colors p-2 -mx-2 rounded"
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                    event.type === 'Malware' || event.type === 'malicious_ip' ? 'bg-red-500' :
                    event.type === 'Phishing' ? 'bg-purple-500' :
                    event.type === 'Exploit' ? 'bg-orange-500' : 'bg-cyan-500'
                  }`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-300 text-[12px] font-medium leading-snug break-words">
                      {event.source_kind === 'global_threat_feed' ? (
                        <>Intel: {event.source.country} <span className="opacity-50">({event.reported_by})</span></>
                      ) : (
                        <>Local: {event.source.country} → {event.dest?.country}</>
                      )}
                    </div>
                    <div className="text-gray-500 text-[10px] mt-0.5 font-mono">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })} • {event.type}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center text-gray-600 text-xs uppercase tracking-widest mt-10">Waiting for alerts...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

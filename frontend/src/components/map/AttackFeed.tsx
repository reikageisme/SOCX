import React from 'react';
import type { ThreatEvent } from './ThreatMapLayout';

export const AttackFeed: React.FC<{ events: ThreatEvent[] }> = ({ events }) => {
  return (
    <div className="w-80 bg-[#0f1423]/95 backdrop-blur-md border-r border-gray-800 flex flex-col z-10 shadow-2xl relative">
      <div className="p-4 border-b border-gray-800 bg-black/20">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Live Attack Feed</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 custom-scrollbar">
        {events.map((event) => (
          <div key={event.id} className="p-3 hover:bg-white/5 rounded transition-colors group cursor-pointer border border-transparent hover:border-gray-700">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-gray-500 font-mono">
                {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                event.type === 'Malware' || event.type === 'malicious_ip' ? 'bg-red-500/20 text-red-400' :
                event.type === 'Phishing' ? 'bg-purple-500/20 text-purple-400' :
                event.type === 'Exploit' ? 'bg-orange-500/20 text-orange-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {event.source_kind === 'global_threat_feed' ? 'INTEL' : event.type}
              </span>
            </div>
            
            {event.source_kind === 'global_threat_feed' ? (
              <div className="flex flex-col text-sm">
                <span className="font-semibold text-gray-300 truncate">
                  {event.source.country} • {event.reported_by}
                </span>
                <span className="text-[10px] text-soc-muted truncate">
                  {event.malware_family !== 'Unknown' ? event.malware_family : 'Malicious IP'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-300 w-8 truncate">{event.source.country}</span>
                <span className="text-gray-600 text-xs">→</span>
                <span className="font-semibold text-white w-8 truncate">{event.dest?.country}</span>
                <span className="text-[10px] text-soc-muted truncate flex-1 text-right">Local</span>
              </div>
            )}
          </div>
        ))}
        {events.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-sm">Waiting for events...</div>
        )}
      </div>
    </div>
  );
};

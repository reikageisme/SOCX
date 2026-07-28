import React from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import type { ThreatEvent } from './ThreatMapLayout';

const typeColors: Record<string, string> = {
  'Malware': '#EF4444',    // red
  'Phishing': '#A855F7',   // purple
  'Exploit': '#F97316',    // orange
  'DDoS': '#3B82F6',       // blue
  'SQL Injection': '#EAB308', // yellow
  'malicious_ip': '#EF4444' // red
};

export const ThreatPoint = React.memo(({ event }: { event: ThreatEvent }) => {
  const color = typeColors[event.type] || '#A855F7';

  return (
    <>
      <CircleMarker
        center={[event.source.lat, event.source.lng]}
        radius={6}
        pathOptions={{
          color: color,
          fillColor: color,
          fillOpacity: 0.4,
          weight: 2,
          className: 'global-threat-pulse'
        }}
      >
        <Popup>
          <div className="text-sm text-gray-800 space-y-1">
            <div className="font-bold text-soc-alert mb-1 uppercase text-xs tracking-wider border-b pb-1">
              Global Threat Intel
            </div>
            <div><strong>Location:</strong> {event.source.country || 'Unknown'}</div>
            <div><strong>Reported By:</strong> {event.reported_by || 'Unknown'}</div>
            <div><strong>Malware Family:</strong> {event.malware_family || 'N/A'}</div>
            <div><strong>Confidence:</strong> {Math.round((event.confidence || 0) * 100)}%</div>
          </div>
        </Popup>
      </CircleMarker>
      
      {/* Outer subtle ring */}
      <CircleMarker
        center={[event.source.lat, event.source.lng]}
        radius={12}
        pathOptions={{
          color: color,
          fillColor: 'transparent',
          weight: 1,
          opacity: 0.3,
        }}
        interactive={false}
      />
    </>
  );
});

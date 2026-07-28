import React, { useMemo } from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { GreatCircle } from 'arc';
import type { ThreatEvent } from './ThreatMapLayout';

const typeColors: Record<string, string> = {
  'Malware': '#EF4444',    // red
  'Phishing': '#A855F7',   // purple
  'Exploit': '#F97316',    // orange
  'DDoS': '#3B82F6',       // blue
  'SQL Injection': '#EAB308' // yellow
};

export const AttackArc = React.memo(({ event, isSimulated }: { event: ThreatEvent; isSimulated?: boolean }) => {
  const baseColor = typeColors[event.type] || '#3B82F6';
  const color = isSimulated ? '#4B5563' : baseColor; // muted gray for simulated

  const positions = useMemo(() => {
    try {
      if (!event.source?.lat || !event.source?.lng || !event.dest?.lat || !event.dest?.lng) {
        return [];
      }
      // Generate arc points
      const generator = new GreatCircle(
        { x: event.source!.lng, y: event.source!.lat },
        { x: event.dest!.lng, y: event.dest!.lat }
      );
      const arcLine = generator.Arc(50); // Lấy 50 điểm trên đường cong
      return arcLine.geometries[0].coords.map((c: any) => [c[1], c[0]] as [number, number]);
    } catch (e) {
      console.error("Lỗi vẽ đường cong:", e);
      return [];
    }
  }, [event.source, event.dest]);

  return (
    <>
      {/* Base Arc */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: color,
          weight: isSimulated ? 1 : 2,
          opacity: isSimulated ? 0.3 : 0.8,
          className: `${isSimulated ? 'arc-simulated-base' : 'arc-real-base'} attack-arc-fade`
        }}
      />
      {/* Moving Particle */}
      {!isSimulated && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: color,
            weight: 3,
            opacity: 1,
            className: 'attack-particle attack-arc-fade'
          }}
        />
      )}
      {event.dest && (
        <CircleMarker
          center={[event.dest.lat, event.dest.lng]}
          radius={8}
          pathOptions={{
            color: color,
            fillColor: 'transparent',
            weight: 2,
            opacity: isSimulated ? 0.4 : 1,
            className: isSimulated ? 'attack-arc-fade' : 'target-pulse-animation attack-arc-fade'
          }}
        />
      )}
      <CircleMarker
        center={[event.source?.lat || 0, event.source?.lng || 0]}
        radius={4}
        pathOptions={{
          color: color,
          fillColor: color,
          fillOpacity: isSimulated ? 0.3 : 0.9,
          stroke: false,
          className: 'attack-arc-fade'
        }}
      >
        <Popup>
          <div className="bg-slate-900 text-white p-2 text-sm rounded">
            <strong>{event.source?.query || event.source?.country}</strong> 
            <br />
            &rarr; {event.dest?.query || 'Local Server'}
            <br />
            <span className="text-teal-400 text-xs">{event.type}</span>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
});

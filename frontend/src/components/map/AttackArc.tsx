import React, { useMemo } from 'react';
import { Polyline, CircleMarker, Popup } from 'react-leaflet';
import { GreatCircle } from 'arc';
import type { ThreatEvent } from './ThreatMapLayout';

export const AttackArc = React.memo(({ event, isPointOnly = false }: { event: ThreatEvent, isPointOnly?: boolean }) => {
  // We use cyan and purple to match the Radware theme
  const isIntel = event.source_kind === 'global_threat_feed';
  const color = isIntel ? '#c084fc' : '#06b6d4'; // Purple for intel, Cyan for local alerts
  const glowClass = isIntel ? 'purple-glow' : 'cyan-glow';

  const positions = useMemo(() => {
    if (isPointOnly) return [];
    try {
      if (!event.source?.lat || !event.source?.lng || !event.dest?.lat || !event.dest?.lng) {
        return [];
      }
      // Generate arc points
      const generator = new GreatCircle(
        { x: event.source!.lng, y: event.source!.lat },
        { x: event.dest!.lng, y: event.dest!.lat }
      );
      const arcLine = generator.Arc(50);
      return arcLine.geometries[0].coords.map((c: any) => [c[1], c[0]] as [number, number]);
    } catch (e) {
      console.error("Error generating arc:", e);
      return [];
    }
  }, [event.source, event.dest, isPointOnly]);

  return (
    <>
      {!isPointOnly && positions.length > 0 && (
        <>
          {/* Base Arc - very thin */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: color,
              weight: 1,
              opacity: 0.2,
              className: 'arc-real-base ' + glowClass
            }}
          />
          {/* Moving Particle */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: color, // Use the same color for the particle instead of white for better blending
              weight: 1.5,
              opacity: 0.8,
              className: 'attack-particle ' + glowClass
            }}
          />
          {/* Glowing Target Dot */}
          {event.dest && (
            <CircleMarker
              center={[event.dest.lat, event.dest.lng]}
              radius={2.5}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 1,
                weight: 0,
                opacity: 1,
                className: 'target-pulse-animation ' + glowClass
              }}
            />
          )}
        </>
      )}

      {/* Source Dot */}
      <CircleMarker
        center={[event.source?.lat || 0, event.source?.lng || 0]}
        radius={isPointOnly ? 4 : 2}
        pathOptions={{
          color: color,
          fillColor: isPointOnly ? '#ffffff' : color,
          fillOpacity: 0.8,
          weight: 1,
          stroke: isPointOnly,
          className: 'attack-arc-fade ' + (isPointOnly ? 'target-pulse-animation ' + glowClass : '')
        }}
      >
        <Popup>
          <div className="bg-[#0a0f1d] text-white p-3 text-sm rounded border border-gray-700 shadow-xl font-inter">
            <strong className="text-cyan-400">{event.source?.query || event.source?.country}</strong> 
            {!isPointOnly && (
              <>
                <span className="text-gray-500 mx-2">&rarr;</span>
                <strong className="text-white">{event.dest?.query || event.dest?.country || 'Local Server'}</strong>
              </>
            )}
            <br />
            <span className="text-xs uppercase tracking-widest text-gray-400 mt-2 block border-t border-gray-800 pt-1">
              {event.type}
            </span>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
});

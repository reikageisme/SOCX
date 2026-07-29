import React, { useMemo } from 'react';
import { Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import type { ThreatEvent } from './ThreatMapLayout';

const getBezierCurve = (start: [number, number], end: [number, number], segments = 25) => {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;
  
  // Calculate midpoint
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  
  // Calculate perpendicular vector for control point
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  // Offset scale (make it slightly curved, not a huge parabola)
  const offset = Math.min(len * 0.1, 15);
  
  // Control point coordinates
  const cpLat = midLat - (dx / len) * offset;
  const cpLng = midLng + (dy / len) * offset;
  
  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const lat = mt * mt * lat1 + 2 * mt * t * cpLat + t * t * lat2;
    const lng = mt * mt * lng1 + 2 * mt * t * cpLng + t * t * lng2;
    points.push([lat, lng]);
  }
  return points;
};

export const AttackArc = React.memo(({ event, isPointOnly = false, count = 1 }: { event: ThreatEvent, isPointOnly?: boolean, count?: number }) => {
  // We use cyan and purple to match the Radware theme
  const isIntel = event.source_kind === 'global_threat_feed';
  const color = isIntel ? '#c084fc' : '#06b6d4'; // Purple for intel, Cyan for local alerts
  const glowClass = isIntel ? 'purple-glow' : 'cyan-glow';

  // Increase thickness based on bundled events count (max 3x thickness)
  const bundleWeight = Math.min(2 + (count * 0.5), 6);
  const particleWeight = Math.min(2.5 + (count * 0.5), 7);
  
  // Format destination display name
  const destName = event.dest?.is_local ? 'Local Network / Internal Asset' : (event.dest?.query || event.dest?.country || 'Unknown');
  const sourceName = event.source?.query || event.source?.country || 'Unknown';

  const positions = useMemo(() => {
    if (isPointOnly) return [];
    try {
      if (!event.source?.lat || !event.source?.lng || !event.dest?.lat || !event.dest?.lng) {
        return [];
      }
      return getBezierCurve(
        [event.source.lat, event.source.lng],
        [event.dest.lat, event.dest.lng]
      );
    } catch (e) {
      console.error("Error generating arc:", e);
      return [];
    }
  }, [event.source, event.dest, isPointOnly]);

  return (
    <>
      {!isPointOnly && positions.length > 0 && (
        <>
          {/* Base Arc - very thin, STATIC glow */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: color,
              weight: bundleWeight,
              opacity: 0.3,
              className: 'arc-real-base ' + glowClass
            }}
          />
          {/* Moving Particle - NO GLOW to prevent layout thrashing */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: '#ffffff',
              weight: particleWeight,
              opacity: 1,
              className: 'attack-particle'
            }}
          />
          {/* Glowing Target Dot - NO GLOW on animation */}
          {event.dest && (
            <CircleMarker
              center={[event.dest.lat, event.dest.lng]}
              radius={Math.min(4 + count, 10)}
              pathOptions={{
                color: color,
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 1,
                opacity: 1,
                className: 'target-pulse-animation'
              }}
            />
          )}
        </>
      )}

      {/* Source Dot */}
      <CircleMarker
        center={[event.source?.lat || 0, event.source?.lng || 0]}
        radius={isPointOnly ? 4 : (Math.min(2 + count, 6))}
        pathOptions={{
          color: color,
          fillColor: isPointOnly ? '#ffffff' : color,
          fillOpacity: 0.8,
          weight: 1,
          stroke: isPointOnly,
          className: 'attack-arc-fade ' + (isPointOnly ? 'target-pulse-animation ' + glowClass : '')
        }}
      >
        <Tooltip sticky direction="auto" className="custom-event-tooltip">
          <div className="bg-[#0a0f1d] text-white p-2 text-sm rounded border border-gray-700 font-inter">
            {count > 1 && <span className="text-yellow-400 font-bold mr-2">[{count}x]</span>}
            <strong className="text-cyan-400">{sourceName}</strong> 
            {!isPointOnly && (
              <>
                <span className="text-gray-500 mx-2">&rarr;</span>
                <strong className="text-white">{destName}</strong>
              </>
            )}
            <br />
            <span className="text-xs uppercase tracking-widest text-gray-400 mt-1 block border-t border-gray-800 pt-1">
              {event.type}
            </span>
          </div>
        </Tooltip>
      </CircleMarker>
    </>
  );
});

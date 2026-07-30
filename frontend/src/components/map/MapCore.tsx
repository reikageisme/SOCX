import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MapContainer, GeoJSON, useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatEvent } from './ThreatMapLayout';
import { AttackCanvasLayer, type CanvasArcEvent } from './AttackCanvasLayer';

// ── Web Worker (Vite supports ?worker imports) ────────────────────────────────
import EventWorker from '../../workers/eventProcessor.worker?worker';

// ── EventRenderer — offloads bundling to a Web Worker ─────────────────────────

const EventRenderer: React.FC<{
  events: ThreatEvent[];
  activeLayers: string[];
}> = React.memo(({ events, activeLayers }) => {
  const map = useMap();
  const [canvasArcs, setCanvasArcs] = useState<CanvasArcEvent[]>([]);
  const workerRef = useRef<Worker | null>(null);

  // Create Web Worker once
  useEffect(() => {
    try {
      workerRef.current = new EventWorker();
      workerRef.current.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'result') {
          setCanvasArcs(e.data.arcs);
        }
      };
    } catch (err) {
      console.warn('[MapCore] Web Worker not available, falling back to main thread', err);
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Get bounds for viewport culling
  const boundsRef = useRef(map.getBounds());
  useMapEvent('moveend', () => { boundsRef.current = map.getBounds(); });
  useMapEvent('zoomend', () => { boundsRef.current = map.getBounds(); });

  // Post work to worker when events/layers change
  useEffect(() => {
    const b = boundsRef.current;
    const boundsData = {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    };

    if (workerRef.current) {
      // Offload to worker
      workerRef.current.postMessage({
        type: 'process',
        events,
        activeLayers,
        bounds: boundsData,
      });
    } else {
      // Main-thread fallback (same logic as worker)
      const arcs = processEventsMainThread(events, activeLayers, boundsData);
      setCanvasArcs(arcs);
    }
  }, [events, activeLayers]);

  return <AttackCanvasLayer arcs={canvasArcs} />;
}, (prev, next) => {
  return prev.events === next.events && prev.activeLayers === next.activeLayers;
});

// ── Main-thread fallback when Worker not available ────────────────────────────

function processEventsMainThread(
  events: ThreatEvent[],
  activeLayers: string[],
  bounds: { south: number; west: number; north: number; east: number }
): CanvasArcEvent[] {
  const getLayer = (type: string) =>
    type === 'malicious_ip' || type === 'Malware' ? 'malicious_ip' : type;

  const visible = events.filter(e => {
    if (e.source.is_local) return false;
    if (!activeLayers || activeLayers.length === 0) return true;
    return activeLayers.includes(getLayer(e.type));
  });

  const pad = 0.3;
  const latRange = (bounds.north - bounds.south) * pad;
  const lngRange = (bounds.east - bounds.west) * pad;
  const inView = visible.filter(e => {
    const srcIn = e.source?.lat && e.source?.lng
      ? e.source.lat >= bounds.south - latRange && e.source.lat <= bounds.north + latRange &&
        e.source.lng >= bounds.west - lngRange && e.source.lng <= bounds.east + lngRange
      : false;
    const dstIn = e.dest?.lat && e.dest?.lng
      ? e.dest.lat >= bounds.south - latRange && e.dest.lat <= bounds.north + latRange &&
        e.dest.lng >= bounds.west - lngRange && e.dest.lng <= bounds.east + lngRange
      : false;
    return srcIn || dstIn || !e.dest;
  });

  const bundles: Record<string, CanvasArcEvent> = {};
  for (const e of inView) {
    if (e.dest) {
      const srcKey = e.source.country || `${Math.round(e.source.lat)},${Math.round(e.source.lng)}`;
      const dstKey = e.dest.country || `${Math.round(e.dest.lat)},${Math.round(e.dest.lng)}`;
      const kind = e.source_kind || 'local_sensor';
      const key = `${srcKey}::${dstKey}::${kind}`;
      if (!bundles[key]) {
        bundles[key] = {
          key, sourceLat: e.source.lat, sourceLng: e.source.lng,
          destLat: e.dest.lat, destLng: e.dest.lng, sourceKind: kind,
          count: 1, type: e.type, receivedAt: (e as any)._receivedAt || Date.now(),
          isPointOnly: false,
        };
      } else {
        bundles[key].count += 1;
        const ra = (e as any)._receivedAt || Date.now();
        if (ra > bundles[key].receivedAt) bundles[key].receivedAt = ra;
      }
    } else {
      bundles[`pt::${e.id}`] = {
        key: `pt::${e.id}`, sourceLat: e.source?.lat || 0, sourceLng: e.source?.lng || 0,
        destLat: 0, destLng: 0, sourceKind: e.source_kind || 'local_sensor',
        count: 1, type: e.type, receivedAt: (e as any)._receivedAt || Date.now(),
        isPointOnly: true,
      };
    }
  }
  return Object.values(bundles);
}

// ── MapCore ───────────────────────────────────────────────────────────────────

export const MapCore = React.memo(({ events, activeLayers = [] }: { events: ThreatEvent[], activeLayers?: string[] }) => {
  const [geoData, setGeoData] = useState<any>(null);
  
  // Use Canvas renderer for the massive GeoJSON to prevent SVG DOM lag
  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

  useEffect(() => {
    fetch('/countries.geojson')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error("Failed to load geojson", err));
  }, []);

  const geoStyle = useMemo(() => ({
    fillColor: '#000000',
    weight: 0.8,
    opacity: 0.5,
    color: '#06b6d4',
    fillOpacity: 0.6,
    renderer: canvasRenderer
  }), [canvasRenderer]);

  const onEachFeature = useCallback((feature: any, layer: any) => {
    const countryName = feature.properties?.name || feature.properties?.ADMIN;
    if (countryName) {
      layer.bindTooltip(countryName, {
        sticky: true,
        className: 'custom-tooltip',
        direction: 'auto',
      });

      layer.on({
        mouseover: (e: any) => {
          const l = e.target;
          l.setStyle({
            fillColor: '#06b6d4',
            fillOpacity: 0.6
          });
        },
        mouseout: (e: any) => {
          const l = e.target;
          l.setStyle(geoStyle);
        }
      });
    }
  }, [geoStyle]);

  return (
    <div className="absolute inset-0 w-full h-full bg-[#050810] z-0 overflow-hidden" 
      style={{
        backgroundImage: `
          linear-gradient(rgba(6, 182, 212, 0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6, 182, 212, 0.05) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px'
      }}
    >
      <style>{`
        .leaflet-container {
          background: transparent !important;
        }
        .custom-tooltip {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #fff !important;
          font-weight: 600;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }
        .custom-tooltip::before {
          display: none !important;
        }
      `}</style>
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
      >
        {geoData && (
          <GeoJSON 
            data={geoData} 
            style={geoStyle}
            onEachFeature={onEachFeature}
          />
        )}
        <EventRenderer events={events} activeLayers={activeLayers} />
      </MapContainer>
    </div>
  );
});

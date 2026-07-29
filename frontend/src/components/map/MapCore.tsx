import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, GeoJSON, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatEvent } from './ThreatMapLayout';
import { AttackArc } from './AttackArc';

const EventRenderer: React.FC<{ events: ThreatEvent[], activeLayers: string[] }> = ({ events, activeLayers }) => {
  const [zoom, setZoom] = useState(2);
  useMapEvent('zoomend', (e) => {
    setZoom(e.target.getZoom());
  });

  const getEventLayer = (e: ThreatEvent) => {
    if (e.type === 'malicious_ip' || e.type === 'Malware') return 'malicious_ip';
    return e.type;
  };

  const visibleEvents = events.filter(e => {
    if (e.source.is_local) return false;
    if (!activeLayers || activeLayers.length === 0) return true; 
    const layer = getEventLayer(e);
    return activeLayers.includes(layer);
  });

  const arcEvents = visibleEvents.filter(e => e.dest);
  const pointEvents = visibleEvents.filter(e => !e.dest);

  // Bundle arcs that have the same source and destination to prevent SVG lag
  const bundledArcEvents = useMemo(() => {
    const bundles: Record<string, { key: string; event: ThreatEvent; count: number }> = {};
    arcEvents.forEach(e => {
      // Group by country or rounded coordinates if country is missing, and source_kind to separate colors
      const srcKey = e.source.country || `${Math.round(e.source.lat)},${Math.round(e.source.lng)}`;
      const dstKey = e.dest!.country || `${Math.round(e.dest!.lat)},${Math.round(e.dest!.lng)}`;
      const key = `${srcKey}-${dstKey}-${e.source_kind}`;
      
      if (!bundles[key]) {
        bundles[key] = { key, event: e, count: 1 };
      } else {
        bundles[key].count += 1;
        // Keep the latest event data for tooltip/details
        if (new Date(e.timestamp) > new Date(bundles[key].event.timestamp)) {
           bundles[key].event = e;
        }
      }
    });
    return Object.values(bundles);
  }, [arcEvents]);

  return (
    <>
      {bundledArcEvents.map(bundle => (
        <AttackArc key={bundle.key} event={bundle.event} count={bundle.count} />
      ))}
      {pointEvents.map(event => (
        <AttackArc key={event.id} event={event} isPointOnly={true} count={1} />
      ))}
    </>
  );
};

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

  const onEachFeature = (feature: any, layer: any) => {
    if (feature.properties && feature.properties.ADMIN) {
      layer.bindTooltip(feature.properties.ADMIN, {
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
  };

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
        .cyan-glow {
          filter: drop-shadow(0 0 6px #06b6d4);
          will-change: filter;
          transform: translateZ(0);
        }
        .purple-glow {
          filter: drop-shadow(0 0 6px #c084fc);
          will-change: filter;
          transform: translateZ(0);
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

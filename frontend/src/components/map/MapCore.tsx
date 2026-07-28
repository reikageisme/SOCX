import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, GeoJSON, useMapEvent } from 'react-leaflet';
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

  return (
    <>
      {arcEvents.map(event => (
        <AttackArc key={event.id} event={event} />
      ))}
      {pointEvents.map(event => (
        <AttackArc key={event.id} event={event} isPointOnly={true} />
      ))}
    </>
  );
};

export const MapCore = React.memo(({ events, activeLayers = [] }: { events: ThreatEvent[], activeLayers?: string[] }) => {
  const [geoData, setGeoData] = useState<any>(null);

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
    fillOpacity: 0.6
  }), []);

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

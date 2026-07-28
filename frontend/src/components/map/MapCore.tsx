import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMapEvent } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatEvent } from './ThreatMapLayout';
import { AttackArc } from './AttackArc';

const EventRenderer: React.FC<{ events: ThreatEvent[], activeLayers: string[] }> = ({ events, activeLayers }) => {
  const [zoom, setZoom] = useState(2);
  useMapEvent('zoomend', (e) => {
    setZoom(e.target.getZoom());
  });

  // Helper to map backend event type to the layer names
  const getEventLayer = (e: ThreatEvent) => {
    if (e.type === 'malicious_ip' || e.type === 'Malware') return 'malicious_ip';
    return e.type;
  };

  const visibleEvents = events.filter(e => {
    if (e.source.is_local) return false;
    const layer = getEventLayer(e);
    return activeLayers.includes(layer);
  });

  // Treat all visible events as arcs, even if they are global feed
  // For global feed without dest, we can simulate dest as local or skip drawing arcs
  const arcEvents = visibleEvents.filter(e => e.dest);
  
  // For events without dest (e.g. global_threat_feed), we draw a glowing dot at source
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

export const MapCore = React.memo(({ events, activeLayers = [] }: { events: ThreatEvent[], activeLayers: string[] }) => {
  return (
    <div className="w-full h-full relative bg-[#050810]">
      {/* Global CSS for cyan map filter and glowing effects */}
      <style>{`
        .radware-map-tiles {
          filter: sepia(100%) hue-rotate(170deg) saturate(300%) brightness(50%) contrast(150%) invert(10%);
        }
        .cyan-glow {
          filter: drop-shadow(0 0 5px #06b6d4) drop-shadow(0 0 10px #06b6d4);
        }
        .purple-glow {
          filter: drop-shadow(0 0 5px #c084fc) drop-shadow(0 0 10px #c084fc);
        }
      `}</style>
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ width: '100%', height: '100%', background: '#050810' }}
        className="z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          className="radware-map-tiles"
        />
        <EventRenderer events={events} activeLayers={activeLayers} />
      </MapContainer>
    </div>
  );
});

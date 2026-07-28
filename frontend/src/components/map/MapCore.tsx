import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ThreatEvent } from './ThreatMapLayout';
import { AttackArc } from './AttackArc';
import { ThreatPoint } from './ThreatPoint';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useMapEvent } from 'react-leaflet';
import { useState } from 'react';

const Legend = React.memo(() => {
  const types = [
    { name: 'Malware', color: 'bg-red-500' },
    { name: 'Phishing', color: 'bg-purple-500' },
    { name: 'Exploit', color: 'bg-orange-500' },
    { name: 'DDoS', color: 'bg-blue-500' },
    { name: 'SQL Injection', color: 'bg-yellow-500' }
  ];

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-soc-dark/90 p-3 rounded-lg border border-gray-700 shadow-lg backdrop-blur-sm pointer-events-none">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Threat Types</h4>
      <div className="space-y-1.5 mb-3">
        {types.map(t => (
          <div key={t.name} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${t.color}`}></div>
            <span className="text-xs text-gray-300 font-medium">{t.name}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-700 pt-2 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-soc-accent opacity-70"></div>
          <span className="text-[10px] text-soc-muted uppercase">Local Sensor (Real)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-purple-500 bg-purple-500/30"></div>
          <span className="text-[10px] text-soc-muted uppercase">Global Intel Feed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0 border-t border-dashed border-gray-500 opacity-50"></div>
          <span className="text-[10px] text-soc-muted uppercase">Simulated</span>
        </div>
      </div>
    </div>
  );
});

const EventRenderer: React.FC<{ events: ThreatEvent[] }> = ({ events }) => {
  const [zoom, setZoom] = useState(2);
  useMapEvent('zoomend', (e) => {
    setZoom(e.target.getZoom());
  });

  const globalEvents = events.filter(e => e.source_kind === 'global_threat_feed');
  const arcEvents = events.filter(e => e.source_kind !== 'global_threat_feed');

  return (
    <>
      <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
        {globalEvents.map(event => (
          <ThreatPoint key={event.id} event={event} />
        ))}
      </MarkerClusterGroup>
      
      {arcEvents.map(event => {
        /* PERF: SVG Rendering Limits & Canvas Evaluation
            - SVG limit: ~300 nodes before noticeable layout thrashing.
            - Current implementation uses React-Leaflet with SVG markers for easy CSS animations.
            - If ACS scales beyond 50 events/sec or if max rendered events exceed 300:
              1. Rewrite this component to use Leaflet.Canvas or react-leaflet-canvas-markers.
              2. For extreme scale (>10k points), switch the map core entirely to deck.gl (WebGL).
            - Do not switch to Canvas right now as CSS path animations (dash-offset) are required for AttackArc.
        */
        const isSimulated = event.source_kind === 'global_simulated';
        // Hide simulated arcs at high zoom out (<= 2) to reduce visual noise
        if (isSimulated && zoom <= 2) return null;
        return <AttackArc key={event.id} event={event} isSimulated={isSimulated} />;
      })}
    </>
  );
};

export const MapCore = React.memo(({ events }: { events: ThreatEvent[] }) => {
  return (
    <div className="w-full h-full relative bg-[#0f1423]">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ width: '100%', height: '100%', background: '#0f1423' }}
        className="z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        <EventRenderer events={events} />
      </MapContainer>
      <Legend />
    </div>
  );
});

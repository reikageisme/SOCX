import React, { useState, useEffect, useRef } from 'react';
import { HeaderStats } from './HeaderStats';
import { LeftPanel } from './LeftPanel';
import { StatsPanel } from './StatsPanel';
import { MapCore } from './MapCore';
import { useStore } from '../../store/useStore';

export interface Coordinates {
  lat: number;
  lng: number;
  country: string;
  query?: string;
  is_local?: boolean;
}

export interface ThreatEvent {
  id: string;
  source_kind?: 'local_sensor' | 'global_threat_feed';
  source: Coordinates;
  dest?: Coordinates;
  severity: 'low' | 'medium' | 'high';
  type: string;
  timestamp: string;
  reported_by?: string;
  confidence?: number;
  first_seen?: string;
  malware_family?: string;
  metadata?: any;
  _receivedAt?: number;
}

// ── Display refresh interval (ms) — controls how often the map re-renders.
// 333ms ≈ 3 FPS for the React reconciliation layer.  The Canvas animation
// loop inside AttackCanvasLayer runs at full 60 FPS independently.
const DISPLAY_REFRESH_MS = 333;
const EVENT_TTL_MS = 10_000;

export const ThreatMapLayout: React.FC = () => {
  // ── Data state (updated every WS flush = ~100ms) ────────────────────────
  const { wsConnected, threatEvents: storeEvents } = useStore();
  const receivedMap = useRef<Record<string, number>>({});

  // ── Display state (throttled to ~3 FPS) ─────────────────────────────────
  const [displayEvents, setDisplayEvents] = useState<ThreatEvent[]>([]);
  const [totalAttacks, setTotalAttacks] = useState(0);
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  
  // Active layers for map filtering
  const [activeLayers, setActiveLayers] = useState<string[]>([
    'malicious_ip', 'Phishing', 'Exploit', 'DDoS', 'SQL Injection'
  ]);

  // ── Ref holding the latest processed events (data layer) ────────────────
  const dataEventsRef = useRef<ThreatEvent[]>([]);

  // Process incoming store events → stamp _receivedAt, update data ref
  useEffect(() => {
    if (storeEvents.length > 0) {
      const now = Date.now();
      const processed = storeEvents.slice(0, 100).map(e => {
        if (!receivedMap.current[e.id]) {
          receivedMap.current[e.id] = now;
        }
        return { ...e, _receivedAt: receivedMap.current[e.id] };
      });
      
      dataEventsRef.current = processed.filter(e => now - e._receivedAt! <= EVENT_TTL_MS);
      setTotalAttacks(storeEvents.length);

      // Cleanup receivedMap for events no longer in store
      const storeIds = new Set(storeEvents.map(e => e.id));
      for (const id of Object.keys(receivedMap.current)) {
        if (!storeIds.has(id)) {
          delete receivedMap.current[id];
        }
      }
    } else {
      dataEventsRef.current = [];
      setTotalAttacks(0);
      receivedMap.current = {};
    }
  }, [storeEvents]);

  // ── Double-buffer: flush data → display at fixed interval (~3 FPS) ──────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      // Apply TTL filter on the display flush
      const live = dataEventsRef.current.filter(
        e => e._receivedAt && (now - e._receivedAt <= EVENT_TTL_MS)
      );
      setDisplayEvents(live);
    }, DISPLAY_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] -m-8 flex flex-col bg-[#050810] text-white overflow-hidden font-inter">
      {/* Background Map Container */}
      <div className="absolute inset-0 z-0">
        {!wsConnected && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#0a0f1d]/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
              <p className="text-cyan-400 text-lg font-semibold tracking-wider uppercase">Reconnecting to Control Plane...</p>
            </div>
          </div>
        )}
        <MapCore events={displayEvents} activeLayers={activeLayers} />
      </div>

      {/* Floating Header */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <HeaderStats totalAttacks={totalAttacks} />
      </div>

      {/* Floating Panels Container */}
      <div className="absolute top-20 bottom-0 left-0 right-0 pointer-events-none flex justify-between z-10 overflow-hidden">
        {/* Left Panel */}
        <div className="pointer-events-auto h-full flex flex-col pt-4 pb-8 pl-4">
          <LeftPanel 
            events={displayEvents} 
            activeLayers={activeLayers} 
            setActiveLayers={setActiveLayers}
            isCollapsed={isLeftCollapsed}
            onToggle={() => setIsLeftCollapsed(!isLeftCollapsed)}
          />
        </div>
        
        {/* Right Panel */}
        <div className="pointer-events-auto h-full flex flex-col pt-4 pb-8 pr-4">
          <StatsPanel 
            events={displayEvents} 
            isCollapsed={isStatsCollapsed} 
            onToggle={() => setIsStatsCollapsed(!isStatsCollapsed)} 
          />
        </div>
      </div>
    </div>
  );
};

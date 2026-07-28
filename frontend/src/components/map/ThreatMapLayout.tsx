import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeaderStats } from './HeaderStats';
import { AttackFeed } from './AttackFeed';
import { StatsPanel } from './StatsPanel';
import { MapCore } from './MapCore';
import { useStore } from '../../store/useStore';

export interface Coordinates {
  lat: number;
  lng: number;
  country: string;
  query?: string;
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

export const ThreatMapLayout: React.FC = () => {
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const { wsConnected, threatEvents: storeEvents } = useStore();

  // Stats
  const [totalAttacks, setTotalAttacks] = useState(0);
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);

  const receivedMap = useRef<Record<string, number>>({});

  // Sync store events to local state and manage 100 max limit
  useEffect(() => {
    if (storeEvents.length > 0) {
      const now = Date.now();
      const updatedEvents = storeEvents.slice(0, 100).map(e => {
        if (!receivedMap.current[e.id]) {
          receivedMap.current[e.id] = now;
        }
        return { ...e, _receivedAt: receivedMap.current[e.id] };
      });
      
      // Filter out those already expired to prevent flashing
      setEvents(updatedEvents.filter(e => now - e._receivedAt! <= 10000));
      setTotalAttacks(storeEvents.length); // Update total

      // Cleanup receivedMap
      const storeIds = new Set(storeEvents.map(e => e.id));
      Object.keys(receivedMap.current).forEach(id => {
        if (!storeIds.has(id)) {
          delete receivedMap.current[id];
        }
      });
    } else {
      setEvents([]);
      setTotalAttacks(0);
      receivedMap.current = {};
    }
  }, [storeEvents]);

  // Clean up old events every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setEvents(prev => prev.filter(e => e._receivedAt && (now - e._receivedAt <= 10000)));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-64px)] -m-8 flex flex-col bg-soc-dark text-white overflow-hidden">
      {/* Absolute positioning to cover the -m-8 padding offset from Layout.tsx */}
      <HeaderStats totalAttacks={totalAttacks} />
      
      <div className="flex flex-1 overflow-hidden relative">
        <AttackFeed events={events} />
        
        <div className="flex-1 relative">
          {!wsConnected && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-soc-dark/80 backdrop-blur-sm">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-soc-accent mx-auto mb-4"></div>
                <p className="text-soc-text text-lg font-semibold">Reconnecting to Control Plane...</p>
              </div>
            </div>
          )}
          <MapCore events={events} />
        </div>

        <StatsPanel events={events} isCollapsed={isStatsCollapsed} onToggle={() => setIsStatsCollapsed(!isStatsCollapsed)} />
      </div>
    </div>
  );
};

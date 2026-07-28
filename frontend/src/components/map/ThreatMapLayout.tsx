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

  const [totalAttacks, setTotalAttacks] = useState(0);
  const [isStatsCollapsed, setIsStatsCollapsed] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  
  // Active layers for map filtering
  const [activeLayers, setActiveLayers] = useState<string[]>([
    'malicious_ip', 'Phishing', 'Exploit', 'DDoS', 'SQL Injection'
  ]);

  const receivedMap = useRef<Record<string, number>>({});

  useEffect(() => {
    if (storeEvents.length > 0) {
      const now = Date.now();
      const updatedEvents = storeEvents.slice(0, 100).map(e => {
        if (!receivedMap.current[e.id]) {
          receivedMap.current[e.id] = now;
        }
        return { ...e, _receivedAt: receivedMap.current[e.id] };
      });
      
      setEvents(updatedEvents.filter(e => now - e._receivedAt! <= 10000));
      setTotalAttacks(storeEvents.length);

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

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setEvents(prev => prev.filter(e => e._receivedAt && (now - e._receivedAt <= 10000)));
    }, 2000);
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
        <MapCore events={events} activeLayers={activeLayers} />
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
            events={events} 
            activeLayers={activeLayers} 
            setActiveLayers={setActiveLayers}
            isCollapsed={isLeftCollapsed}
            onToggle={() => setIsLeftCollapsed(!isLeftCollapsed)}
          />
        </div>
        
        {/* Right Panel */}
        <div className="pointer-events-auto h-full flex flex-col pt-4 pb-8 pr-4">
          <StatsPanel 
            events={events} 
            isCollapsed={isStatsCollapsed} 
            onToggle={() => setIsStatsCollapsed(!isStatsCollapsed)} 
          />
        </div>
      </div>
    </div>
  );
};

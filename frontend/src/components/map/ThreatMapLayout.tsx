import React, { useState, useEffect, useRef } from 'react';
import { HeaderStats } from './HeaderStats';
import { LeftPanel } from './LeftPanel';
import { StatsPanel } from './StatsPanel';
import { MapCore } from './MapCore';
import { useStore } from '../../store/useStore';
import { apiFetch } from '../../lib/api';
import { X, Search, ShieldAlert, Globe, Server, User } from 'lucide-react';

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
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [intelData, setIntelData] = useState<any>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  
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

  const handleEventClick = async (event: ThreatEvent) => {
    const ip = event.source.query || event.dest?.query;
    if (!ip) return;
    
    setSelectedIp(ip);
    setIntelLoading(true);
    setIntelData(null);
    try {
      const res = await apiFetch(`/api/v1/analytics/ip/${ip}`, {
        headers: { 'Authorization': `Bearer ${useStore.getState().token}` }
      });
      const data = await res.json();
      setIntelData(data);
    } catch {
      setIntelData({ error: 'Failed to fetch intel' });
    }
    setIntelLoading(false);
  };

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
            onEventClick={handleEventClick}
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

      {/* Intel Modal Overlay */}
      {selectedIp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
          <div className="bg-[#0a0f1d] border border-cyan-900 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-xl w-full max-w-lg overflow-hidden animate-fade-in flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-cyan-950/20">
              <h3 className="text-cyan-400 font-bold flex items-center gap-2">
                <Search size={18} />
                Threat Intel: {selectedIp}
              </h3>
              <button onClick={() => setSelectedIp(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {intelLoading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
                </div>
              ) : intelData?.error ? (
                <div className="text-rose-400 flex items-center gap-2 py-4">
                  <ShieldAlert size={20} />
                  {intelData.error}
                </div>
              ) : intelData ? (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-900/50 p-3 rounded border border-gray-800">
                      <div className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Globe size={12}/> Country</div>
                      <div className="text-gray-200 font-medium">{intelData.whois?.country || 'N/A'}</div>
                    </div>
                    <div className="bg-gray-900/50 p-3 rounded border border-gray-800">
                      <div className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Server size={12}/> Registrar</div>
                      <div className="text-gray-200 font-medium truncate">{Array.isArray(intelData.whois?.registrar) ? intelData.whois?.registrar[0] : (intelData.whois?.registrar || 'N/A')}</div>
                    </div>
                    <div className="bg-gray-900/50 p-3 rounded border border-gray-800 col-span-2">
                      <div className="text-gray-500 text-xs mb-1 flex items-center gap-1"><User size={12}/> Organization</div>
                      <div className="text-gray-200 font-medium">{Array.isArray(intelData.whois?.org) ? intelData.whois?.org[0] : (intelData.whois?.org || 'N/A')}</div>
                    </div>
                  </div>
                  <div className="bg-rose-950/20 border border-rose-900/50 rounded p-4 mt-4">
                    <h4 className="text-rose-400 font-semibold mb-2 flex items-center gap-2"><ShieldAlert size={16} /> AbuseIPDB Score</h4>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-rose-300">{intelData.abuse_score || 0}%</div>
                      <div className="text-gray-400 text-xs">Confidence of abuse<br/>(Requires valid API key for live data)</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

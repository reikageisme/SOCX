import { create } from 'zustand';

export interface ThreatEvent {
  id: string;
  source_kind?: 'local_sensor' | 'global_threat_feed' | 'global_simulated';
  source: { lat: number; lng: number; country: string; query?: string };
  dest?: { lat: number; lng: number; country: string; query?: string };
  severity: 'low' | 'medium' | 'high';
  type: string;
  timestamp: string;
  reported_by?: string;
  confidence?: number;
  first_seen?: string;
  malware_family?: string;
  metadata?: any;
}

interface SocState {
  token: string | null;
  setToken: (token: string | null) => void;
  wsConnected: boolean;
  setWsConnected: (status: boolean) => void;
  threatEvents: ThreatEvent[];
  addThreatEvent: (event: ThreatEvent) => void;
  addThreatEvents: (events: ThreatEvent[]) => void;
}

export const useStore = create<SocState>((set) => ({
  token: localStorage.getItem('token') || null,
  setToken: (token) => {
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
    set({ token });
  },
  wsConnected: false,
  setWsConnected: (status) => set({ wsConnected: status }),
  threatEvents: [],
  addThreatEvent: (event) => set((state) => ({ 
    threatEvents: [event, ...state.threatEvents].slice(0, 150) // Keep last 150 events
  })),
  addThreatEvents: (events) => set((state) => ({
    threatEvents: [...events, ...state.threatEvents].slice(0, 150)
  })),
}));

import { create } from 'zustand';

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export interface ThreatEvent {
  id: string;
  source_kind?: 'local_sensor' | 'global_threat_feed';
  source: { lat: number; lng: number; country: string; query?: string; is_local?: boolean };
  dest?: { lat: number; lng: number; country: string; query?: string; is_local?: boolean };
  severity: 'low' | 'medium' | 'high';
  type: string;
  timestamp: string;
  reported_by?: string;
  confidence?: number;
  first_seen?: string;
  malware_family?: string;
  metadata?: any;
}

export interface AppNotification {
  id: string;
  title: string;
  severity: string;
  timestamp: string;
  read: boolean;
}

interface SocState {
  token: string | null;
  userRole: string;
  setToken: (token: string | null) => void;
  wsConnected: boolean;
  setWsConnected: (status: boolean) => void;
  threatEvents: ThreatEvent[];
  addThreatEvent: (event: ThreatEvent) => void;
  addThreatEvents: (events: ThreatEvent[]) => void;
  notifications: AppNotification[];
  addNotification: (notif: AppNotification) => void;
  markAllNotificationsRead: () => void;
}

export const useStore = create<SocState>((set) => ({
  token: localStorage.getItem('token') || null,
  userRole: localStorage.getItem('token') ? (parseJwt(localStorage.getItem('token')!)?.role || 'auditor') : 'auditor',
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
      const decoded = parseJwt(token);
      set({ token, userRole: decoded?.role || 'auditor' });
    }
    else {
      localStorage.removeItem('token');
      set({ token, userRole: 'auditor' });
    }
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
  notifications: [],
  addNotification: (notif) => set((state) => ({
    notifications: [notif, ...state.notifications].slice(0, 50)
  })),
  markAllNotificationsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true }))
  })),
}));

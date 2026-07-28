import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export const useWebSocket = (url: string) => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<number | null>(null);
  const isComponentMounted = useRef(true);

  // Get store actions (stable from Zustand)
  const setWsConnected = useStore((state) => state.setWsConnected);
  const addThreatEvent = useStore((state) => state.addThreatEvent);
  const addThreatEvents = useStore((state) => state.addThreatEvents);

  const eventBuffer = useRef<any[]>([]);

  useEffect(() => {
    const flushInterval = setInterval(() => {
      if (eventBuffer.current.length > 0) {
        // Hard cap: drop oldest if over 100
        if (eventBuffer.current.length > 100) {
          eventBuffer.current = eventBuffer.current.slice(-100);
        }
        // Take up to 10 events per flush
        const batch = eventBuffer.current.splice(0, 10);
        addThreatEvents(batch);
      }
    }, 100);
    return () => clearInterval(flushInterval);
  }, [addThreatEvents]);

  useEffect(() => {
    isComponentMounted.current = true;

    const connect = () => {
      // Don't connect if already connecting or open
      if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      console.log(`[WS] Connecting to ${url}...`);
      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => {
        if (!isComponentMounted.current) {
          socket.close();
          return;
        }
        console.log('[WS] Connected successfully');
        setWsConnected(true);
        reconnectAttempts.current = 0; // Reset backoff on success
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Nhận dữ liệu:', data);
          
          // Compatible with real pipeline event format (which doesn't wrap in "type": "threat_alert" anymore)
          // We check if it has source and type, which indicates a threat event from pipeline
          if (data.source && data.type) {
            console.log('[WS] Payload hợp lệ, đang thêm vào bộ đệm!');
            eventBuffer.current.push({
              id: data.id || crypto.randomUUID(),
              source_kind: data.source_kind || 'local_sensor',
              source: data.source,
              dest: data.dest,
              severity: data.severity || 'low',
              type: data.type,
              timestamp: data.timestamp,
              reported_by: data.reported_by,
              confidence: data.confidence,
              first_seen: data.first_seen,
              malware_family: data.malware_family,
              metadata: data.metadata
            });
          } else if (data.type === 'notification') {
            console.log('[WS] Nhận Notification:', data.data);
            useStore.getState().addNotification({
              id: data.data.id,
              title: data.data.title,
              severity: data.data.severity,
              timestamp: data.data.timestamp,
              read: false
            });
          } else if (data.type === 'threat_alert') {
            // Legacy format fallback
            eventBuffer.current.push(data.data);
          }
        } catch (e) {
          console.log('[WS] Received text message:', event.data);
        }
      };

      socket.onclose = (event) => {
        if (!isComponentMounted.current) return;
        
        console.log(`[WS] Disconnected. Code: ${event.code}, Reason: ${event.reason || 'None'}`);
        setWsConnected(false);
        ws.current = null;

        // Reconnect logic with exponential backoff (max 30s)
        const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`[WS] Reconnecting in ${backoff / 1000}s...`);
        reconnectAttempts.current += 1;
        
        reconnectTimeout.current = window.setTimeout(() => {
          connect();
        }, backoff);
      };

      socket.onerror = (error) => {
        console.error('[WS] Error:', error);
        // onclose will handle reconnect
      };
    };

    connect();

    return () => {
      // Mark as unmounted to prevent stale state updates and block reconnects
      isComponentMounted.current = false;
      
      // Clear pending reconnect timeout to stop reconnect loop
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      // Close socket explicitly during unmount
      if (ws.current) {
        console.log('[WS] Closing connection (Cleanup)');
        ws.current.close(1000, "Component unmounted");
        ws.current = null;
      }
    };
  }, [url]); // Only recreate if URL changes, ignore store actions

  // Setup Keep-alive Ping every 30s
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send('ping');
      }
    }, 30000);
    return () => clearInterval(pingInterval);
  }, []);

  return ws;
};

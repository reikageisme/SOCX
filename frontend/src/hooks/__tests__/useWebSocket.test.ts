import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { useStore } from '../../store/useStore';
import { act } from 'react';

// Mock zustand store
jest.mock('../../store/useStore', () => ({
  useStore: jest.fn(),
}));

// Mock crypto.randomUUID since it might not be available in test env
if (!global.crypto) {
  (global as any).crypto = {
    randomUUID: () => 'mock-uuid-1234'
  };
}

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  close = jest.fn();
  send = jest.fn();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 0);
  }
}

describe('useWebSocket reconnect logic', () => {
  let mockSetWsConnected: jest.Mock;
  let mockAddThreatEvent: jest.Mock;
  let originalWebSocket: any;
  let wsInstances: MockWebSocket[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    mockSetWsConnected = jest.fn();
    mockAddThreatEvent = jest.fn();
    
    (useStore as unknown as jest.Mock).mockImplementation((selector: any) => {
      const state = {
        setWsConnected: mockSetWsConnected,
        addThreatEvent: mockAddThreatEvent,
      };
      return selector(state);
    });

    originalWebSocket = global.WebSocket;
    wsInstances = [];
    global.WebSocket = jest.fn().mockImplementation((url) => {
      const instance = new MockWebSocket(url);
      wsInstances.push(instance);
      return instance;
    }) as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = originalWebSocket;
    jest.clearAllMocks();
  });

  it('handles exponential backoff on disconnects', () => {
    renderHook(() => useWebSocket('ws://localhost:8080'));

    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    // Initial connection succeeds
    act(() => {
      jest.runAllTimers();
    });

    expect(mockSetWsConnected).toHaveBeenCalledWith(true);

    // Simulate first disconnect
    act(() => {
      if (wsInstances[0].onclose) {
        wsInstances[0].onclose({ code: 1006, reason: 'Abnormal Closure' });
      }
    });

    expect(mockSetWsConnected).toHaveBeenCalledWith(false);

    // 1st backoff is 1s
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(1); // Not reconnected yet
    
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(2); // Reconnected

    // Simulate second disconnect immediately
    act(() => {
      if (wsInstances[1].onclose) {
        wsInstances[1].onclose({ code: 1006, reason: 'Abnormal Closure' });
      }
    });

    // 2nd backoff is 2s
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(2); // Not reconnected yet
    
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(3); // Reconnected

    // Simulate third disconnect
    act(() => {
      if (wsInstances[2].onclose) {
        wsInstances[2].onclose({ code: 1006, reason: 'Abnormal Closure' });
      }
    });

    // 3rd backoff is 4s
    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(3); 
    
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(global.WebSocket).toHaveBeenCalledTimes(4);
  });

  it('resets backoff after a successful connection', () => {
    renderHook(() => useWebSocket('ws://localhost:8080'));

    // Connect
    act(() => { jest.runAllTimers(); });

    // Disconnect #1
    act(() => { wsInstances[0].onclose?.({ code: 1006, reason: '' }); });

    // Reconnects after 1s
    act(() => { jest.advanceTimersByTime(1000); });
    expect(global.WebSocket).toHaveBeenCalledTimes(2);

    // This connection succeeds
    act(() => { 
      wsInstances[1].readyState = 1;
      wsInstances[1].onopen?.(); 
    });

    // Disconnect #2
    act(() => { wsInstances[1].onclose?.({ code: 1006, reason: '' }); });

    // Since it was successful, backoff resets to 1s
    act(() => { jest.advanceTimersByTime(1000); });
    expect(global.WebSocket).toHaveBeenCalledTimes(3);
  });
});

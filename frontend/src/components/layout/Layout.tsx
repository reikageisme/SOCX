import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useWebSocket } from '../../hooks/useWebSocket';

export const Layout = () => {
  // Initialize WebSocket connection at the layout level
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/threat-map`;
  useWebSocket(wsUrl);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-soc-dark text-soc-text font-sans overflow-hidden transition-all duration-300">
      <Sidebar isCollapsed={isSidebarCollapsed} toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div className="flex flex-col flex-1 overflow-hidden transition-all duration-300">
        <Header />
        <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-soc-dark to-[#0f1423]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

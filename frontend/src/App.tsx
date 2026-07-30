import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { ThreatMapPage } from './pages/ThreatMapPage';
import { Login } from './pages/Login';
import { RulesPage } from './pages/Rules';
import { LogsPage } from './pages/Logs';
import { SettingsPage } from './pages/Settings';
import { Assets } from './pages/Assets';
import { Incidents } from './pages/Incidents';
import { Pentest } from './pages/Pentest';
import { Forensics } from './pages/Forensics';
import { Topology } from './pages/Topology';
import { useStore } from './store/useStore';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="map" element={<ThreatMapPage />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="assets" element={<Assets />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="pentest" element={<Pentest />} />
            <Route path="forensics" element={<Forensics />} />
            <Route path="topology" element={<Topology />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

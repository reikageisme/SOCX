import React from 'react';
import { useStore } from '../../store/useStore';
import { MapCore } from './MapCore';

export const DashboardMap: React.FC = () => {
  const threatEvents = useStore((state) => state.threatEvents);
  const events = threatEvents.slice(0, 50);

  return (
    <div className="relative w-full h-[600px] bg-soc-card rounded-lg overflow-hidden border border-gray-800 shadow-xl">
      <MapCore events={events} />
    </div>
  );
};

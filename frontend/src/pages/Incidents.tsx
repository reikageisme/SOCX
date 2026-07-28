import React, { useEffect, useState } from 'react';

export const Incidents = () => {
  const [incidents, setIncidents] = useState<any[]>([]);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('http://localhost:8000/api/v1/incidents', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.incidents) {
          setIncidents(data.incidents);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchIncidents();
  }, []);

  const renderKanbanColumn = (status: str, title: str) => {
    const columnIncidents = incidents.filter(i => (i.status || 'New').toLowerCase() === status.toLowerCase());
    return (
      <div className="flex-1 min-w-[300px] bg-gray-800 p-4 rounded-lg flex flex-col gap-4">
        <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">{title} ({columnIncidents.length})</h2>
        {columnIncidents.map(inc => (
          <div key={inc.id} className="bg-gray-700 p-3 rounded shadow">
            <h3 className="font-bold truncate">{inc.title}</h3>
            <p className="text-sm text-gray-300">Severity: {inc.severity}</p>
            <p className="text-sm text-gray-300">Assignee: {inc.assignee || 'Unassigned'}</p>
            <p className="text-sm text-gray-300 mt-2">Source: {inc.source_ip}</p>
          </div>
        ))}
        {columnIncidents.length === 0 && <p className="text-gray-400 text-sm">No incidents</p>}
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Incident Workflow</h1>
      <div className="flex gap-6 overflow-x-auto pb-4 flex-1">
        {renderKanbanColumn('New', 'New')}
        {renderKanbanColumn('Investigating', 'Investigating')}
        {renderKanbanColumn('Resolved', 'Resolved')}
      </div>
    </div>
  );
};

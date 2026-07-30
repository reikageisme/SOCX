import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AISummaryButton } from '../components/AISummaryButton';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  assignee?: string;
  source_ip?: string;
  description?: string;
  created_at?: string;
  timeline_notes?: string;
  actions?: Array<{ id: string; action_type: string; status: string; target: string }>;
}

export const Incidents = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/v1/incidents', {
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

  const severityColor = (sev: string) => {
    switch (sev?.toLowerCase()) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'new': return 'bg-gray-500/20 text-gray-400';
      case 'investigating': return 'bg-blue-500/20 text-blue-400';
      case 'resolved': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const renderKanbanColumn = (status: string, title: string) => {
    const columnIncidents = incidents.filter(i => (i.status || 'New').toLowerCase() === status.toLowerCase());
    return (
      <div className="flex-1 min-w-[320px] bg-soc-card rounded-lg border border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            {title}
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
              {columnIncidents.length}
            </span>
          </h2>
        </div>
        <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto max-h-[calc(100vh-200px)]">
          {columnIncidents.map(inc => (
            <div
              key={inc.id}
              className="bg-soc-dark rounded-lg border border-gray-800 p-3 hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-white truncate flex-1 mr-2">
                  {inc.title}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded border ${severityColor(inc.severity)}`}>
                    {inc.severity}
                  </span>
                  <AISummaryButton
                    title={inc.title}
                    severity={inc.severity}
                    sourceIp={inc.source_ip || ''}
                    status={inc.status || 'New'}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-soc-muted">
                <span>Source: {inc.source_ip || 'N/A'}</span>
                <span className={`px-1.5 py-0.5 rounded ${statusColor(inc.status || 'New')}`}>
                  {inc.status || 'New'}
                </span>
              </div>

              {expandedId === inc.id && (
                <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-soc-muted">Assignee:</span>
                    <span className="text-gray-300">{inc.assignee || 'Unassigned'}</span>
                  </div>
                  {inc.timeline_notes && (
                    <div className="text-xs">
                      <span className="text-soc-muted">Notes:</span>
                      <p className="text-gray-400 mt-1">{inc.timeline_notes}</p>
                    </div>
                  )}
                  {inc.actions && inc.actions.length > 0 && (
                    <div className="text-xs">
                      <span className="text-soc-muted">Actions:</span>
                      <div className="mt-1 space-y-1">
                        {inc.actions.map((action, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              action.status === 'approved' ? 'bg-green-400' :
                              action.status === 'rejected' ? 'bg-red-400' : 'bg-yellow-400'
                            }`} />
                            <span className="text-gray-400">{action.action_type} → {action.target}</span>
                            <span className={`ml-auto ${
                              action.status === 'approved' ? 'text-green-400' :
                              action.status === 'rejected' ? 'text-red-400' : 'text-yellow-400'
                            }`}>{action.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {columnIncidents.length === 0 && (
            <p className="text-soc-muted text-sm text-center py-4">No incidents</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Incident Workflow</h1>
        <div className="flex items-center gap-2 text-xs text-soc-muted">
          <Sparkles className="w-4 h-4 text-soc-accent" />
          AI-powered incident summaries available on each card
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
        {renderKanbanColumn('New', 'New')}
        {renderKanbanColumn('Investigating', 'Investigating')}
        {renderKanbanColumn('Resolved', 'Resolved')}
      </div>
    </div>
  );
};

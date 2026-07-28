import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Filter, ChevronDown, ChevronUp, Clock, Target, User, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export const LogsPage: React.FC = () => {
  const token = useStore((state) => state.token);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      const res = await fetch('/api/v1/logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.json();
    },
    refetchInterval: 10000 // auto refresh every 10s
  });

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const filteredLogs = data?.logs?.filter((log: AuditLog) => 
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) || 
    log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.actor.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    if (!filteredLogs) return;
    const header = "ID,Actor,Action,Target,Timestamp,Details\n";
    const csv = filteredLogs.map((l: AuditLog) => 
      `${l.id},${l.actor},${l.action},${l.target},${l.timestamp},"${l.details.replace(/"/g, '""')}"`
    ).join("\n");
    
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_audit_logs_${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">System Logs</h1>
        <button 
          onClick={exportCSV}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-medium transition-colors border border-slate-700 flex items-center gap-2"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      <div className="bg-slate-900/50 rounded-2xl border border-slate-700 flex flex-col flex-1 backdrop-blur-md overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-700 flex gap-4 items-center bg-slate-800/30">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-slate-400" />
            </div>
            <input 
              type="text" 
              placeholder="Search by action, target or actor..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 w-full text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          <button className="bg-slate-800 p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors">
            <Filter size={20} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/80 text-slate-400 text-sm uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="p-4 font-medium"><Clock size={16} className="inline mr-2" /> Timestamp</th>
                <th className="p-4 font-medium"><User size={16} className="inline mr-2" /> Actor</th>
                <th className="p-4 font-medium"><Activity size={16} className="inline mr-2" /> Action</th>
                <th className="p-4 font-medium"><Target size={16} className="inline mr-2" /> Target</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {isLoading && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading logs...</td></tr>
              )}
              {filteredLogs?.map((log: AuditLog) => (
                <React.Fragment key={log.id}>
                  <tr className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4 whitespace-nowrap text-sm font-mono text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 whitespace-nowrap font-medium text-indigo-300">{log.actor}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="bg-slate-800 text-teal-300 px-2 py-1 rounded text-sm border border-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap text-slate-300">{log.target}</td>
                    <td className="p-4 whitespace-nowrap text-right">
                      <button 
                        onClick={() => toggleRow(log.id)}
                        className="p-1 rounded-md text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        {expandedRows.has(log.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </td>
                  </tr>
                  {expandedRows.has(log.id) && (
                    <tr className="bg-slate-950/50">
                      <td colSpan={5} className="p-4 border-b border-slate-800">
                        <pre className="text-xs text-emerald-400/80 font-mono overflow-x-auto p-4 bg-slate-900 rounded-xl border border-slate-800">
                          {JSON.stringify(JSON.parse(log.details), null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredLogs?.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No logs found matching criteria</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

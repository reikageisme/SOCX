import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';
import { Shield, Key, Clock, AlertTriangle, CheckCircle, RefreshCw, Info, Lock } from 'lucide-react';

export const AccessReview: React.FC = () => {
  const token = useStore((state) => state.token);
  const userRole = useStore((state) => state.userRole);
  
  const [activeTab, setActiveTab] = useState<'grants' | 'credentials'>('grants');
  const [grants, setGrants] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Initialize DB seed
  useEffect(() => {
    if (userRole === 'superadmin') {
      apiFetch('/api/v1/access-review/seed', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        .then(() => fetchAllData())
        .catch(() => fetchAllData());
    }
  }, [token, userRole]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [grantsRes, credsRes] = await Promise.all([
        apiFetch('/api/v1/access-review/grants', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/v1/access-review/credentials', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setGrants(await grantsRes.json());
      setCredentials(await credsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewGrant = async (grantId: string) => {
    setActionLoading(grantId);
    try {
      await apiFetch(`/api/v1/access-review/grants/${grantId}/review`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchAllData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRotateCred = async (credId: string) => {
    if (!window.confirm("Please manually rotate this credential in the respective service first. Click OK to confirm you have rotated the credential and want to reset the rotation timestamp.")) return;
    
    setActionLoading(credId);
    try {
      await apiFetch(`/api/v1/access-review/credentials/${credId}/rotate`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchAllData();
    } finally {
      setActionLoading(null);
    }
  };

  if (userRole !== 'superadmin') {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-slate-400">
        <Lock size={64} className="mb-4 text-rose-500/50" />
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p>This module is restricted to Super Administrators only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white max-w-6xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
            <Shield size={32} className="text-indigo-400" />
            Access Review & License Tracking
          </h1>
          <p className="text-slate-400 mt-1">Centralized IAM auditing and API quota management.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          className={`px-6 py-3 font-medium transition-colors ${activeTab === 'grants' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/10' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setActiveTab('grants')}
        >
          Access Grants Review
        </button>
        <button
          className={`px-6 py-3 font-medium transition-colors ${activeTab === 'credentials' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/10' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setActiveTab('credentials')}
        >
          Credentials & Licenses
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center p-12 text-slate-500"><RefreshCw className="animate-spin" /></div>
        ) : activeTab === 'grants' ? (
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-800/80 text-slate-300 text-xs uppercase">
                <tr>
                  <th className="p-4">Staff Member</th>
                  <th className="p-4">System</th>
                  <th className="p-4">Permission</th>
                  <th className="p-4">Next Review</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {grants.map(g => (
                  <tr key={g.id} className="hover:bg-slate-800/30">
                    <td className="p-4">
                      <div className="font-bold text-slate-200">{g.staff.full_name}</div>
                      <div className="text-xs text-slate-500">{g.staff.email}</div>
                    </td>
                    <td className="p-4 text-indigo-300 font-medium">{g.system.name}</td>
                    <td className="p-4"><span className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700">{g.permission_level}</span></td>
                    <td className="p-4 font-mono text-sm text-slate-400">{new Date(g.next_review_due).toLocaleDateString()}</td>
                    <td className="p-4">
                      {g.status === 'pending_review' ? (
                        <span className="text-amber-400 flex items-center gap-1 text-sm font-bold"><AlertTriangle size={14} /> Pending</span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1 text-sm font-bold"><CheckCircle size={14} /> Active</span>
                      )}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleReviewGrant(g.id)}
                        disabled={actionLoading === g.id}
                        className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {actionLoading === g.id ? 'Saving...' : 'Mark as Reviewed'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {credentials.map(c => {
              const usagePct = c.quota_limit ? (c.current_usage / c.quota_limit) * 100 : 0;
              const isDanger = usagePct > 90;
              const isWarn = usagePct > 70;
              
              const rotateDays = Math.floor((new Date().getTime() - new Date(c.last_rotated_at).getTime()) / (1000 * 3600 * 24));
              const rotateDanger = rotateDays > 90;

              return (
                <div key={c.id} className="bg-slate-900/50 rounded-xl border border-slate-800 p-5 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Key size={18} className="text-purple-400" /> {c.system.name}
                      </h3>
                      <div className="text-xs text-slate-400 mt-1">Owner: {c.owner.full_name} ({c.owner.department})</div>
                    </div>
                    <span className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700">{c.credential_type}</span>
                  </div>
                  
                  <div className="space-y-4 mb-4 flex-1">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">API Quota ({c.quota_period})</span>
                        <span className="font-mono text-slate-300">{c.current_usage} / {c.quota_limit || '∞'}</span>
                      </div>
                      {c.quota_limit && (
                        <div className="w-full bg-slate-800 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${isDanger ? 'bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.5)]' : isWarn ? 'bg-amber-500' : 'bg-purple-500'}`} 
                            style={{ width: `${Math.min(usagePct, 100)}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`p-2 rounded border ${rotateDanger ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-400'}`}>
                        <div className="font-semibold mb-0.5">Last Rotated</div>
                        <div className="font-mono">{new Date(c.last_rotated_at).toLocaleDateString()}</div>
                        {rotateDanger && <div className="mt-1 font-bold">Overdue!</div>}
                      </div>
                      <div className="p-2 rounded border bg-slate-800/50 border-slate-700/50 text-slate-400">
                        <div className="font-semibold mb-0.5">Expires At</div>
                        <div className="font-mono">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never'}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Info size={12} /> {c.notes}</div>
                    <button
                      onClick={() => handleRotateCred(c.id)}
                      disabled={actionLoading === c.id}
                      className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={actionLoading === c.id ? 'animate-spin' : ''} /> 
                      Rotate Now
                    </button>
                  </div>
                </div>
              );
            })}
            
            {credentials.length === 0 && <div className="col-span-2 text-center p-8 text-slate-500">No credentials found.</div>}
          </div>
        )}
      </div>
    </div>
  );
};

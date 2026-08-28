import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';
import { ShieldAlert, Server, Activity } from 'lucide-react';

interface Asset {
  id: string;
  hostname: string;
  ip_address: string;
  os_version: string;
  criticality: string;
  owner: string;
  cves: string;
  protection_profile?: string;
  waf_enabled?: boolean;
}

export const Assets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const token = useStore((state) => state.token);

  const fetchAssets = async () => {
    try {
      const res = await apiFetch('/api/v1/assets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setAssets(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { fetchAssets(); }, [token]);

  const toggleWaf = async (asset: Asset) => {
    try {
      const newStatus = !asset.waf_enabled;
      const res = await apiFetch(`/api/v1/assets/${asset.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          waf_enabled: newStatus,
          protection_profile: newStatus ? 'Critical WAF' : 'Standard'
        })
      });
      if (res.ok) fetchAssets();
    } catch (e) { console.error(e); }
  };

  const parseCVEs = (cvesStr: string) => {
    try {
      const parsed = JSON.parse(cvesStr);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch { return []; }
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-6 animate-fade-in text-white">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-inter bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">Asset Inventory</h1>
        <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-3 py-1 rounded-full">Scanning module removed for performance</span>
      </div>

      <div className="bg-slate-900/50 rounded-2xl border border-slate-700 flex flex-col flex-1 backdrop-blur-md overflow-hidden">
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/80 text-slate-400 text-sm uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="p-4 font-medium"><Server size={16} className="inline mr-2" /> Hostname</th>
                <th className="p-4 font-medium">IP Address</th>
                <th className="p-4 font-medium">Protection Profile</th>
                <th className="p-4 font-medium"><Activity size={16} className="inline mr-2" /> Criticality</th>
                <th className="p-4 font-medium"><ShieldAlert size={16} className="inline mr-2 text-rose-500" /> Vulnerabilities (CVEs)</th>
                <th className="p-4 font-medium">WAF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {assets.map(asset => {
                const cves = parseCVEs(asset.cves);
                return (
                  <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 whitespace-nowrap font-medium text-indigo-300">{asset.hostname}</td>
                    <td className="p-4 whitespace-nowrap text-sm font-mono text-slate-400">{asset.ip_address}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 w-fit ${
                        asset.waf_enabled ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        <ShieldAlert size={12} className={asset.waf_enabled ? 'text-indigo-400' : ''} />
                        {asset.protection_profile || 'Standard'}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase border ${
                        asset.criticality === 'high' ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 
                        asset.criticality === 'medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {asset.criticality}
                      </span>
                    </td>
                    <td className="p-4">
                      {cves.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cves.map((cve: string) => (
                            <span key={cve} className="px-2 py-0.5 rounded text-xs font-mono bg-rose-900/50 text-rose-300 border border-rose-800/50">{cve}</span>
                          ))}
                        </div>
                      ) : <span className="text-slate-500 text-sm">No known CVEs</span>}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <button 
                        onClick={() => toggleWaf(asset)}
                        className={`w-8 h-4 rounded-full relative transition-colors ${asset.waf_enabled ? 'bg-indigo-500' : 'bg-slate-600'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${asset.waf_enabled ? 'translate-x-4' : ''}`}></span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {assets.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No assets found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

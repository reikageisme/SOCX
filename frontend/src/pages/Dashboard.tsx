import { useDashboardMetrics, useProxmoxRRD } from '../hooks/useProxmox';
import { useStore } from '../store/useStore';
import { Server, Cpu, HardDrive, ShieldAlert, Monitor, Camera, ShieldBan } from 'lucide-react';
import { useSlaMetrics } from '../hooks/useAnalytics';
import { Clock, Timer, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

const Sparkline = ({ nodeName, type }: { nodeName: string, type: 'cpu' | 'mem' }) => {
  const { data } = useProxmoxRRD(nodeName);
  if (!data || !data.data || data.data.length === 0) return null;
  
  // RRD returns cpu (0-1) and mem (bytes)
  const chartData = data.data.map((d: any) => ({
    time: d.time,
    value: type === 'cpu' ? (d.cpu || 0) * 100 : (d.mem || 0) / 1024 / 1024 / 1024
  }));

  // Highlight red if avg of last 5 points is > 80% (cpu)
  const isHigh = type === 'cpu' && chartData.slice(-5).filter((d: any) => d.value > 80).length >= 5;
  const color = isHigh ? '#ef4444' : (type === 'cpu' ? '#10b981' : '#f59e0b');

  return (
    <div className="w-16 h-6 inline-block ml-2 align-middle opacity-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <YAxis domain={type === 'cpu' ? [0, 100] : ['auto', 'auto']} hide />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const ProxmoxNodeRow = ({ node, vms }: { node: any, vms: any[] }) => {
  const userRole = useStore((state) => state.userRole);
  const token = useStore((state) => state.token);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = async (vmid: number, action: string) => {
    setActionLoading(`${vmid}-${action}`);
    try {
      const res = await apiFetch(`/api/v1/proxmox/nodes/${node.node}/vms/${vmid}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (!res.ok) {
        const error = await res.json();
        alert(`Action failed: ${error.detail}`);
      } else {
        if (action === 'isolate' || action === 'snapshot') {
          alert(`Incident created for ${action} approval.`);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setActionLoading(null);
  };

  const handleConsole = async (vm: any) => {
    try {
      const response = await apiFetch('/api/v1/proxmox/config');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.host) {
          const type = vm.type === 'qemu' ? 'kvm' : 'lxc';
          const proxmoxUrl = `https://${data.host}:8006/?console=${type}&novnc=1&vmid=${vm.vmid}&vmname=${vm.name}&node=${vm.node}`;
          window.open(proxmoxUrl, '_blank');
        } else {
          alert("Proxmox host configuration missing in backend.");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Failed to fetch Proxmox config. Please check backend.");
    }
  };

  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors bg-soc-card">
        <td className="py-4 font-medium text-white flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-soc-success"></div>
          {node.node} <span className="text-xs text-soc-muted font-normal border border-gray-700 px-1.5 rounded-sm">Node</span>
        </td>
        <td className="py-4">
          <span className="px-2 py-1 bg-soc-success/10 text-soc-success text-xs rounded-full border border-soc-success/20">
            {node.status}
          </span>
        </td>
        <td className="py-4 text-soc-muted">
          {(node.cpu * 100).toFixed(1)}%
          <Sparkline nodeName={node.node} type="cpu" />
        </td>
        <td className="py-4 text-soc-muted">
          {(node.mem / 1024 / 1024 / 1024).toFixed(1)} GB
          <Sparkline nodeName={node.node} type="mem" />
        </td>
        <td className="py-4"></td>
      </tr>
      
      {vms.length === 0 ? (
        <tr>
          <td colSpan={5} className="py-2 pl-8 text-soc-muted text-xs italic">No VMs/LXCs found.</td>
        </tr>
      ) : (
        vms.map((vm: any) => (
          <tr key={`${node.node}-${vm.vmid}`} className="group border-b border-gray-800/20 bg-black/20 text-sm hover:bg-white/[0.01] transition-colors">
            <td className="py-2 pl-8 text-soc-muted font-mono flex items-center gap-2">
              <span className="text-gray-600">└─</span> 
              {vm.type === 'lxc' ? '📦' : '🖥️'} {vm.name} 
              <span className="text-xs text-gray-500">({vm.vmid})</span>
            </td>
            <td className="py-2">
              <span className={`px-2 py-0.5 text-[10px] rounded-full border ${
                vm.status === 'running' 
                  ? 'bg-soc-success/10 text-soc-success border-soc-success/20' 
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {vm.status}
              </span>
            </td>
            <td className="py-2 text-soc-muted">{vm.cpu ? (vm.cpu * 100).toFixed(1) : '0.0'}%</td>
            <td className="py-2 text-soc-muted">{vm.maxmem ? (vm.mem / 1024 / 1024 / 1024).toFixed(1) : '0.0'} GB</td>
            <td className="py-2">
              {(userRole === 'superadmin' || userRole === 'Super_Administrator') && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleAction(vm.vmid, 'isolate')} disabled={!!actionLoading || vm.status !== 'running'} className="p-1 hover:bg-soc-alert/20 rounded text-soc-alert disabled:opacity-30 disabled:cursor-not-allowed" title="Isolate">
                    <ShieldBan size={14} className={actionLoading === `${vm.vmid}-isolate` ? 'animate-pulse' : ''} />
                  </button>
                  <button onClick={() => handleAction(vm.vmid, 'snapshot')} disabled={!!actionLoading} className="p-1 hover:bg-indigo-500/20 rounded text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed" title="Snapshot">
                    <Camera size={14} className={actionLoading === `${vm.vmid}-snapshot` ? 'animate-pulse' : ''} />
                  </button>
                  <button onClick={() => handleConsole(vm)} disabled={!!actionLoading} className="p-1 hover:bg-gray-500/20 rounded text-gray-400" title="View Console">
                    <Monitor size={14} />
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))
      )}
    </>
  );
};

export const Dashboard = () => {
  const [wsData, setWsData] = useState<{nodes: any[], vms: any[]} | null>(null);
  const { data: metricsData } = useDashboardMetrics();
  const { data: slaData } = useSlaMetrics();
  const userRole = useStore((state) => state.userRole);

  useEffect(() => {
    // Initial fetch for first render
    apiFetch('/api/v1/proxmox/nodes').then(res => res.json()).then(data => {
      if (data.status === 'success') {
        setWsData(prev => prev ? prev : { nodes: data.data, vms: [] });
      }
    }).catch(console.error);

    // WebSocket subscription
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = useStore.getState().token;
    if (!token) return;
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/infrastructure?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.nodes) {
          setWsData(data);
        }
      } catch (e) {
        console.error("Proxmox WS parsing error", e);
      }
    };
    
    return () => ws.close();
  }, []);

  return (
    <div className="space-y-6">
      {/* SLA & Response Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MTTD Card */}
        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 rounded-xl p-6 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-indigo-300 text-sm font-medium mb-1">Mean Time To Detect (MTTD)</p>
              <div className="flex items-end gap-3 mt-2">
                <h3 className="text-4xl font-bold text-white tracking-tight">
                  {slaData?.mttd?.value !== undefined && slaData.mttd.value !== null ? slaData.mttd.value : 'N/A'}
                  {slaData?.mttd?.value !== undefined && slaData.mttd.value !== null && <span className="text-lg font-normal text-indigo-200 ml-1.5">{slaData?.mttd?.unit || 'min'}</span>}
                </h3>
                {slaData?.mttd?.trend && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md mb-1.5 ${
                    slaData.mttd.trend.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {slaData.mttd.trend}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">{slaData?.mttd?.value === null ? "Not enough data" : "Average time to detect a potential threat"}</p>
            </div>
            <div className="p-3 bg-indigo-500/20 rounded-xl shadow-inner border border-indigo-400/20">
              <Clock className="w-7 h-7 text-indigo-400" />
            </div>
          </div>
        </div>

        {/* MTTR Card */}
        <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 rounded-xl p-6 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-emerald-300 text-sm font-medium mb-1">Mean Time To Respond (MTTR)</p>
              <div className="flex items-end gap-3 mt-2">
                <h3 className="text-4xl font-bold text-white tracking-tight">
                  {slaData?.mttr?.value !== undefined && slaData.mttr.value !== null ? slaData.mttr.value : 'N/A'}
                  {slaData?.mttr?.value !== undefined && slaData.mttr.value !== null && <span className="text-lg font-normal text-emerald-200 ml-1.5">{slaData?.mttr?.unit || 'min'}</span>}
                </h3>
                {slaData?.mttr?.trend && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md mb-1.5 ${
                    slaData.mttr.trend.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {slaData.mttr.trend}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">
                {slaData?.mttr?.value === null ? "Not enough data" : `Based on ${slaData?.resolved_count || 0} resolved incidents`}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/20 rounded-xl shadow-inner border border-emerald-400/20">
              <Timer className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-soc-accent/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-soc-muted text-sm font-medium mb-1">Hypervisor Nodes</p>
              <h3 className="text-3xl font-bold text-white">{!wsData ? '-' : (wsData?.nodes?.length || 0)}</h3>
            </div>
            <div className="p-3 bg-soc-accent/10 rounded-lg">
              <Server className="w-6 h-6 text-soc-accent" />
            </div>
          </div>
        </div>

        <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-soc-alert/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-soc-muted text-sm font-medium mb-1">Active Alerts</p>
              <h3 className="text-3xl font-bold text-white">{metricsData?.active_alerts !== undefined ? metricsData.active_alerts : '-'}</h3>
            </div>
            <div className="p-3 bg-soc-alert/10 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-soc-alert" />
            </div>
          </div>
        </div>

        <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-soc-success/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-soc-muted text-sm font-medium mb-1">CPU Load</p>
              <h3 className="text-3xl font-bold text-white">{metricsData?.cpu_load_percent !== undefined ? `${metricsData.cpu_load_percent}%` : '-'}</h3>
            </div>
            <div className="p-3 bg-soc-success/10 rounded-lg">
              <Cpu className="w-6 h-6 text-soc-success" />
            </div>
          </div>
        </div>
        
        <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-soc-warning/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-soc-muted text-sm font-medium mb-1">Cluster Storage</p>
              <h3 className="text-3xl font-bold text-white">{metricsData?.storage_usage_percent !== undefined ? `${metricsData.storage_usage_percent}%` : '-'}</h3>
            </div>
            <div className="p-3 bg-soc-warning/10 rounded-lg">
              <HardDrive className="w-6 h-6 text-soc-warning" />
            </div>
          </div>
        </div>
      </div>

      <div className="h-[500px]">
        {/* Proxmox Nodes Table */}
        <div className="h-full bg-soc-card rounded-xl border border-gray-800 shadow-lg flex flex-col">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-soc-accent" />
              Proxmox Infrastructure
            </h3>
            <Link to="/infrastructure"
              className="ml-auto mr-3 text-sm text-soc-accent hover:text-sky-300 transition-colors">
              Xem chi tiết &rarr;
            </Link>
            {userRole === 'admin' && (
              <button className="flex items-center gap-1 bg-soc-accent/20 text-soc-accent hover:bg-soc-accent/30 px-3 py-1.5 rounded-lg text-sm transition-colors border border-soc-accent/30">
                <Plus size={16} /> New VM/CT
              </button>
            )}
          </div>
          <div className="p-6 flex-1 overflow-auto">
            {!wsData ? (
              <div className="flex items-center justify-center h-full text-soc-muted">Connecting to infrastructure stream...</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-soc-muted border-b border-gray-800">
                    <th className="pb-3 font-medium">Node</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">CPU</th>
                    <th className="pb-3 font-medium">Memory</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wsData?.nodes?.map((node: any) => (
                    <ProxmoxNodeRow key={node.node} node={node} vms={(wsData.vms || []).filter((vm: any) => vm.node === node.node)} />
                  ))}
                  {(!wsData?.nodes || wsData.nodes.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-soc-muted italic">
                        No nodes found or API connection failed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

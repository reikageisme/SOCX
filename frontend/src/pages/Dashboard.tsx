import { useProxmoxNodes, useProxmoxVms, useDashboardMetrics } from '../hooks/useProxmox';
import { useStore } from '../store/useStore';
import { Server, Cpu, HardDrive, ShieldAlert, Activity } from 'lucide-react';
import { DashboardMap } from '../components/map/DashboardMap';
import { useSlaMetrics } from '../hooks/useAnalytics';
import { Clock, Timer, Play, Square, RefreshCw, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useState } from 'react';

const ProxmoxNodeRow = ({ node }: { node: any }) => {
  const { data: vmsData, isLoading, refetch } = useProxmoxVms(node.node);
  const userRole = useStore((state) => state.userRole);
  const token = useStore((state) => state.token);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = async (vmid: number, action: string) => {
    setActionLoading(`${vmid}-${action}`);
    try {
      await apiFetch(`/api/v1/proxmox/nodes/${node.node}/vms/${vmid}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      setTimeout(() => refetch(), 2000); // refresh after 2 seconds
    } catch (e) {
      console.error(e);
    }
    setActionLoading(null);
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
        <td className="py-4 text-soc-muted">{(node.cpu * 100).toFixed(1)}%</td>
        <td className="py-4 text-soc-muted">{(node.mem / 1024 / 1024 / 1024).toFixed(1)} GB</td>
        <td className="py-4"></td>
      </tr>
      
      {isLoading ? (
        <tr>
          <td colSpan={5} className="py-2 pl-8 text-soc-muted text-xs italic">Loading VMs/LXCs...</td>
        </tr>
      ) : (
        [...(vmsData?.data?.qemu || []).map((v: any) => ({ ...v, type: 'qemu' })), ...(vmsData?.data?.lxc || []).map((v: any) => ({ ...v, type: 'lxc' }))].map((vm: any) => (
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
              {(userRole === 'admin' || userRole === 'sysadmin') && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleAction(vm.vmid, 'start')} disabled={!!actionLoading} className="p-1 hover:bg-soc-success/20 rounded text-soc-success" title="Start">
                    <Play size={14} />
                  </button>
                  <button onClick={() => handleAction(vm.vmid, 'stop')} disabled={!!actionLoading} className="p-1 hover:bg-soc-alert/20 rounded text-soc-alert" title="Stop">
                    <Square size={14} />
                  </button>
                  <button onClick={() => handleAction(vm.vmid, 'reboot')} disabled={!!actionLoading} className="p-1 hover:bg-soc-warning/20 rounded text-soc-warning" title="Reboot">
                    <RefreshCw size={14} className={actionLoading === `${vm.vmid}-reboot` ? 'animate-spin' : ''} />
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
  const { data: proxmoxData, isLoading, isError } = useProxmoxNodes();
  const { data: metricsData } = useDashboardMetrics();
  const { data: slaData } = useSlaMetrics();
  const threatEvents = useStore((state) => state.threatEvents);

  return (
    <div className="space-y-6">
      {/* Interactive Threat Map */}
      <DashboardMap />
      
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
                  {slaData?.mttd?.value !== undefined ? slaData.mttd.value : '-'}
                  <span className="text-lg font-normal text-indigo-200 ml-1.5">{slaData?.mttd?.unit || 'min'}</span>
                </h3>
                {slaData?.mttd?.trend && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md mb-1.5 ${
                    slaData.mttd.trend.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {slaData.mttd.trend}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">Average time to detect a potential threat</p>
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
                  {slaData?.mttr?.value !== undefined ? slaData.mttr.value : '-'}
                  <span className="text-lg font-normal text-emerald-200 ml-1.5">{slaData?.mttr?.unit || 'min'}</span>
                </h3>
                {slaData?.mttr?.trend && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md mb-1.5 ${
                    slaData.mttr.trend.startsWith('-') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {slaData.mttr.trend}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">Based on {slaData?.resolved_count || 0} resolved incidents</p>
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
              <h3 className="text-3xl font-bold text-white">{isLoading ? '-' : (proxmoxData?.data?.length || 0)}</h3>
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
            {userRole === 'admin' && (
              <button className="flex items-center gap-1 bg-soc-accent/20 text-soc-accent hover:bg-soc-accent/30 px-3 py-1.5 rounded-lg text-sm transition-colors border border-soc-accent/30">
                <Plus size={16} /> New VM/CT
              </button>
            )}
          </div>
          <div className="p-6 flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-soc-muted">Loading infrastructure data...</div>
            ) : isError ? (
              <div className="flex items-center justify-center h-full text-soc-alert">Failed to fetch Proxmox data</div>
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
                  {proxmoxData?.data?.map((node: any) => (
                    <ProxmoxNodeRow key={node.node} node={node} />
                  ))}
                  {(!proxmoxData?.data || proxmoxData.data.length === 0) && (
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

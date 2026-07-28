import { useProxmoxNodes, useDashboardMetrics } from '../hooks/useProxmox';
import { useStore } from '../store/useStore';
import { Server, Cpu, HardDrive, ShieldAlert, Activity } from 'lucide-react';
import { DashboardMap } from '../components/map/DashboardMap';

export const Dashboard = () => {
  const { data: proxmoxData, isLoading, isError } = useProxmoxNodes();
  const { data: metricsData } = useDashboardMetrics();
  const threatEvents = useStore((state) => state.threatEvents);

  return (
    <div className="space-y-6">
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
                  </tr>
                </thead>
                <tbody>
                  {proxmoxData?.data?.map((node: any) => (
                    <tr key={node.node} className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 font-medium text-white flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-soc-success"></div>
                        {node.node}
                      </td>
                      <td className="py-4">
                        <span className="px-2 py-1 bg-soc-success/10 text-soc-success text-xs rounded-full border border-soc-success/20">
                          {node.status}
                        </span>
                      </td>
                      <td className="py-4 text-soc-muted">{(node.cpu * 100).toFixed(1)}%</td>
                      <td className="py-4 text-soc-muted">{(node.mem / 1024 / 1024 / 1024).toFixed(1)} GB</td>
                    </tr>
                  ))}
                  {(!proxmoxData?.data || proxmoxData.data.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-soc-muted italic">
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

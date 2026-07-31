import { useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, Server, Globe, Shield, Activity, X, Play, Square, HardDrive, Cpu, AlertTriangle, MonitorSmartphone } from 'lucide-react';
import { useProxmoxVms } from '../hooks/useProxmox';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useStore } from '../store/useStore';

const useTopologyData = () => {
  const token = useStore((state) => state.token);
  return useQuery({
    queryKey: ['topology'],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/topology`);
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    },
    enabled: !!token,
    refetchInterval: 10000,
  });
};


// Custom Node Component
const CustomNode = ({ data, isConnectable }: NodeProps) => {
  const isOffline = data.status === 'offline';
  
  return (
    <div className={`relative px-4 py-3 shadow-lg rounded-xl border-2 bg-slate-900 min-w-[150px]
      ${isOffline ? 'border-rose-500 animate-pulse' : 'border-teal-500/50 hover:border-teal-400'}
      transition-colors cursor-pointer
    `}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="w-3 h-3 bg-teal-500 border-none" />
      
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          data.layer === 'wan' ? 'bg-blue-500/20 text-blue-400' :
          data.layer === 'lan' ? 'bg-amber-500/20 text-amber-400' :
          data.layer === 'overlay' ? 'bg-purple-500/20 text-purple-400' :
          isOffline ? 'bg-rose-500/20 text-rose-400' :
          'bg-teal-500/20 text-teal-400'
        }`}>
          {data.layer === 'wan' && <Globe size={20} />}
          {data.layer === 'lan' && <Shield size={20} />}
          {data.layer === 'hypervisor' && <Server size={20} />}
          {data.layer === 'vm' && <Server size={20} />}
          {data.layer === 'overlay' && (data.type === 'overlay_router' ? <Network size={20} /> : <MonitorSmartphone size={20} />)}
        </div>
        <div>
          <div className="font-bold text-slate-200 text-sm">{data.label as string}</div>
          {data.type === 'proxmox' && (
            <div className={`text-xs ${isOffline ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
              {isOffline ? 'OFFLINE' : `${(((data.cpu as number) || 0) * 100).toFixed(1)}% CPU`}
            </div>
          )}
        </div>
      </div>
      
      {isOffline && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-ping"></div>
      )}

      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="w-3 h-3 bg-teal-500 border-none" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

// Drill-down Modal
const NodeDetailsModal = ({ nodeName, onClose }: { nodeName: string, onClose: () => void }) => {
  const { data: vmsData, isLoading } = useProxmoxVms(nodeName);
  
  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-full">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 rounded-t-2xl">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Server className="text-teal-400" />
            Node: {nodeName}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-auto flex-1">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12 flex flex-col items-center gap-3">
              <Activity className="animate-spin text-teal-500" size={32} />
              Loading virtual machines...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...(vmsData?.data?.qemu || []), ...(vmsData?.data?.lxc || [])].map((vm: any) => (
                <div key={vm.vmid} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-colors group">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {vm.status === 'running' ? <Play size={16} className="text-emerald-400 fill-emerald-400/20" /> : <Square size={16} className="text-slate-500" />}
                      <span className="font-bold text-slate-200">{vm.name} <span className="text-slate-500 text-xs font-normal">({vm.vmid})</span></span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      vm.status === 'running' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {vm.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-400 mt-2">
                    <div className="flex items-center gap-1.5"><Cpu size={14} className="text-teal-500/70" /> {(vm.cpu * 100 || 0).toFixed(1)}%</div>
                    <div className="flex items-center gap-1.5"><HardDrive size={14} className="text-teal-500/70" /> {(vm.mem / 1024/1024/1024 || 0).toFixed(1)} GB</div>
                  </div>
                </div>
              ))}
              
              {(!vmsData?.data?.qemu && !vmsData?.data?.lxc) && (
                <div className="col-span-2 text-center text-slate-500 py-8">No VMs or Containers found on this node.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Topology = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { data: topologyData } = useTopologyData();
  
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isDosSimulated, setIsDosSimulated] = useState(false);

  useEffect(() => {
    if (!topologyData?.data) return;

    const layerConfig: Record<string, { y: number, xStart: number, spacing: number }> = {
      wan: { y: 50, xStart: 400, spacing: 200 },
      lan: { y: 150, xStart: 400, spacing: 200 },
      overlay: { y: 150, xStart: 700, spacing: 200 },
      hypervisor: { y: 300, xStart: 200, spacing: 300 },
      vm: { y: 450, xStart: 100, spacing: 200 }
    };

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const groupedNodes: Record<string, any[]> = {};
    topologyData.data.nodes.forEach((n: any) => {
      const layer = n.layer || 'lan';
      if (!groupedNodes[layer]) groupedNodes[layer] = [];
      groupedNodes[layer].push(n);
    });

    for (const [layer, lNodes] of Object.entries(groupedNodes)) {
      const config = layerConfig[layer] || { y: 300, xStart: 400, spacing: 200 };
      const total = lNodes.length;
      const startX = config.xStart - ((total - 1) * config.spacing) / 2;

      lNodes.forEach((n: any, idx: number) => {
        newNodes.push({
          id: n.id,
          position: { x: startX + idx * config.spacing, y: config.y },
          data: { ...n },
          type: 'custom'
        });
      });
    }

    topologyData.data.edges.forEach((e: any) => {
      newEdges.push({
        id: `e-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        animated: e.type === 'overlay_tunnel' || e.type === 'virtual_link',
        style: {
          stroke: isDosSimulated && e.source === 'wan' && e.target === 'firewall' ? '#ef4444' : (e.type.includes('overlay') ? '#a855f7' : '#14b8a6'),
          strokeWidth: isDosSimulated && e.source === 'wan' && e.target === 'firewall' ? 4 : 2
        },
        label: isDosSimulated && e.source === 'wan' && e.target === 'firewall' ? 'L7 DDoS Flood' : undefined,
        labelStyle: isDosSimulated ? { fill: '#ef4444', fontWeight: 'bold' } : undefined
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [topologyData, setNodes, setEdges, isDosSimulated]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: any, node: any) => {
    if (node.data?.layer === 'hypervisor' && node.data?.label) {
      setSelectedNode(node.data.label);
    }
  }, []);

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col relative">
      <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg shrink-0 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Network className="text-teal-400" />
            Live Network Topology
          </h2>
          <p className="text-slate-400 text-sm mt-1">Real-time architecture map. Click on a Proxmox node to drill down.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-4 text-xs font-medium text-slate-400">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> DDoS Traffic</div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500"></span> Normal Link</div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Tailscale Overlay</div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-600"></span> Offline Node</div>
          </div>
          <button 
            onClick={() => setIsDosSimulated(!isDosSimulated)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
              isDosSimulated 
                ? 'bg-rose-600/20 text-rose-400 border border-rose-500/50 hover:bg-rose-600/30' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Activity size={16} />
            {isDosSimulated ? 'Stop DoS Simulation' : 'Simulate DoS Attack'}
          </button>
        </div>
      </div>

      {isDosSimulated && (
        <div className="bg-rose-900/40 border border-rose-500/50 text-rose-200 p-4 rounded-xl flex items-center gap-3 animate-fade-in shadow-[0_0_15px_rgba(225,29,72,0.1)]">
          <AlertTriangle className="text-rose-400 animate-pulse shrink-0" size={24} />
          <div>
            <h4 className="font-bold">Critical Bottleneck Detected at ACS Firewall!</h4>
            <p className="text-sm opacity-90">Inbound traffic exceeding 10Gbps. Automatic BGP Null Routing is highly recommended to mitigate upstream impact.</p>
          </div>
          <button className="ml-auto bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-colors whitespace-nowrap">
            Apply BGP Null Route
          </button>
        </div>
      )}

      <div className="flex-1 bg-soc-card rounded-xl border border-gray-800 overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onConnect={onConnect}
          fitView
          className="bg-[#0b1120]"
          colorMode="dark"
        >
          <Controls className="bg-slate-800 border-slate-700 fill-slate-300" />
          <MiniMap className="bg-slate-900 border-slate-800" maskColor="rgba(0,0,0,0.6)" nodeColor={(n) => n.data?.type === 'proxmox' && n.data?.status === 'offline' ? '#ef4444' : '#14b8a6'} />
          <Background gap={24} size={1.5} color="#1e293b" />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeDetailsModal nodeName={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
};

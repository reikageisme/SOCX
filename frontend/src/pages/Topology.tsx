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
import { Network, Server, Globe, Shield, Activity, X, Play, Square, HardDrive, Cpu } from 'lucide-react';
import { useProxmoxNodes, useProxmoxVms } from '../hooks/useProxmox';

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
          data.type === 'internet' ? 'bg-blue-500/20 text-blue-400' :
          data.type === 'firewall' ? 'bg-amber-500/20 text-amber-400' :
          isOffline ? 'bg-rose-500/20 text-rose-400' :
          'bg-teal-500/20 text-teal-400'
        }`}>
          {data.type === 'internet' && <Globe size={20} />}
          {data.type === 'firewall' && <Shield size={20} />}
          {data.type === 'proxmox' && <Server size={20} />}
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
  const { data: proxmoxData } = useProxmoxNodes();
  
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    const baseNodes = [
      { 
        id: 'internet', 
        position: { x: 400, y: 50 }, 
        data: { label: 'Internet / WAN', type: 'internet' }, 
        type: 'custom' 
      },
      { 
        id: 'firewall', 
        position: { x: 400, y: 150 }, 
        data: { label: 'ACS Firewall (pfSense)', type: 'firewall' }, 
        type: 'custom' 
      }
    ];

    const baseEdges = [
      { 
        id: 'e-internet-firewall', 
        source: 'internet', 
        target: 'firewall', 
        animated: true, 
        style: { stroke: '#ef4444', strokeWidth: 3 }, // Simulated heavy traffic (DDoS)
        label: 'High Traffic',
        labelStyle: { fill: '#ef4444', fontWeight: 'bold' }
      }
    ];

    if (proxmoxData?.data && Array.isArray(proxmoxData.data)) {
      const pveNodes = proxmoxData.data.map((node: any, idx: number) => {
        const total = proxmoxData.data.length;
        const width = 600;
        const startX = 400 - (width / 2);
        const step = total > 1 ? width / (total - 1) : 0;
        const x = total === 1 ? 400 : startX + (idx * step);

        return {
          id: `pve-${node.node}`,
          position: { x, y: 300 },
          data: { 
            label: `Proxmox Node: ${node.node}`, 
            type: 'proxmox',
            status: node.status,
            cpu: node.cpu,
            nodeName: node.node
          },
          type: 'custom'
        };
      });

      const pveEdges = proxmoxData.data.map((node: any) => ({
        id: `e-firewall-pve-${node.node}`,
        source: 'firewall',
        target: `pve-${node.node}`,
        animated: node.status !== 'offline',
        style: { 
          stroke: node.status === 'offline' ? '#475569' : '#14b8a6', 
          strokeWidth: node.status === 'offline' ? 1 : 2 
        }
      }));

      setNodes([...baseNodes, ...pveNodes]);
      setEdges([...baseEdges, ...pveEdges]);
    } else {
      setNodes(baseNodes);
      setEdges(baseEdges);
    }
  }, [proxmoxData, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: any, node: any) => {
    if (node.data?.type === 'proxmox' && node.data?.nodeName) {
      setSelectedNode(node.data.nodeName);
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
        <div className="flex gap-4 text-xs font-medium text-slate-400">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span> DDoS Traffic</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500"></span> Normal Link</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-600"></span> Offline Node</div>
        </div>
      </div>

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

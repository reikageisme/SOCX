import { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, Server } from 'lucide-react';
import { useProxmoxNodes } from '../hooks/useProxmox';

const initialNodes = [
  { id: '1', position: { x: 400, y: 50 }, data: { label: 'Internet / WAN' }, type: 'input' },
  { id: '2', position: { x: 400, y: 150 }, data: { label: 'ACS Firewall (pfSense)' } },
  { id: '3', position: { x: 200, y: 300 }, data: { label: 'Proxmox Node 1' } },
  { id: '4', position: { x: 600, y: 300 }, data: { label: 'Proxmox Node 2' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#6366f1' } },
  { id: 'e2-3', source: '2', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
];

export const Topology = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { data: proxmoxData } = useProxmoxNodes();

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="bg-soc-card rounded-xl p-6 border border-gray-800 shadow-lg shrink-0">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Network className="text-soc-accent" />
          Network Topology (Architecture)
        </h2>
        <p className="text-soc-muted text-sm mt-1">Interactive infrastructure map</p>
      </div>

      <div className="flex-1 bg-soc-card rounded-xl border border-gray-800 overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          className="bg-black/50"
          colorMode="dark"
        >
          <Controls className="bg-gray-800 border-gray-700 fill-white" />
          <MiniMap className="bg-gray-900 border-gray-800" maskColor="rgba(0,0,0,0.5)" />
          <Background gap={16} size={1} color="#374151" />
        </ReactFlow>
      </div>
    </div>
  );
};

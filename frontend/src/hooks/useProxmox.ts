import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';

const API_BASE_URL = '/api/v1';

export const useProxmoxNodes = () => {
  const token = useStore((state) => state.token);

  return useQuery({
    queryKey: ['proxmoxNodes'],
    queryFn: async () => {
      const response = await apiFetch(`${API_BASE_URL}/proxmox/nodes`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: !!token,
  });
};

export const useProxmoxVms = (nodeName: string) => {
  const token = useStore((state) => state.token);

  return useQuery({
    queryKey: ['proxmoxVms', nodeName],
    queryFn: async () => {
      const response = await apiFetch(`${API_BASE_URL}/proxmox/nodes/${nodeName}/vms`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
      enabled: !!nodeName && !!token,
    });
};

export const useProxmoxRRD = (nodeName: string) => {
  const token = useStore((state) => state.token);

  return useQuery({
    queryKey: ['proxmoxRrd', nodeName],
    queryFn: async () => {
      const response = await apiFetch(`${API_BASE_URL}/proxmox/nodes/${nodeName}/rrddata`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: !!nodeName && !!token,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
  });
};
  
  export const useDashboardMetrics = () => {
    const token = useStore((state) => state.token);
  
    return useQuery({
      queryKey: ['dashboardMetrics'],
      queryFn: async () => {
        const response = await apiFetch(`${API_BASE_URL}/system/dashboard-metrics`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      enabled: !!token,
      refetchInterval: 5000 // Refetch every 5 seconds for real-time feel
    });
  };

import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';

const API_BASE_URL = '/api/v1';

export const useProxmoxNodes = () => {
  const token = useStore((state) => state.token);

  return useQuery({
    queryKey: ['proxmoxNodes'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/proxmox/nodes`, { 
        headers: {
          'Authorization': `Bearer ${token}`
        } 
      });
      if (!response.ok) {
        if (response.status === 401) {
          useStore.getState().setToken(null);
        }
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
      const response = await fetch(`${API_BASE_URL}/proxmox/nodes/${nodeName}/vms`, { 
        headers: {
          'Authorization': `Bearer ${token}`
        } 
      });
      if (!response.ok) {
        if (response.status === 401) {
          useStore.getState().setToken(null);
        }
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
      enabled: !!nodeName && !!token,
    });
  };
  
  export const useDashboardMetrics = () => {
    const token = useStore((state) => state.token);
  
    return useQuery({
      queryKey: ['dashboardMetrics'],
      queryFn: async () => {
        const response = await fetch(`${API_BASE_URL}/system/dashboard-metrics`, { 
          headers: {
            'Authorization': `Bearer ${token}`
          } 
        });
        if (!response.ok) {
          if (response.status === 401) {
            useStore.getState().setToken(null);
          }
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      enabled: !!token,
      refetchInterval: 5000 // Refetch every 5 seconds for real-time feel
    });
  };

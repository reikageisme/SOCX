import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';

const API_BASE_URL = '/api/v1';

export const useSlaMetrics = () => {
  const token = useStore((state) => state.token);

  return useQuery({
    queryKey: ['slaMetrics'],
    queryFn: async () => {
      const response = await apiFetch(`${API_BASE_URL}/analytics/sla`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: !!token,
    refetchInterval: 30000 // Refetch every 30 seconds
  });
};

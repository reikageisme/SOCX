import { useStore } from '../store/useStore';

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = useStore.getState().token;
  const headers = new Headers(init?.headers);
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    useStore.getState().setToken(null);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
};

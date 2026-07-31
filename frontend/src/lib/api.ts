import { useStore } from '../store/useStore';

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = useStore.getState().token;
  const headers = new Headers(init?.headers);
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Add cache buster for GET requests
  let urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (!init?.method || init.method.toUpperCase() === 'GET') {
    const sep = urlStr.includes('?') ? '&' : '?';
    urlStr = `${urlStr}${sep}_t=${new Date().getTime()}`;
  }

  const response = await fetch(urlStr, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (response.status === 401) {
    useStore.getState().setToken(null);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
};

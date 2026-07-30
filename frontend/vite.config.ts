import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins: any[] = [react()];
  
  if (command === 'serve') {
    const mkcert = (await import('vite-plugin-mkcert')).default;
    plugins.push(mkcert({ hosts: ['localhost', '192.168.56.132'] }));
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0'
    }
  }
})

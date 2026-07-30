import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  return {
    plugins: [
      react(),
      command === 'serve' ? mkcert({ hosts: ['localhost', '192.168.56.132'] }) : undefined
    ],
    server: {
      host: '0.0.0.0'
    }
  }
})

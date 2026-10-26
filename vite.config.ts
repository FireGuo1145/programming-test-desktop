import { defineConfig } from 'vite'
import server from './server.config.json'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: { '/backend': { target: server.apiBase, changeOrigin: true, rewrite: path => path.replace(/^\/backend/, '') } } },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer/src'),
      '@shared': path.resolve(__dirname, 'src/main/shared')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
})

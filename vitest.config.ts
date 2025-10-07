import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/main/shared')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**', 'out/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    css: {
      modules: {
        classNameStrategy: 'stable'
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/renderer/src/**/*.{ts,tsx}'],
      exclude: ['src/renderer/src/**/*.d.ts']
    }
  }
})

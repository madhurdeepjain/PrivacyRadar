import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const sharedAliases = {
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  '@shared': resolve(__dirname, 'src/main/shared'),
  '@infra': resolve(__dirname, 'src/main/infrastructure'),
  '@app': resolve(__dirname, 'src/main/app'),
  '@main': resolve(__dirname, 'src/main'),
  '@config': resolve(__dirname, 'src/main/config'),
  '@core': resolve(__dirname, 'src/main/core')
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: sharedAliases
  },
  test: {
    globals: true,
    css: {
      modules: {
        classNameStrategy: 'stable'
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: [
        'src/main/**/*.{ts,tsx}',
        'src/renderer/src/**/*.{ts,tsx}'
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'tests/**',
        'out/**',
        'dist/**',
        '**/*.config.{ts,js}',
        '**/index.ts'
      ],
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 65,
        lines: 65
      }
    },
    projects: [
      {
        name: 'node',
        resolve: {
          alias: sharedAliases
        },
        test: {
          include: [
            'tests/integration/**/*.spec.{ts,tsx}',
            'tests/unit/**/*.spec.{ts,tsx}',
            'tests/security/**/*.spec.{ts,tsx}'
          ],
          exclude: [
            'tests/e2e/**',
            'tests/unit/renderer/**',
            'node_modules/**',
            'dist/**',
            'out/**'
          ],
          environment: 'node',
          setupFiles: [
            'tests/setup.ts',
            'tests/integration/setup.ts'
          ]
        }
      },
      {
        name: 'jsdom',
        resolve: {
          alias: sharedAliases
        },
        test: {
          include: [
            'tests/unit/renderer/**/*.test.{ts,tsx}'
          ],
          exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**', 'out/**'],
          environment: 'jsdom',
          setupFiles: [
            'tests/setup.ts'
          ]
        }
      }
    ]
  }
})

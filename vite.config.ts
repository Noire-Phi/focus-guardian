/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // npm run test:coverage: how much of the app the tests run, per file
    coverage: {
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/**/*.testutil.ts', 'src/main.tsx'],
      reporter: ['text', 'html'],
    },
  },
})

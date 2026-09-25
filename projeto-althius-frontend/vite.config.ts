/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), ...(process.env.VITEST ? [] : [tailwindcss()])],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 20000,
    fileParallelism: false,
  },
})

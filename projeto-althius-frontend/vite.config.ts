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
    // No CI (runner de 2 núcleos, ~10 min de suíte) testes de interface com corrida de tempo falham ao acaso, um diferente a
    // cada rodada. Uma nova tentativa só no CI absorve isso sem esconder falha real: um teste quebrado falha nas três.
    retry: process.env.CI ? 2 : 0,
  },
})

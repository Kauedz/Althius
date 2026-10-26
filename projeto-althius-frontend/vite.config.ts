/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'aviso-do-google-ausente',
    apply: 'build',
    configResolved(config) {
      const ambiente = loadEnv(config.mode, config.envDir, 'VITE_GOOGLE_CLIENT_ID')
      if (config.mode === 'production' && !ambiente.VITE_GOOGLE_CLIENT_ID) {
        config.logger.warn('Aviso: VITE_GOOGLE_CLIENT_ID está vazio. O acesso com Google não será oferecido neste build.')
      }
    },
  }, react(), ...(process.env.VITEST ? [] : [tailwindcss()])],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 20000,
    fileParallelism: false,
    // Evita os timeouts intermitentes ao iniciar forks durante a suíte longa, mantendo isolamento por arquivo.
    pool: 'threads',
    // No CI (runner de 2 núcleos, ~10 min de suíte) testes de interface com corrida de tempo falham ao acaso, um diferente a
    // cada rodada. Uma nova tentativa só no CI absorve isso sem esconder falha real: um teste quebrado falha nas três.
    retry: process.env.CI ? 2 : 0,
  },
})

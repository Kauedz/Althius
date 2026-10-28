// Smoke de produção: roda à mão ou pelo bot depois de cada deploy, nunca no CI.
import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { ambiente } from './support/ambiente.js'
import { ESTADO_DO_NAVEGADOR } from './support/sessao.js'

const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
const saida = path.resolve(process.env.SMOKE_OUT ?? path.join('relatorio', carimbo))

export default defineConfig({
  testDir: 'tests',
  globalSetup: './support/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(saida, 'artefatos'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(saida, 'html'), open: 'never' }],
    ['json', { outputFile: path.join(saida, 'resultado.json') }],
  ],
  use: {
    baseURL: ambiente().baseUrl,
    storageState: ESTADO_DO_NAVEGADOR,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})

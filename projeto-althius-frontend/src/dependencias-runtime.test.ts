/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('instala o gerador shadcn apenas no ambiente de desenvolvimento e build', () => {
  const manifesto = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(manifesto.dependencies.shadcn).toBeUndefined()
  expect(manifesto.devDependencies.shadcn).toBeDefined()
  expect(manifesto.dependencies['@tailwindcss/vite']).toBeUndefined()
  expect(manifesto.devDependencies['@tailwindcss/vite']).toBeDefined()
})

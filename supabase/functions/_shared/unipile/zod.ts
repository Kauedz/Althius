// O único lugar do repositório que importa o Zod (ADR-0024): a versão fica fixada aqui, e o resto do módulo
// (e quem usar os schemas) importa deste arquivo, nunca do pacote.
export { z } from 'npm:zod@3.25.76'
export type { ZodError, ZodTypeAny } from 'npm:zod@3.25.76'

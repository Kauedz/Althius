import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Indexa uma lista pelo `id` de cada item. */
export function porId<T extends { id: string }>(lista: T[] = []): Record<string, T> {
  return Object.fromEntries(lista.map((item) => [item.id, item]))
}

/** As iniciais das duas primeiras palavras de um nome, em maiúsculas (ex.: "BBVA México" → "BM"). */
export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()
}

/** Um texto pronto para a busca: sem diferença de maiúsculas, sem acentos e sem espaços nas pontas. */
export function normalizarParaBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** A mensagem de um erro da fonte para o usuário. */
export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.'
}

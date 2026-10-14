// Os anexos do composer (PR-10): validar antes de subir, subir um por vez e lembrar o estado de cada um.

import type { AnexoDaMensagem } from '@/fonte/tipos'

export const MAXIMO_DE_ANEXOS = 5
export const TAMANHO_MAXIMO = 10 * 1024 * 1024

const EXTENSOES = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'csv', 'txt', 'docx', 'xlsx']
export const ACEITOS_ARQUIVO = '.pdf,.csv,.txt,.docx,.xlsx'
export const ACEITOS_IMAGEM = 'image/png,image/jpeg,image/webp'

export type EstadoDoAnexo =
  | { chave: string; estado: 'subindo'; nome: string; tamanho: number; previa?: string }
  | { chave: string; estado: 'pronto'; nome: string; tamanho: number; previa?: string; anexo: AnexoDaMensagem }
  | { chave: string; estado: 'falhou'; nome: string; tamanho: number; previa?: string; motivo: string }

/** O motivo para não anexar o arquivo, ou null quando ele pode subir. O servidor confere de novo pelos bytes. */
export function motivoParaRecusar(arquivo: File, jaAnexados: number): string | null {
  if (jaAnexados >= MAXIMO_DE_ANEXOS) return `Anexe até ${MAXIMO_DE_ANEXOS} arquivos por pedido.`
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const imagem = /^image\/(png|jpeg|webp)$/.test(arquivo.type)
  if (!imagem && !EXTENSOES.includes(extensao)) {
    return `${arquivo.name || 'Este arquivo'}: só imagens (PNG, JPG, WebP), PDF, CSV, TXT, DOCX e XLSX.`
  }
  if (arquivo.size === 0) return `${arquivo.name}: o arquivo está vazio.`
  if (arquivo.size > TAMANHO_MAXIMO) return `${arquivo.name}: cada arquivo pode ter até 10 MB.`
  return null
}

/** O tamanho para a pessoa: 820 KB, 3,4 MB. */
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** O nome curto do chip, com a extensão à vista. */
export function nomeCurto(nome: string, limite = 24): string {
  if (nome.length <= limite) return nome
  const ponto = nome.lastIndexOf('.')
  const extensao = ponto > 0 ? nome.slice(ponto) : ''
  return `${nome.slice(0, limite - extensao.length - 1)}…${extensao}`
}

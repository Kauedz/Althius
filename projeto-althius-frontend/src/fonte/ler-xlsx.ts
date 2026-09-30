// A leitura de um .xlsx no navegador, com a read-excel-file (9.x): todas as abas, com as células como texto. Fica num
// módulo à parte para a biblioteca só ser carregada quando o Administrador escolhe uma planilha.

import readXlsxFile from 'read-excel-file/browser'
import type { AbaLida } from './playbook-planilha'

function comoTexto(celula: unknown): string {
  if (celula === null || celula === undefined) return ''
  if (celula instanceof Date) return celula.toISOString().slice(0, 10)
  return String(celula)
}

export async function lerAbasDoXlsx(arquivo: Blob): Promise<AbaLida[]> {
  const abas = await readXlsxFile(arquivo)
  return abas.map(({ sheet, data }) => ({ nome: sheet, linhas: data.map((linha) => linha.map(comoTexto)) }))
}

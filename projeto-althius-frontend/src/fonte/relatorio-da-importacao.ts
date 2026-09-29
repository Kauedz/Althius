// O relatório por linha de uma importação, como CSV para baixar: o número da linha, a situação, os motivos e as
// células originais do arquivo, com o mesmo delimitador do arquivo enviado.

import type { LinhaDaImportacao, LoteDeImportacao, SituacaoDaLinha } from './importacao-tipos'

export const ROTULO_DA_SITUACAO: Record<SituacaoDaLinha, string> = {
  pendente: 'Pendente',
  invalida: 'Inválida',
  criada: 'Criada',
  atualizada: 'Atualizada',
  vinculada: 'Vinculada',
  ignorada: 'Ignorada',
  falhou: 'Falhou',
}

/**
 * Uma célula que começa com =, +, -, @, tabulação ou retorno de carro pode ser lida como fórmula ao abrir o arquivo no
 * Excel ou no Planilhas. O texto vem do CSV enviado por quem importa, então ganha um apóstrofo na frente para ficar
 * como texto.
 */
function comoTexto(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
}

function celula(valor: string, delimitador: string): string {
  const precisaDeAspas = valor.includes(delimitador) || /["\r\n]/.test(valor)
  return precisaDeAspas ? `"${valor.replaceAll('"', '""')}"` : valor
}

/** O CSV do relatório, com BOM para o Excel reconhecer o UTF-8. */
export function montarCsvDoRelatorio(lote: Pick<LoteDeImportacao, 'colunas' | 'delimitador'>, linhas: LinhaDaImportacao[]): string {
  const delimitador = lote.delimitador ?? ','
  const cabecalho = ['Linha', 'Situação', 'Motivo', ...lote.colunas]
  const registros = linhas.map((linha) => [
    String(linha.numero),
    ROTULO_DA_SITUACAO[linha.situacao],
    comoTexto([...linha.motivos, ...linha.observacoes].join(' ')),
    ...lote.colunas.map((_, i) => comoTexto(linha.celulas[i] ?? '')),
  ])
  const texto = [cabecalho, ...registros].map((registro) => registro.map((valor) => celula(valor, delimitador)).join(delimitador))
  return `﻿${texto.join('\r\n')}\r\n`
}

/** Entrega o texto como arquivo para baixar no navegador. */
export function baixarTexto(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

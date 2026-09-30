// A planilha do playbook do setup, lida para o Playbook do Workspace (playbook-do-workspace, ticket 03). O mapeamento
// aba → seção é fixo: uma aba conhecida vira o texto da seção; a Base de Pesquisa segue para a importação de
// Contas-alvo; qualquer outra aba é listada como "não importada", nunca descartada em silêncio.

import { SECOES_DO_PLAYBOOK, type IdDaSecaoDoPlaybook } from './playbook-tipos'

/** Uma aba lida: o nome e as células de texto, linha a linha. */
export interface AbaLida {
  nome: string
  linhas: string[][]
}

/** O nome de uma aba sem acento, caixa nem pontuação, para o mapeamento não depender do jeito de escrever. */
export function normalizarNomeDaAba(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** As abas do modelo do setup e a seção de cada uma (mapeamento fixo). */
const ABAS_DAS_SECOES: [aba: string, secao: IdDaSecaoDoPlaybook][] = [
  ['Capa & Índice', 'empresa'],
  ['ICP – Quem Buscamos', 'icp'],
  ['Personas', 'personas'],
  ['Processo de Compra', 'processo_de_compra'],
  ['Dor e Percepção', 'dor_e_percepcao'],
  ['Pipeline (9 Fases)', 'pipeline'],
  ['SLA & Metas', 'sla_e_metas'],
  ['Rotina Diária', 'rotina'],
  ['Cadência 21 Dias', 'cadencia'],
  ['Scripts – Ligações', 'scripts'],
  ['Templates de Mensagem', 'templates'],
  ['Manual de Objeções', 'objecoes'],
  ['Frameworks de Vendas', 'frameworks'],
  ['Apresentação', 'apresentacao'],
  ['Negociação & Follow-up', 'negociacao_e_follow_up'],
]

const SECAO_DA_ABA = new Map(ABAS_DAS_SECOES.map(([aba, secao]) => [normalizarNomeDaAba(aba), secao]))
const ABA_DA_BASE_DE_PESQUISA = normalizarNomeDaAba('Base de Pesquisa')

export interface SecaoDaPlanilha {
  id: IdDaSecaoDoPlaybook
  nome: string
  aba: string
  texto: string
}

export interface AbaNaoImportada {
  aba: string
  motivo: string
}

export interface PreviaDaPlanilha {
  /** As seções que a planilha traz, na ordem do Playbook. */
  secoes: SecaoDaPlanilha[]
  /** A Base de Pesquisa: as empresas, que seguem para a importação de Contas-alvo por CSV. */
  baseDePesquisa: AbaLida | null
  naoImportadas: AbaNaoImportada[]
}

/** As células de uma aba como texto: uma linha por linha da planilha, células separadas por " | ", sem linhas vazias. */
export function textoDaAba(linhas: string[][]): string {
  return linhas
    .map((linha) => linha.map((celula) => celula.trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n')
}

const NOME_DA_SECAO = new Map(SECOES_DO_PLAYBOOK.map(({ id, nome }) => [id, nome]))

export function previaDaPlanilha(abas: AbaLida[]): PreviaDaPlanilha {
  const secoes = new Map<IdDaSecaoDoPlaybook, SecaoDaPlanilha>()
  const naoImportadas: AbaNaoImportada[] = []
  let baseDePesquisa: AbaLida | null = null

  for (const aba of abas) {
    const chave = normalizarNomeDaAba(aba.nome)
    if (chave === ABA_DA_BASE_DE_PESQUISA) {
      if (baseDePesquisa) naoImportadas.push({ aba: aba.nome, motivo: 'Já existe uma Base de Pesquisa nesta planilha.' })
      else baseDePesquisa = aba
      continue
    }
    const id = SECAO_DA_ABA.get(chave)
    if (!id) {
      naoImportadas.push({ aba: aba.nome, motivo: 'A Althius não tem uma seção do Playbook para esta aba.' })
      continue
    }
    const texto = textoDaAba(aba.linhas)
    if (!texto) {
      naoImportadas.push({ aba: aba.nome, motivo: 'A aba está vazia.' })
    } else if (secoes.has(id)) {
      naoImportadas.push({ aba: aba.nome, motivo: 'Outra aba já preencheu esta seção.' })
    } else {
      secoes.set(id, { id, nome: NOME_DA_SECAO.get(id) ?? id, aba: aba.nome, texto })
    }
  }

  return {
    secoes: SECOES_DO_PLAYBOOK.flatMap(({ id }) => secoes.get(id) ?? []),
    baseDePesquisa,
    naoImportadas,
  }
}

/** A aba como CSV (aspas e vírgulas escapadas), para a importação de Contas-alvo por CSV. */
export function csvDaAba(linhas: string[][]): string {
  const celula = (valor: string) => (/[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor)
  return linhas
    .filter((linha) => linha.some((valor) => valor.trim() !== ''))
    .map((linha) => linha.map(celula).join(','))
    .join('\r\n')
}

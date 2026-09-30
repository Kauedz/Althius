import { describe, expect, it } from 'vitest'
import { csvDaAba, normalizarNomeDaAba, previaDaPlanilha, textoDaAba, type AbaLida } from './playbook-planilha'

const aba = (nome: string, ...linhas: string[][]): AbaLida => ({ nome, linhas })

describe('Planilha do playbook: mapeamento das abas', () => {
  it('normaliza o nome da aba sem acento, caixa nem pontuação', () => {
    expect(normalizarNomeDaAba('ICP – Quem Buscamos')).toBe('icp quem buscamos')
    expect(normalizarNomeDaAba('  Negociação & Follow-up ')).toBe('negociacao follow up')
    expect(normalizarNomeDaAba('Pipeline (9 Fases)')).toBe('pipeline 9 fases')
  })

  it('as 15 abas do modelo viram as 15 seções, na ordem do Playbook', () => {
    const nomes = [
      'Negociação & Follow-up', 'Apresentação', 'Frameworks de Vendas', 'Manual de Objeções', 'Templates de Mensagem',
      'Scripts – Ligações', 'Cadência 21 Dias', 'Rotina Diária', 'SLA & Metas', 'Pipeline (9 Fases)', 'Dor e Percepção',
      'Processo de Compra', 'Personas', 'ICP – Quem Buscamos', 'Capa & Índice',
    ]
    const previa = previaDaPlanilha(nomes.map((nome) => aba(nome, [nome, 'conteúdo'])))

    expect(previa.secoes.map((s) => s.id)).toEqual([
      'empresa', 'icp', 'personas', 'processo_de_compra', 'dor_e_percepcao', 'pipeline', 'sla_e_metas', 'rotina',
      'cadencia', 'scripts', 'templates', 'objecoes', 'frameworks', 'apresentacao', 'negociacao_e_follow_up',
    ])
    expect(previa.naoImportadas).toEqual([])
    expect(previa.baseDePesquisa).toBeNull()
  })

  it('separa a Base de Pesquisa e lista as abas desconhecidas, vazias ou repetidas, sem descartar nenhuma em silêncio', () => {
    const previa = previaDaPlanilha([
      aba('Personas', ['Decisor', 'Diretor de compras']),
      aba('SDR – Outbound', ['Pesquisa', 'Abordagem']),
      aba('Closer', ['Reunião']),
      aba('Rotina Diária', [], ['', ' ']),
      aba('personas', ['Outra']),
      aba('Base de Pesquisa', ['Empresa', 'Cidade'], ['Acme', 'Itajaí']),
    ])

    expect(previa.secoes.map((s) => [s.id, s.aba])).toEqual([['personas', 'Personas']])
    expect(previa.baseDePesquisa?.linhas).toEqual([['Empresa', 'Cidade'], ['Acme', 'Itajaí']])
    expect(previa.naoImportadas.map((a) => a.aba)).toEqual(['SDR – Outbound', 'Closer', 'Rotina Diária', 'personas'])
    expect(previa.naoImportadas.find((a) => a.aba === 'Rotina Diária')?.motivo).toBe('A aba está vazia.')
    expect(previa.naoImportadas.find((a) => a.aba === 'personas')?.motivo).toBe('Outra aba já preencheu esta seção.')
  })

  it('a aba vira texto: uma linha por linha, células separadas por barra, sem linhas vazias', () => {
    expect(textoDaAba([['ICP'], ['', ''], ['Porte', ' 50 a 500 ', ''], ['Região', 'Sul']])).toBe(
      'ICP\nPorte | 50 a 500\nRegião | Sul',
    )
  })

  it('gera o CSV da Base de Pesquisa com aspas e vírgulas escapadas', () => {
    expect(csvDaAba([['Empresa', 'Nota'], ['Acme, Ltda', 'diz "ok"'], ['', ''], ['Beta', '']])).toBe(
      'Empresa,Nota\r\n"Acme, Ltda","diz ""ok"""\r\nBeta,',
    )
  })
})

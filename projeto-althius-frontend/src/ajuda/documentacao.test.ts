import { describe, expect, it } from 'vitest'
import { ancora, buscar, lerPagina, PAGINAS_DA_DOCUMENTACAO } from './documentacao'

describe('Documentação da Ajuda', () => {
  it('lê cabeçalho, títulos com âncora, listas, tabelas e avisos', () => {
    const p = lerPagina(
      '---\nid: x\ntitulo: Título\ngrupo: G\natualizado: 14/10/2026\n---\n\nTexto **forte**.\n\n## Ação e preço\n\n- um\n- dois\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> [!atencao]\n> Cuidado.\n',
    )
    expect(p).toMatchObject({ id: 'x', titulo: 'Título', grupo: 'G', atualizado: '14/10/2026' })
    expect(p.blocos.map((b) => b.tipo)).toEqual(['paragrafo', 'titulo', 'lista', 'tabela', 'aviso'])
    expect(p.blocos[1]).toEqual({ tipo: 'titulo', id: 'acao-e-preco', texto: 'Ação e preço' })
    expect(p.blocos[4]).toEqual({ tipo: 'aviso', nivel: 'atencao', texto: 'Cuidado.' })
    expect(ancora('Conta Quente')).toBe('conta-quente')
  })

  it('carrega todas as páginas, sem "CRM" e sem letras de nicho', () => {
    expect(PAGINAS_DA_DOCUMENTACAO.map((p) => p.id)).toEqual([
      'comecar', 'creditos', 'sinais', 'descoberta', 'contas-e-comite', 'sequencias', 'agentes', 'contexto', 'conexoes',
    ])
    for (const p of PAGINAS_DA_DOCUMENTACAO) {
      expect(p.atualizado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      expect(p.textoCorrido).not.toMatch(/CRM|[Nn]icho [A-H]\b/)
    }
  })

  it('busca sem acento nos títulos e no texto, apontando a seção', () => {
    const r = buscar('renovacao')
    expect(r[0]).toMatchObject({ ancora: 'renovacao-mensal' })
    expect(r[0].pagina.id).toBe('creditos')
    expect(buscar('a')).toEqual([])
  })
})

// A revisão do Playbook na Fonte das Aprovações (CRM-09, ADR-0010): `list_approvals` traz a categoria e, na revisão, a
// seção, a versão de partida, a versão gravada e o conteúdo só enquanto pendente. Aprovar a revisão não chama executor
// nenhum: o banco já grava a versão ao aprovar. As ações seguem como antes.
import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { ehRevisaoDoPlaybook, podeDecidir, categoriaDa } from './regras'
import { criarFonteDeAprovacoesSupabase } from './supabase-aprovacoes'

const ANA = { id: 'usuario-ana', email: 'ana@cliente.com.br' }

const revisao = (state: string, extra: Record<string, unknown> = {}) => ({
  id: `rev-${state}`, agent_id: 'agente-scopus', integration_id: null, action: 'Nova versão de ICP no Playbook',
  impact: 'Aprovar grava a versão 3 de ICP.', justification: 'Os três últimos fechamentos foram nesse porte.',
  payload: { tipo: 'revisao_do_playbook', secao: 'icp', versao_base: 2 }, target_account_id: null, state,
  failure: null, decided_by: state === 'pendente' ? null : 'usuario-ana', category: 'revisao', playbook_section: 'icp',
  base_version: 2, applied_version: state === 'aprovada' ? 3 : null,
  proposed_content: state === 'pendente' ? { texto: 'Indústrias de 200 a 500 pessoas', linhas: [{ segmento: 'Indústria' }] } : null,
  ...extra,
})

const acao = {
  id: 'ap-acao', agent_id: 'agente-rhetor', integration_id: 'hubspot', action: 'Enviar a Alfa ao HubSpot',
  impact: 'Cria a empresa no HubSpot.', justification: 'Reunião marcada.', payload: { tipo: 'envio_ao_crm' },
  target_account_id: 'conta-alfa', state: 'pendente', failure: null, category: 'acao', playbook_section: null,
  base_version: null, applied_version: null, proposed_content: null,
}

function fonte(linhas: Record<string, unknown>[]) {
  const decisoes: Record<string, unknown>[] = []
  const execucoes: string[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(ANA),
    tabelas: {},
    rpcs: {
      list_approvals: () => linhas,
      decide_approval: (p) => (decisoes.push(p), p.p_decision === 'aprovar' ? 'aprovada' : 'recusada'),
    },
    funcoes: {
      'crm-handoff': () => (execucoes.push('crm-handoff'), { corpo: { status: 'enviado' } }),
      'integration-tools': () => (execucoes.push('integration-tools'), { corpo: {} }),
    },
  })
  return { f: criarFonteDeAprovacoesSupabase(cliente, 'ws-norte'), decisoes, execucoes }
}

describe('A revisão do Playbook na fila de Aprovações (CRM-09)', () => {
  it('a revisão pendente traz a seção, a versão de partida e o conteúdo proposto, sem Integração', async () => {
    const { f } = fonte([revisao('pendente'), acao])
    const [pendente, envio] = await f.aprovacoes()
    expect(ehRevisaoDoPlaybook(pendente)).toBe(true)
    expect(pendente).toMatchObject({
      agenteId: 'agente-scopus',
      acao: 'Nova versão de ICP no Playbook',
      justificativa: 'Os três últimos fechamentos foram nesse porte.',
      estado: 'pendente',
      revisao: {
        tipo: 'playbook',
        secao: 'icp',
        versaoBase: 2,
        proposto: { texto: 'Indústrias de 200 a 500 pessoas', linhas: [{ segmento: 'Indústria' }] },
        versaoGravada: null,
        decididaPor: null,
      },
    })
    expect('integracaoId' in pendente).toBe(false)
    // A ação continua como era.
    expect(ehRevisaoDoPlaybook(envio)).toBe(false)
    expect(envio).toMatchObject({ integracaoId: 'hubspot', contaId: 'conta-alfa', estado: 'pendente' })
  })

  it('decidida, a revisão é só o registro: a versão gravada, quem decidiu e o estado, sem conteúdo', async () => {
    const { f } = fonte([
      revisao('aprovada'),
      revisao('recusada'),
      revisao('expirada'),
      revisao('cancelada'),
      revisao('desatualizada'),
    ])
    const fila = await f.aprovacoes()
    expect(fila.map((a) => a.estado)).toEqual(['aprovada', 'rejeitada', 'expirada', 'cancelada', 'desatualizada'])
    expect(fila.map((a) => (ehRevisaoDoPlaybook(a) ? a.revisao.proposto : 'ação'))).toEqual([null, null, null, null, null])
    expect(fila[0]).toMatchObject({ revisao: { versaoGravada: 3, decididaPor: 'usuario-ana' } })
  })

  it('só um Administrador decide a revisão, em qualquer ambiente', async () => {
    const { f } = fonte([revisao('pendente')])
    const [pendente] = await f.aprovacoes()
    expect(categoriaDa(pendente)).toBe('revisao-da-memoria')
    expect(podeDecidir(categoriaDa(pendente), 'membro')).toBe(false)
    expect(podeDecidir(categoriaDa(pendente), 'membro', 'demonstracao')).toBe(false)
    expect(podeDecidir(categoriaDa(pendente), 'administrador')).toBe(true)
  })

  it('aprovar a revisão só chama decide_approval: a versão é gravada pelo banco, sem executor', async () => {
    const { f, decisoes, execucoes } = fonte([revisao('pendente'), acao])
    await f.aprovacoes()
    await f.decidirAprovacao('rev-pendente', 'aprovada', 'conversa')
    expect(decisoes).toEqual([{ p_approval_id: 'rev-pendente', p_decision: 'aprovar', p_where: 'conversa' }])
    expect(execucoes).toEqual([])
    // A ação aprovada continua indo ao executor dela.
    await f.decidirAprovacao('ap-acao', 'aprovada', 'fila')
    expect(execucoes).toEqual(['crm-handoff'])
  })

  it('uma linha sem categoria (antes da migration) continua sendo uma ação', async () => {
    const { f } = fonte([{ ...acao, category: undefined, playbook_section: undefined }])
    const [linha] = await f.aprovacoes()
    expect(ehRevisaoDoPlaybook(linha)).toBe(false)
    expect(linha).toMatchObject({ integracaoId: 'hubspot' })
  })
})

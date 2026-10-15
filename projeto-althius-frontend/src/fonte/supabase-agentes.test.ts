import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeAgentesSupabase } from './supabase-agentes'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

/** Uma recusa do banco, com o SQLSTATE e a mensagem que a função levanta. */
function recusa(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

/** Uma RPC que o banco recusa. */
const recusando = (code: string, message: string) => () => {
  throw recusa(code, message)
}

function fonteCom(rpcs: Record<string, (parametros: Record<string, unknown>) => unknown>) {
  const { cliente } = criarSupabaseFalso({ sessao: sessaoDe(MARINA), rpcs })
  return criarFonteDeAgentesSupabase(cliente, 'ws-norte')
}

describe('Configuração dos Agentes no Workspace operacional', () => {
  it('traz cada Agente ocioso e sem Execuções, com as Integrações que ele usa e a Rotina ativa', async () => {
    const fonte = fonteCom({
      list_agents: (p) => {
        expect(p).toEqual({ p_workspace_id: 'ws-norte' })
        return [
          { id: 'a1', name: 'Scopus', kind: 'padrao', specialty: 'scopus', instructions: '', integrations: ['hubspot'], active_routine: null },
          {
            id: 'a2',
            name: 'Scopus · Norte',
            kind: 'criado',
            specialty: 'scopus',
            instructions: 'Só o Norte.',
            integrations: [],
            active_routine: { id: 'r1', task: 'Reavaliar', frequency: 'semanal', weekday: 'segunda', time: '09:00', channel: null },
          },
        ]
      },
    })

    const [padrao, criado] = await fonte.agentes()
    expect(padrao).toMatchObject({ nome: 'Scopus', tipo: 'padrao', estado: 'ocioso', execucoes: 0, rotinaAtiva: null, integracoes: ['hubspot'] })
    expect(padrao.descricao).toBe(padrao.especialidade.descricao)
    expect(criado.descricao).toBe('Só o Norte.')
    expect(criado.rotinaAtiva).toMatchObject({ tarefa: 'Reavaliar', diaDaSemana: 'segunda', horario: '09:00', pausada: false })
  })

  it('lê e grava a Personalização e as Permissões pelo Agente, e avisa as telas depois de gravar', async () => {
    const gravacoes: Record<string, unknown>[] = []
    const fonte = fonteCom({
      get_agent_settings: () => [
        {
          instructions: 'Priorize o Sul.',
          voice_tone: 'Direto.',
          channels: ['slack'],
          knowledge: [{ id: 'k1', kind: 'url', name: 'norte.com.br' }],
          permissions: { hubspot: 'propor' },
        },
      ],
      save_agent_settings: (p) => void gravacoes.push(p),
    })
    let avisos = 0
    fonte.observar(() => avisos++)

    const salva = await fonte.personalizacao('a1')
    expect(salva).toEqual({
      instrucoes: 'Priorize o Sul.',
      tomDeVoz: 'Direto.',
      canais: ['slack'],
      baseDeConhecimento: [{ id: 'k1', tipo: 'url', nome: 'norte.com.br' }],
      permissoes: { hubspot: 'propor' },
    })
    await fonte.salvarPersonalizacao('a1', { ...salva, permissoes: { hubspot: 'ler', notion: 'propor' } })

    expect(gravacoes).toEqual([
      {
        p_agent_id: 'a1',
        p_instructions: 'Priorize o Sul.',
        p_voice_tone: 'Direto.',
        p_channels: ['slack'],
        p_knowledge: [{ kind: 'url', name: 'norte.com.br' }],
        p_permissions: { hubspot: 'ler', notion: 'propor' },
      },
    ])
    expect(avisos).toBe(1)
  })

  it('mostra as Habilidades, a Memória e as Rotinas como o banco as guardou', async () => {
    const fonte = fonteCom({
      list_agent_skills: () => [
        { id: 'h1', name: 'Pontuar', description: 'Nota de 0 a 100.', uses: 3, last_improved_at: '2026-09-10', active: false, uses_document: 'icp' },
      ],
      list_agent_memory: () => [{ id: 'f1', content: 'Ciclo de seis meses.', origin: 'Aprendido na Conversa' }],
      list_agent_routines: () => [
        { id: 'r1', task: 'Reavaliar', frequency: 'diaria', weekday: null, run_time: '08:00', destination_channel: 'slack', paused: true },
      ],
    })

    expect(await fonte.habilidades('a1')).toEqual([
      { id: 'h1', agenteId: 'a1', nome: 'Pontuar', descricao: 'Nota de 0 a 100.', usos: 3, ultimaMelhoria: '10/09/2026', ativa: false, usaDocumento: 'icp' },
    ])
    expect(await fonte.memoria('a1')).toEqual([{ id: 'f1', agenteId: 'a1', texto: 'Ciclo de seis meses.', origem: 'Aprendido na Conversa' }])
    expect(await fonte.rotinas('a1')).toEqual([
      { id: 'r1', agenteId: 'a1', tarefa: 'Reavaliar', frequencia: 'diaria', horario: '08:00', canalDestino: 'slack', pausada: true },
    ])
  })

  it('sem Execuções nem Canal Slack, não traz Atividade nem conexões', async () => {
    const fonte = fonteCom({ agent_activity: () => [], slack_channel_status: () => [{ state: 'nao_instalado', team_name: null }] })

    expect(await fonte.atividade('a1')).toEqual([])
    expect((await fonte.canais()).some((canal) => canal.conectado)).toBe(false)
    expect((await fonte.integracoes()).some((integracao) => integracao.conectada)).toBe(false)
    expect((await fonte.especialidades()).map((e) => e.id)).toEqual(['scopus', 'ethos', 'rhetor', 'oraculum'])
  })

  it.each([
    ['42501', 'default agents cannot be deleted', 'O Agente padrão não pode ser excluído.'],
    ['42501', 'only administrators can manage agents', 'Só Administradores do Workspace podem fazer isso.'],
    ['23503', 'agent has references', 'Este Agente ainda tem registros ligados a ele que não acompanham a exclusão. Nada foi apagado.'],
    ['P0002', 'agent not found', 'Este Agente não existe mais neste Workspace.'],
  ])('traduz a recusa %s "%s" da exclusão para a pessoa', async (code, mensagem, texto) => {
    const fonte = fonteCom({ delete_agent: recusando(code, mensagem) })

    await expect(fonte.excluirAgente('a1')).rejects.toThrow(texto)
  })

  it('um nome repetido diz qual nome, e uma falha de rede não vaza o erro técnico', async () => {
    const repetido = fonteCom({ create_agent: recusando('23505', 'agent name already exists') })
    await expect(repetido.criarAgente({ especialidadeId: 'ethos', complemento: ' Comitê ', instrucoes: '' })).rejects.toThrow(
      'Já existe um Agente chamado Ethos · Comitê.',
    )

    const semRede = fonteCom({ save_agent_settings: () => { throw new Error('Failed to fetch') } })
    await expect(
      semRede.salvarPersonalizacao('a1', { instrucoes: '', tomDeVoz: '', baseDeConhecimento: [], canais: [], permissoes: {} }),
    ).rejects.toThrow('Não foi possível concluir agora. Nada foi alterado; verifique sua conexão e tente de novo.')
  })
})

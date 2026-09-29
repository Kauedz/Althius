// As funções de Agentes do banco (migration agentes_e_permissoes) em memória, para os testes do Workspace operacional.
// Guarda o estado como o banco guardaria: quem abre outra sessão com o mesmo `banco` reencontra o que foi salvo. As
// regras que o banco garante (só Administrador grava, o Agente padrão não sai, nome único) valem aqui também.

const ESPECIALIDADES = [
  ['scopus', 'Scopus'],
  ['ethos', 'Ethos'],
  ['rhetor', 'Rhetor'],
  ['oraculum', 'Oraculum'],
] as const

const PERMISSOES_PADRAO: Record<string, Record<string, string>> = {
  scopus: { hubspot: 'propor', clay: 'ler', apollo: 'ler', lusha: 'ler' },
  ethos: { hubspot: 'propor', apollo: 'ler', lusha: 'ler', notion: 'propor' },
  rhetor: { hubspot: 'propor', notion: 'propor', 'meta-ads': 'propor', 'google-ads': 'propor' },
  oraculum: { notion: 'propor', 'google-ads': 'propor' },
}

interface AgenteNoBanco {
  id: string
  name: string
  kind: 'padrao' | 'criado'
  specialty: string
  complement: string | null
  instructions: string
  voice_tone: string
  channels: string[]
  knowledge: { id: string; kind: string; name: string }[]
  permissions: Record<string, string>
  memory: { id: string; content: string; origin: string }[]
  skills: Record<string, unknown>[]
  routines: Record<string, unknown>[]
}

export interface BancoDeAgentes {
  agentes: AgenteNoBanco[]
  /** As chamadas de escrita que o banco aceitou, na ordem. */
  gravacoes: { funcao: string; parametros: Record<string, unknown> }[]
}

export function criarBancoDeAgentes(): BancoDeAgentes {
  return {
    gravacoes: [],
    agentes: ESPECIALIDADES.map(([specialty, name]) => ({
      id: `agente-${specialty}`,
      name,
      kind: 'padrao' as const,
      specialty,
      complement: null,
      instructions: '',
      voice_tone: '',
      channels: [],
      knowledge: [],
      permissions: { ...PERMISSOES_PADRAO[specialty] },
      memory: [],
      skills: [],
      routines: [],
    })),
  }
}

function recusar(mensagem: string, code: string): never {
  throw Object.assign(new Error(mensagem), { code })
}

/**
 * As RPCs de Agentes sobre `banco`, para o `rpcs` do Supabase falso. Com `papel` de Membro, toda escrita é recusada
 * como o banco a recusaria.
 */
export function rpcsDeAgentes(banco: BancoDeAgentes, papel: 'admin' | 'member' = 'admin') {
  let proximo = 1
  const achar = (id: unknown) => {
    const agente = banco.agentes.find((a) => a.id === id)
    if (!agente) recusar('agent not found', 'P0002')
    return agente
  }
  const escrita = <T>(funcao: string, corpo: (parametros: Record<string, unknown>) => T) =>
    (parametros: Record<string, unknown>) => {
      if (papel !== 'admin') recusar('only administrators can manage agents', '42501')
      const resultado = corpo(parametros)
      banco.gravacoes.push({ funcao, parametros })
      return resultado
    }
  return {
    list_agents: () =>
      banco.agentes.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        specialty: a.specialty,
        complement: a.complement,
        instructions: a.instructions,
        integrations: Object.keys(a.permissions).sort(),
        active_routine: null,
      })),
    get_agent_settings: ({ p_agent_id }: Record<string, unknown>) => {
      const a = achar(p_agent_id)
      return [
        { instructions: a.instructions, voice_tone: a.voice_tone, channels: a.channels, knowledge: a.knowledge, permissions: a.permissions },
      ]
    },
    list_agent_memory: ({ p_agent_id }: Record<string, unknown>) => achar(p_agent_id).memory,
    list_agent_skills: ({ p_agent_id }: Record<string, unknown>) => achar(p_agent_id).skills,
    list_agent_routines: ({ p_agent_id }: Record<string, unknown>) => achar(p_agent_id).routines,
    create_agent: escrita('create_agent', (p) => {
      const padrao = banco.agentes.find((a) => a.kind === 'padrao' && a.specialty === p.p_specialty)
      if (!padrao) recusar('invalid specialty', '22023')
      const complemento = String(p.p_complement ?? '').trim()
      if (!complemento) recusar('invalid complement', '22023')
      const name = `${padrao.name} · ${complemento}`
      if (banco.agentes.some((a) => a.name.toLowerCase() === name.toLowerCase())) recusar('agent name already exists', '23505')
      const id = `agente-criado-${proximo++}`
      const instrucoes = String(p.p_instructions ?? '').trim()
      banco.agentes.push({
        ...structuredClone(padrao),
        id,
        name,
        kind: 'criado',
        complement: complemento,
        instructions: instrucoes || padrao.instructions,
        memory: [],
        routines: [],
      })
      return id
    }),
    delete_agent: escrita('delete_agent', (p) => {
      const a = achar(p.p_agent_id)
      if (a.kind === 'padrao') recusar('default agents cannot be deleted', '42501')
      banco.agentes = banco.agentes.filter((outro) => outro !== a)
      return null
    }),
    save_agent_settings: escrita('save_agent_settings', (p) => {
      const a = achar(p.p_agent_id)
      a.instructions = String(p.p_instructions)
      a.voice_tone = String(p.p_voice_tone)
      a.channels = p.p_channels as string[]
      a.knowledge = (p.p_knowledge as { kind: string; name: string }[]).map((k) => ({ id: `fonte-${proximo++}`, ...k }))
      a.permissions = p.p_permissions as Record<string, string>
      return null
    }),
  }
}

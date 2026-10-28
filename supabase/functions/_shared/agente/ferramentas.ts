// As ferramentas do agente único (Fase 3, fatia 3a): embrulham o que já existe, sempre com a sessão de quem pede — o
// banco e as funções conferem a Participação, o saldo e as regras como se a pessoa tivesse clicado.
//   ler_icp, montar_criterios_da_busca: leitura, sem custo;
//   buscar_empresas: a busca de Contas pelo ICP (account-discovery), cotada por quote_account_discovery;
//   aceitar_empresa, descartar_empresa: a decisão da pessoa sobre uma empresa da busca;
//   enriquecer_comite: o comitê de compra de uma Conta-alvo (account-enrichment, até 10 pessoas novas);
//   consultar_receita: os dados da Receita de um CNPJ (account-enrichment).
import type { Cartao, ContextoDaFerramenta, Ferramenta, ResultadoDaFerramenta } from './registro.ts'

/** O acesso ao Althius com a sessão de quem pede (o JWT do contexto). */
export interface ServicosDoAgente {
  rpc(ctx: ContextoDaFerramenta, nome: string, args: Record<string, unknown>): Promise<unknown>
  funcao(ctx: ContextoDaFerramenta, nome: string, corpo: Record<string, unknown>): Promise<Record<string, unknown>>
  lerConta(ctx: ContextoDaFerramenta, contaId: string): Promise<{ id: string; nome: string; dominio: string | null; linkedinUrl: string | null } | null>
  esperar?(ms: number): Promise<void>
  relogio?(): number
}

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
export const PADRAO_DE_EMPRESAS = 20
export const MAXIMO_DE_EMPRESAS = 50
export const PESSOAS_DO_COMITE = 10
/** Quanto a busca espera dentro do turno antes de seguir em segundo plano. */
export const ESPERA_DA_BUSCA_MS = 75_000

function uuid(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new Error(`Informe ${campo} válido.`)
  return v
}

function quantidade(v: unknown): number {
  if (v === undefined || v === null || v === '') return PADRAO_DE_EMPRESAS
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > MAXIMO_DE_EMPRESAS) throw new Error(`A busca traz de 1 a ${MAXIMO_DE_EMPRESAS} empresas.`)
  return n
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function primeira<T>(data: unknown): T | null {
  return (Array.isArray(data) ? data[0] : data) as T ?? null
}

interface DescobertaLida {
  id: string
  run_id: string | null
  state: string
  name: string
  website: string | null
  domain: string | null
  location: string | null
  uf: string | null
  sector: string | null
  size_label: string | null
  employee_count: number | null
  fit_level: string | null
  reasons: unknown
  target_account_id: string | null
}

/** Os porquês da aderência (pontuacao.ts: {criterio, atende, texto}), no máximo 4. */
function porques(reasons: unknown): { texto: string; atende: boolean | null }[] {
  if (!Array.isArray(reasons)) return []
  return reasons.flatMap((r) => {
    if (typeof r === 'string') return [{ texto: r, atende: null }]
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>
      const t = o.texto ?? o.frase ?? o.text
      return typeof t === 'string' && t.trim() ? [{ texto: t.trim(), atende: typeof o.atende === 'boolean' ? o.atende : null }] : []
    }
    return []
  }).slice(0, 4)
}

export function cartaoDeEmpresas(linhas: DescobertaLida[]): Cartao {
  return {
    tipo: 'empresas',
    empresas: linhas.map((d) => ({
      id: d.id,
      nome: d.name,
      dominio: d.domain ?? null,
      site: d.website ?? null,
      setor: d.sector ?? null,
      porte: d.size_label ?? (d.employee_count ? `${d.employee_count} funcionários` : null),
      local: d.location ?? d.uf ?? null,
      nivel: d.fit_level ?? 'baixo',
      porques: porques(d.reasons),
      estado: d.state,
      contaId: d.target_account_id ?? null,
    })),
  }
}

function resumoDasEmpresas(linhas: DescobertaLida[]): string {
  if (!linhas.length) return 'A busca terminou sem empresas novas para estes critérios.'
  const nomes = linhas.slice(0, 12).map((d) => `${d.name} [id ${d.id}, aderência ${d.fit_level ?? 'baixo'}${d.sector ? `, ${d.sector}` : ''}]`)
  const altas = linhas.filter((d) => d.fit_level === 'alto').length
  return `${linhas.length} empresas novas na Caixa de Descobertas (${altas} com aderência alta): ${nomes.join('; ')}${linhas.length > 12 ? '; …' : ''}`
}

async function resultadoDaBusca(s: ServicosDoAgente, ctx: ContextoDaFerramenta, runId: string): Promise<ResultadoDaFerramenta | null> {
  const runs = (await s.rpc(ctx, 'list_discovery_runs', { p_workspace_id: ctx.workspaceId, p_kind: 'contas', p_limit: 50 })) as
    { id: string; state: string; estimated_credits: number | string | null; found: number | null; added: number | null; last_error: string | null }[] | null
  const run = (runs ?? []).find((r) => r.id === runId)
  if (!run) throw new Error('A busca não foi encontrada neste Workspace.')
  if (run.state === 'falhou' || run.state === 'cancelada') throw new Error(run.last_error || 'A busca de empresas não terminou.')
  if (run.state !== 'concluida') return null
  const todas = (await s.rpc(ctx, 'list_discovered_accounts', { p_workspace_id: ctx.workspaceId, p_state: null, p_limit: 200 })) as
    DescobertaLida[] | null
  const linhas = (todas ?? []).filter((d) => d.run_id === runId)
  const custo = (run.found ?? 0) > 0 ? Number(run.estimated_credits ?? 0) : 0
  return { resumo: resumoDasEmpresas(linhas), cartoes: [cartaoDeEmpresas(linhas)], custo }
}

export function ferramentasDoAgente(s: ServicosDoAgente): Ferramenta[] {
  const esperar = s.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const relogio = s.relogio ?? Date.now

  const lerIcp: Ferramenta = {
    nome: 'ler_icp',
    descricao: 'Lê o ICP atual do Workspace (setor, porte, geografia, cargos, o que vende, por que compram).',
    esquema: {},
    aprovacao: 'livre',
    titulo: () => 'Ler o ICP do Workspace',
    cotar: () => Promise.resolve(0),
    async executar(ctx) {
      const icp = (await s.rpc(ctx, 'get_my_workspace_icp', { p_workspace_id: ctx.workspaceId })) as Record<string, unknown> | null
      if (!icp || icp.version === null || icp.version === undefined) {
        return {
          resumo: 'O Workspace ainda não tem ICP salvo.',
          cartoes: [{ tipo: 'aviso', texto: 'O Workspace ainda não tem ICP. Descreva para quem você vende para eu montar um.' }],
          custo: 0,
        }
      }
      const cargos = Array.isArray(icp.targetRoles) ? (icp.targetRoles as unknown[]).map(String) : []
      const campos = {
        versao: icp.version,
        setor: texto(icp.sector),
        porte: texto(icp.companySize),
        geografia: texto(icp.geography),
        cargos,
        oQueVende: texto(icp.oQueVende),
        miniIcp: texto(icp.miniIcp),
        porQueCompram: texto(icp.porQueCompram),
      }
      const resumo = [
        `ICP versão ${campos.versao}`,
        campos.setor && `setor: ${campos.setor}`,
        campos.porte && `porte: ${campos.porte}`,
        campos.geografia && `geografia: ${campos.geografia}`,
        cargos.length ? `cargos: ${cargos.join(', ')}` : '',
        campos.oQueVende && `o que vende: ${campos.oQueVende.slice(0, 300)}`,
      ].filter(Boolean).join('; ')
      return { resumo, cartoes: [{ tipo: 'icp', ...campos }], custo: 0 }
    },
  }

  const criterios: Ferramenta = {
    nome: 'montar_criterios_da_busca',
    descricao: 'Monta os critérios da busca de empresas a partir do ICP (setores, porte, regiões, palavras).',
    esquema: {},
    aprovacao: 'livre',
    titulo: () => 'Montar os critérios da busca pelo ICP',
    cotar: () => Promise.resolve(0),
    async executar(ctx) {
      const r = await s.funcao(ctx, 'account-discovery', { action: 'criteria', workspaceId: ctx.workspaceId })
      if (!r.temIcp) {
        return {
          resumo: 'Sem ICP salvo: não há critérios para buscar.',
          cartoes: [{ tipo: 'aviso', texto: 'Sem ICP salvo, ainda não dá para buscar empresas.' }],
          custo: 0,
        }
      }
      return {
        resumo: `Critérios do ICP (versão ${r.icpVersion ?? '?'}): ${JSON.stringify(r.criteria).slice(0, 1500)}`,
        cartoes: [{ tipo: 'criterios', icpVersion: r.icpVersion ?? null, criterios: r.criteria ?? {} }],
        custo: 0,
      }
    },
  }

  const buscar: Ferramenta = {
    nome: 'buscar_empresas',
    descricao: 'Busca empresas novas que combinam com o ICP e as põe na Caixa de Descobertas, com a aderência e o porquê.',
    esquema: {
      quantidade: `quantas empresas trazer, de 1 a ${MAXIMO_DE_EMPRESAS} (padrão ${PADRAO_DE_EMPRESAS})`,
      criterios: 'opcional: só os critérios que a pessoa pediu para mudar, no formato de montar_criterios_da_busca',
    },
    aprovacao: 'teto',
    titulo: (e) => `Buscar ${quantidade(e.quantidade)} empresas pelo ICP`,
    async cotar(ctx, e) {
      const linha = primeira<{ credits: number | string }>(
        await s.rpc(ctx, 'quote_account_discovery', { p_workspace_id: ctx.workspaceId, p_max_results: quantidade(e.quantidade) }),
      )
      return Number(linha?.credits ?? 0)
    },
    async executar(ctx, e) {
      const n = quantidade(e.quantidade)
      const base = await s.funcao(ctx, 'account-discovery', { action: 'criteria', workspaceId: ctx.workspaceId })
      if (!base.temIcp) throw new Error('O Workspace ainda não tem ICP salvo para buscar empresas.')
      const ajuste = e.criterios && typeof e.criterios === 'object' && !Array.isArray(e.criterios) ? e.criterios as Record<string, unknown> : {}
      const inicio = await s.funcao(ctx, 'account-discovery', {
        action: 'search',
        workspaceId: ctx.workspaceId,
        requestKey: `agente:${ctx.passoId}`,
        maxResults: n,
        criteria: { ...(base.criteria as Record<string, unknown> ?? {}), ...ajuste },
        icpVersion: base.icpVersion ?? null,
      })
      const runId = typeof inicio.runId === 'string' ? inicio.runId : ''
      if (!runId) throw new Error('A busca não começou.')
      const limite = relogio() + ESPERA_DA_BUSCA_MS
      while (relogio() < limite) {
        await esperar(4000)
        const r = await resultadoDaBusca(s, ctx, runId)
        if (r) return r
      }
      return {
        resumo: 'A busca de empresas continua em segundo plano; o resultado aparece neste passo quando terminar.',
        cartoes: [{ tipo: 'aviso', texto: 'A busca continua. O resultado aparece aqui quando terminar.' }],
        custo: 0,
        pendente: { externo: { runId } },
      }
    },
    async atualizar(ctx, externo) {
      return await resultadoDaBusca(s, ctx, uuid(externo.runId, 'a busca'))
    },
  }

  const aceitar: Ferramenta = {
    nome: 'aceitar_empresa',
    descricao: 'Aceita uma empresa da busca como Conta-alvo (só quando a pessoa pediu).',
    esquema: { descobertaId: 'o id da empresa que veio da busca' },
    aprovacao: 'livre',
    titulo: () => 'Aceitar a empresa como Conta-alvo',
    cotar: () => Promise.resolve(0),
    async executar(ctx, e) {
      const id = uuid(e.descobertaId, 'a empresa')
      const r = primeira<{ target_account_id: string; created: boolean; committee: string }>(
        await s.rpc(ctx, 'accept_discovered_account', { p_id: id, p_url: null }),
      )
      if (!r?.target_account_id) throw new Error('A empresa não virou Conta-alvo.')
      const comite = r.committee === 'liberado'
        ? ' O comitê de compra começa a ser buscado.'
        : r.committee === 'sem_saldo'
        ? ' Sem saldo de créditos para buscar o comitê agora.'
        : ''
      return {
        resumo: `${r.created ? 'A empresa virou Conta-alvo' : 'A empresa já era Conta-alvo'} (conta ${r.target_account_id}).${comite}`,
        cartoes: [{ tipo: 'aviso', texto: `${r.created ? 'Virou Conta-alvo.' : 'Já era Conta-alvo.'}${comite}`, contaId: r.target_account_id, descobertaId: id }],
        custo: 0,
      }
    },
  }

  const descartar: Ferramenta = {
    nome: 'descartar_empresa',
    descricao: 'Descarta uma empresa da busca (só quando a pessoa pediu), com o motivo se ela disse.',
    esquema: { descobertaId: 'o id da empresa que veio da busca', motivo: 'opcional: o motivo em uma frase' },
    aprovacao: 'livre',
    titulo: () => 'Descartar a empresa',
    cotar: () => Promise.resolve(0),
    async executar(ctx, e) {
      const id = uuid(e.descobertaId, 'a empresa')
      const motivo = texto(e.motivo).slice(0, 300)
      await s.rpc(ctx, 'discard_discovered_account', { p_id: id, p_reason: motivo || null })
      return {
        resumo: `A empresa ${id} foi descartada${motivo ? ` (${motivo})` : ''}.`,
        cartoes: [{ tipo: 'aviso', texto: 'Descartada.', descobertaId: id }],
        custo: 0,
      }
    },
  }

  const comite: Ferramenta = {
    nome: 'enriquecer_comite',
    descricao: `Busca até ${PESSOAS_DO_COMITE} pessoas do comitê de compra de uma Conta-alvo (cargo e LinkedIn).`,
    esquema: { contaId: 'o id da Conta-alvo' },
    aprovacao: 'teto',
    titulo: () => 'Enriquecer o comitê de compra',
    cotar: () => Promise.resolve(PESSOAS_DO_COMITE),
    async executar(ctx, e) {
      const conta = await s.lerConta(ctx, uuid(e.contaId, 'a Conta-alvo'))
      if (!conta) throw new Error('Conta-alvo não encontrada.')
      const r = await s.funcao(ctx, 'account-enrichment', {
        action: 'comite-compra',
        workspaceId: ctx.workspaceId,
        targetAccountId: conta.id,
        companyName: conta.nome,
        companyDomain: conta.dominio ?? undefined,
        companyLinkedinUrl: conta.linkedinUrl ?? undefined,
        limite: PESSOAS_DO_COMITE,
        requestKey: `agente:${ctx.passoId}`,
      })
      const propostas = Array.isArray(r.proposed) ? r.proposed as Record<string, unknown>[] : []
      const pessoas = propostas.map((p) => ({
        nome: texto(p.nome), cargo: texto(p.cargo) || null, persona: texto(p.persona) || null,
        linkedinUrl: texto(p.linkedinUrl) || null, jaEncontrada: Boolean(p.jaEncontrada),
      })).filter((p) => p.nome)
      const novas = Number(r.contactsAdded ?? 0)
      return {
        resumo: pessoas.length
          ? `${pessoas.length} pessoas do comitê de ${conta.nome} (${novas} novas): ${pessoas.slice(0, 10).map((p) => `${p.nome}${p.cargo ? `, ${p.cargo}` : ''}`).join('; ')}`
          : `Não achei pessoas do comitê de ${conta.nome}.`,
        cartoes: [{ tipo: 'pessoas', contaId: conta.id, conta: conta.nome, pessoas }],
        custo: novas,
      }
    },
  }

  const receita: Ferramenta = {
    nome: 'consultar_receita',
    descricao: 'Consulta os dados da Receita Federal de um CNPJ e os grava na Conta-alvo.',
    esquema: { contaId: 'o id da Conta-alvo', cnpj: 'o CNPJ, com ou sem pontuação' },
    aprovacao: 'teto',
    titulo: (e) => `Consultar a Receita do CNPJ ${texto(e.cnpj)}`.trim(),
    cotar: () => Promise.resolve(1),
    async executar(ctx, e) {
      const cnpj = texto(e.cnpj).replace(/\D/g, '')
      if (cnpj.length !== 14) throw new Error('Informe um CNPJ com 14 dígitos.')
      const r = await s.funcao(ctx, 'account-enrichment', {
        action: 'cnpj-receita', workspaceId: ctx.workspaceId, targetAccountId: uuid(e.contaId, 'a Conta-alvo'), cnpj,
      })
      const cnae = r.cnaePrincipal as { codigo?: string; descricao?: string } | undefined
      const endereco = r.endereco as { municipio?: string; uf?: string } | undefined
      const campos = {
        cnpj: texto(r.cnpjFormatado) || cnpj,
        razaoSocial: texto(r.razaoSocial),
        nomeFantasia: texto(r.nomeFantasia) || null,
        situacao: texto(r.situacaoCadastral) || null,
        porte: texto(r.porte) || null,
        cnae: cnae?.descricao ? `${cnae.codigo ?? ''} ${cnae.descricao}`.trim() : null,
        local: endereco?.municipio ? `${endereco.municipio}${endereco.uf ? `/${endereco.uf}` : ''}` : null,
        socios: Array.isArray(r.socios) ? (r.socios as { nome?: string }[]).map((x) => texto(x.nome)).filter(Boolean).slice(0, 8) : [],
      }
      return {
        resumo: `Receita de ${campos.razaoSocial || campos.cnpj}: situação ${campos.situacao ?? '?'}, porte ${campos.porte ?? '?'}, CNAE ${campos.cnae ?? '?'}, ${campos.local ?? ''}`.trim(),
        cartoes: [{ tipo: 'receita', contaId: e.contaId, ...campos }],
        custo: 1,
      }
    },
  }

  return [lerIcp, criterios, buscar, aceitar, descartar, comite, receita]
}

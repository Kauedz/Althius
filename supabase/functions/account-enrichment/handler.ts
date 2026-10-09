// O enriquecimento de Contas e Contatos (enriquecimento-em-cascata):
// 1. Dados cadastrais da Receita Federal por CNPJ (Apify johnatan029~cnpj-empresas-brasil-scraper com fallback para BrasilAPI);
// 2. Busca do comitê de compra (Decisor, Influenciador, Campeão) via ProvedorDeContatos;
// 3. Revelação de e-mail (2 créditos) e telefone (5 créditos), cobrando apenas quando encontra e registrando a origem LGPD.
import { comCors } from '../_shared/cors.ts'
import type { Apify } from '../signal-scan/handler.ts'
import {
  type ProvedorDeContatos,
  type PessoaEncontrada,
  type DadoRevelado,
  ApifyProvedorDeContatos,
  CascataProvedorDeContatos,
  fornecedoresDaCascata,
} from '../_shared/provedor-de-contatos.ts'

export interface SocioReceita {
  nome: string
  cargo?: string
  qualificacao?: string
  faixaEtaria?: string
}

export interface EnderecoReceita {
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cep?: string
  municipio?: string
  uf?: string
}

export interface DadosReceitaFederal {
  cnpj: string
  cnpjFormatado: string
  razaoSocial: string
  nomeFantasia?: string
  situacaoCadastral: string
  dataSituacaoCadastral?: string
  cnaePrincipal: { codigo: string; descricao: string }
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  naturezaJuridica?: { codigo: string; descricao: string }
  capitalSocial?: number
  porte?: string
  endereco?: EnderecoReceita
  telefones: string[]
  email?: string
  socios: SocioReceita[]
  fonte: 'apify' | 'brasilapi'
}

export interface DbEnrichment {
  userFromJwt(authorization: string, apikey: string): Promise<{ userId: string } | null>
  beginCommitteeDiscovery(args: {
    workspaceId: string
    targetAccountId: string
    requestKey?: string
    maxResults?: number
    actorId?: string
    allowTesting?: boolean
    authorization: string
    apikey: string
  }): Promise<{ runId: string; reservationId: string }>
  finishCommitteeDiscovery(args: {
    runId: string
    success: boolean
    contactsFound: number
    costUsd?: number
    error?: string
  }): Promise<void>
  recordProposedContact(args: {
    workspaceId: string
    targetAccountId: string
    discoveryRunId?: string
    name: string
    role?: string
    headline?: string
    linkedinUrl?: string
    location?: string
    photoUrl?: string
    persona?: string
    sourceActor?: string
    sourceProvider?: string
    sourceData?: unknown
  }): Promise<{ id: string; created: boolean }>
  getContactForReveal(args: {
    workspaceId: string
    contactId: string
    authorization: string
    apikey: string
  }): Promise<{ name: string; linkedin?: string; companyName?: string } | null>
  beginRevealContact(args: {
    workspaceId: string
    contactId: string
    channel: 'email' | 'telefone'
    requestKey?: string
    authorization: string
    apikey: string
  }): Promise<{ reservationId: string }>
  finishRevealContact(args: {
    reservationId: string
    contactId: string
    channel: 'email' | 'telefone'
    value?: string
    source?: string
  }): Promise<{ success: boolean; debitedCredits: number }>
  saveReceitaEnrichment?(args: {
    workspaceId: string
    targetAccountId: string
    cnpj: string
    receitaData: DadosReceitaFederal
    authorization: string
    apikey: string
  }): Promise<void>
  /** begin_cnpj_receita: reserva 1 crédito da consulta para quem está na sessão, antes do Apify. */
  beginCnpjReceita?(args: {
    workspaceId: string
    targetAccountId: string
    requestKey?: string
    authorization: string
    apikey: string
  }): Promise<{ reservationId: string }>
  /** finish_cnpj_receita: liquida 1 crédito se achou o CNPJ; senão libera a reserva e debita zero. */
  finishCnpjReceita?(args: {
    reservationId: string
    found: boolean
  }): Promise<{ debitedCredits: number }>
  /** record_discovery_cost: o dólar que o Apify devolveu, no registro de custo do actor. */
  recordDiscoveryCost?(args: {
    workspaceId: string
    actorId: string
    runId: string
    items: number
    costUsd: number | null
  }): Promise<void>
}

export interface DepsEnrichment {
  db: DbEnrichment
  apify?: Apify
  provedorContatos?: ProvedorDeContatos
  fetchFn?: typeof fetch
  actorReceita?: string
  appOrigin?: string
}

/** Valida o CNPJ pelos 14 dígitos e dígitos verificadores. */
export function validarCnpj(valor: string): string | null {
  const v = valor.replace(/\D/g, '')
  if (v.length !== 14 || /^(\d)\1{13}$/.test(v)) return null

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  let soma = 0
  for (let i = 0; i < 12; i++) soma += parseInt(v[i], 10) * pesos1[i]
  let resto = soma % 11
  const dv1 = resto < 2 ? 0 : 11 - resto
  if (parseInt(v[12], 10) !== dv1) return null

  soma = 0
  for (let i = 0; i < 13; i++) soma += parseInt(v[i], 10) * pesos2[i]
  resto = soma % 11
  const dv2 = resto < 2 ? 0 : 11 - resto
  if (parseInt(v[13], 10) !== dv2) return null

  return v
}

/** Formata o CNPJ com máscara 00.000.000/0000-00. */
export function formatarCnpj(cnpj14: string): string {
  if (cnpj14.length !== 14) return cnpj14
  return `${cnpj14.slice(0, 2)}.${cnpj14.slice(2, 5)}.${cnpj14.slice(5, 8)}/${cnpj14.slice(8, 12)}-${cnpj14.slice(12, 14)}`
}

/** Consulta dados do CNPJ na BrasilAPI como fallback. */
export async function consultarBrasilApi(
  cnpjLimpo: string,
  fetchFn: typeof fetch = fetch,
): Promise<DadosReceitaFederal | null> {
  try {
    const res = await fetchFn(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
    if (!res.ok) return null
    const data = await res.json()

    const telefones: string[] = []
    if (data.ddd_telefone_1) telefones.push(String(data.ddd_telefone_1).trim())
    if (data.ddd_telefone_2) telefones.push(String(data.ddd_telefone_2).trim())

    const cnaesSecundarios: Array<{ codigo: string; descricao: string }> = []
    if (Array.isArray(data.cnaes_secundarios)) {
      for (const item of data.cnaes_secundarios) {
        if (item && typeof item === 'object') {
          cnaesSecundarios.push({
            codigo: String(item.codigo ?? ''),
            descricao: String(item.descricao ?? ''),
          })
        }
      }
    }

    const socios: SocioReceita[] = []
    if (Array.isArray(data.qsa)) {
      for (const s of data.qsa) {
        if (s && typeof s === 'object') {
          socios.push({
            nome: String(s.nome_socio ?? '').trim(),
            cargo: String(s.qualificacao_socio ?? '').trim() || undefined,
            qualificacao: String(s.qualificacao_socio ?? '').trim() || undefined,
            faixaEtaria: s.faixa_etaria ? String(s.faixa_etaria) : undefined,
          })
        }
      }
    }

    return {
      cnpj: cnpjLimpo,
      cnpjFormatado: formatarCnpj(cnpjLimpo),
      razaoSocial: String(data.razao_social ?? '').trim(),
      nomeFantasia: data.nome_fantasia ? String(data.nome_fantasia).trim() : undefined,
      situacaoCadastral: String(data.descricao_situacao_cadastral ?? 'ATIVA').trim(),
      dataSituacaoCadastral: data.data_situacao_cadastral ? String(data.data_situacao_cadastral) : undefined,
      cnaePrincipal: {
        codigo: String(data.cnae_fiscal ?? ''),
        descricao: String(data.cnae_fiscal_descricao ?? ''),
      },
      cnaesSecundarios,
      naturezaJuridica: data.natureza_juridica
        ? { codigo: '', descricao: String(data.natureza_juridica) }
        : undefined,
      capitalSocial: typeof data.capital_social === 'number' ? data.capital_social : undefined,
      porte: data.porte ? String(data.porte) : undefined,
      endereco: {
        logradouro: data.logradouro ? String(data.logradouro) : undefined,
        numero: data.numero ? String(data.numero) : undefined,
        complemento: data.complemento ? String(data.complemento) : undefined,
        bairro: data.bairro ? String(data.bairro) : undefined,
        cep: data.cep ? String(data.cep) : undefined,
        municipio: data.municipio ? String(data.municipio) : undefined,
        uf: data.uf ? String(data.uf) : undefined,
      },
      telefones,
      email: data.email ? String(data.email).trim().toLowerCase() : undefined,
      socios,
      fonte: 'brasilapi',
    }
  } catch {
    return null
  }
}

/** Consulta CNPJ via Apify (johnatan029~cnpj-empresas-brasil-scraper). */
export async function consultarApifyReceita(
  cnpjLimpo: string,
  apify: Apify,
  actorId = 'johnatan029~cnpj-empresas-brasil-scraper',
  medicao?: { runId: string | null; costUsd: number | null },
): Promise<DadosReceitaFederal | null> {
  try {
    const exec = await apify.run({
      actorId,
      input: {
        mode: 'lookup',
        cnpjs: [cnpjLimpo],
      },
      maxItems: 1,
      maxTotalChargeUsd: 0.05,
    })

    if (medicao) {
      medicao.runId = exec.runId
      if (exec.runId && apify.custoDaExecucao) {
        try {
          medicao.costUsd = await apify.custoDaExecucao(exec.runId)
        } catch {
          medicao.costUsd = null
        }
      }
    }

    const item = Array.isArray(exec.items) && exec.items[0] ? (exec.items[0] as Record<string, unknown>) : null
    if (!item) return null

    const razaoSocial = String(item.razaoSocial ?? item.razao_social ?? '').trim()
    if (!razaoSocial) return null

    const cnaePrincipal = item.cnaePrincipal && typeof item.cnaePrincipal === 'object'
      ? {
        codigo: String((item.cnaePrincipal as Record<string, unknown>).codigo ?? item.cnaePrincipal),
        descricao: String((item.cnaePrincipal as Record<string, unknown>).descricao ?? item.cnaeDescricao ?? ''),
      }
      : { codigo: String(item.cnaePrincipal ?? ''), descricao: String(item.cnaeDescricao ?? '') }

    const cnaesSecundarios: Array<{ codigo: string; descricao: string }> = []
    if (Array.isArray(item.cnaesSecundarios)) {
      for (const cs of item.cnaesSecundarios) {
        if (cs && typeof cs === 'object') {
          cnaesSecundarios.push({
            codigo: String((cs as Record<string, unknown>).codigo ?? ''),
            descricao: String((cs as Record<string, unknown>).descricao ?? ''),
          })
        }
      }
    }

    const socios: SocioReceita[] = []
    if (Array.isArray(item.socios)) {
      for (const s of item.socios) {
        if (s && typeof s === 'object') {
          const rec = s as Record<string, unknown>
          socios.push({
            nome: String(rec.nome ?? rec.nome_socio ?? '').trim(),
            cargo: String(rec.cargo ?? rec.qualificacao ?? '').trim() || undefined,
            qualificacao: String(rec.qualificacao ?? '').trim() || undefined,
            faixaEtaria: rec.faixaEtaria ? String(rec.faixaEtaria) : undefined,
          })
        }
      }
    }

    const telefones: string[] = []
    if (Array.isArray(item.telefones)) {
      for (const t of item.telefones) {
        if (typeof t === 'string' && t.trim()) telefones.push(t.trim())
        else if (t && typeof t === 'object') {
          const o = t as Record<string, unknown>
          telefones.push(`${o.ddd ?? ''}${o.numero ?? ''}`.trim())
        }
      }
    } else if (typeof item.telefone === 'string' && item.telefone.trim()) {
      telefones.push(item.telefone.trim())
    }

    const rawEnd = (item.endereco ?? {}) as Record<string, unknown>
    const endereco: EnderecoReceita = {
      logradouro: rawEnd.logradouro ? String(rawEnd.logradouro) : undefined,
      numero: rawEnd.numero ? String(rawEnd.numero) : undefined,
      complemento: rawEnd.complemento ? String(rawEnd.complemento) : undefined,
      bairro: rawEnd.bairro ? String(rawEnd.bairro) : undefined,
      cep: rawEnd.cep ? String(rawEnd.cep) : undefined,
      municipio: rawEnd.municipio ? String(rawEnd.municipio) : undefined,
      uf: rawEnd.uf ? String(rawEnd.uf) : undefined,
    }

    return {
      cnpj: cnpjLimpo,
      cnpjFormatado: formatarCnpj(cnpjLimpo),
      razaoSocial,
      nomeFantasia: item.nomeFantasia ? String(item.nomeFantasia).trim() : undefined,
      situacaoCadastral: String(item.situacaoCadastral ?? 'ATIVA').trim(),
      dataSituacaoCadastral: item.dataSituacaoCadastral ? String(item.dataSituacaoCadastral) : undefined,
      cnaePrincipal,
      cnaesSecundarios,
      capitalSocial: typeof item.capitalSocial === 'number' ? item.capitalSocial : undefined,
      porte: item.porte ? String(item.porte) : undefined,
      endereco,
      telefones,
      email: item.email ? String(item.email).trim().toLowerCase() : undefined,
      socios,
      fonte: 'apify',
    }
  } catch {
    return null
  }
}

function json(corpo: unknown, status: number) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function criarHandlerEnrichment(deps: DepsEnrichment) {
  const provedor = deps.provedorContatos ?? new CascataProvedorDeContatos(fornecedoresDaCascata({ apify: deps.apify }))

  const handler = async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }

    const authorization = req.headers.get('Authorization') ?? ''
    const apikey = req.headers.get('apikey') ?? ''

    try {
      const body = await req.json().catch(() => ({}))
      const action = String(body.action ?? '').trim()

      if (!action) {
        return new Response(JSON.stringify({ error: 'action is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // 1. Consulta CNPJ na Receita Federal (Apify com fallback para BrasilAPI).
      // A sessão e a reserva de 1 crédito vêm antes de qualquer consulta. Achar liquida; não achar libera.
      if (action === 'cnpj-receita') {
        const user = await deps.db.userFromJwt(authorization, apikey)
        if (!user) {
          return json({ error: 'unauthorized' }, 401)
        }

        const rawCnpj = String(body.cnpj ?? '').trim()
        const cnpjLimpo = validarCnpj(rawCnpj)
        if (!cnpjLimpo) {
          return json({ error: 'CNPJ inválido' }, 400)
        }

        const workspaceId = String(body.workspaceId ?? '').trim()
        const targetAccountId = String(body.targetAccountId ?? '').trim()
        if (!workspaceId || !targetAccountId || !deps.db.beginCnpjReceita || !deps.db.finishCnpjReceita || !deps.db.saveReceitaEnrichment) {
          return json({ error: 'workspaceId and targetAccountId are required' }, 400)
        }

        let reservationId: string
        try {
          const inicio = await deps.db.beginCnpjReceita({
            workspaceId,
            targetAccountId,
            requestKey: body.requestKey ? String(body.requestKey) : undefined,
            authorization,
            apikey,
          })
          reservationId = inicio.reservationId
        } catch (e) {
          const mensagem = e instanceof Error ? e.message : 'Não foi possível reservar o crédito.'
          const semCredito = mensagem.includes('insufficient credits') || mensagem.includes('monthly credit limit reached')
          return json({ error: mensagem }, semCredito ? 402 : 403)
        }

        const medicao: { runId: string | null; costUsd: number | null } = { runId: null, costUsd: null }
        const actorId = deps.actorReceita ?? 'johnatan029~cnpj-empresas-brasil-scraper'
        let resultado: DadosReceitaFederal | null = null
        if (deps.apify) {
          resultado = await consultarApifyReceita(cnpjLimpo, deps.apify, actorId, medicao)
        }
        if (!resultado) {
          resultado = await consultarBrasilApi(cnpjLimpo, deps.fetchFn)
        }

        const gravarCusto = () => {
          if (!medicao.runId || !deps.db.recordDiscoveryCost) return Promise.resolve()
          return deps.db.recordDiscoveryCost({
            workspaceId,
            actorId,
            runId: medicao.runId,
            items: resultado?.fonte === 'apify' ? 1 : 0,
            costUsd: medicao.costUsd,
          }).catch(() => {})
        }

        if (!resultado) {
          await deps.db.finishCnpjReceita({ reservationId, found: false })
          await gravarCusto()
          return json({ error: 'Dados do CNPJ não encontrados' }, 404)
        }

        try {
          await deps.db.saveReceitaEnrichment({
            workspaceId,
            targetAccountId,
            cnpj: cnpjLimpo,
            receitaData: resultado,
            authorization,
            apikey,
          })
        } catch (e) {
          await deps.db.finishCnpjReceita({ reservationId, found: false }).catch(() => {})
          const mensagem = e instanceof Error ? e.message : 'Não foi possível gravar a Receita.'
          return json({ error: mensagem }, 403)
        }

        await deps.db.finishCnpjReceita({ reservationId, found: true })
        await gravarCusto()
        return json(resultado, 200)
      }

      // 2. Busca de comitê de compra da empresa
      if (action === 'comite-compra') {
        const workspaceId = String(body.workspaceId ?? '').trim()
        const targetAccountId = String(body.targetAccountId ?? '').trim()
        const companyName = String(body.companyName ?? '').trim()

        if (!workspaceId || !targetAccountId || !companyName) {
          return new Response(JSON.stringify({ error: 'workspaceId, targetAccountId and companyName are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const user = await deps.db.userFromJwt(authorization, apikey)
        if (!user) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const limite = Math.min(Math.max(Number(body.limite) || 10, 1), 30)
        const actorId = 'harvestapi~linkedin-company-employees'
        const inicio = await deps.db.beginCommitteeDiscovery({
          workspaceId,
          targetAccountId,
          requestKey: body.requestKey ? String(body.requestKey) : undefined,
          maxResults: limite,
          actorId,
          allowTesting: Boolean(body.allowTesting ?? true),
          authorization,
          apikey,
        })

        // O comitê chama o actor direto, e a medição (id e custo) é a da execução dele.
        const buscaDePessoas = deps.provedorContatos
          ?? (deps.apify ? new ApifyProvedorDeContatos({ apify: deps.apify }) : provedor)
        const medicao = { runId: null as string | null, costUsd: null as number | null }
        const gravarCusto = (itens: number) => {
          if (!medicao.runId || !deps.db.recordDiscoveryCost) return Promise.resolve()
          return deps.db.recordDiscoveryCost({
            workspaceId,
            actorId,
            runId: medicao.runId,
            items: itens,
            costUsd: medicao.costUsd,
          }).catch(() => {})
        }

        let pessoas: PessoaEncontrada[]
        try {
          pessoas = await buscaDePessoas.buscarPessoas({
            nome: companyName,
            linkedinUrl: body.companyLinkedinUrl ? String(body.companyLinkedinUrl) : undefined,
            dominio: body.companyDomain ? String(body.companyDomain) : undefined,
            cargos: Array.isArray(body.cargos) ? body.cargos.map(String) : undefined,
            limite,
            medicao,
          })
        } catch (e) {
          const mensagem = e instanceof Error ? e.message : 'A busca do comitê falhou.'
          await deps.db.finishCommitteeDiscovery({
            runId: inicio.runId,
            success: false,
            contactsFound: 0,
            costUsd: medicao.costUsd ?? undefined,
            error: mensagem,
          })
          await gravarCusto(0)
          return json({ error: mensagem }, 502)
        }

        let gravados = 0
        for (const p of pessoas) {
          try {
            await deps.db.recordProposedContact({
              workspaceId,
              targetAccountId,
              discoveryRunId: inicio.runId,
              name: p.nome,
              role: p.cargo,
              headline: p.headline,
              linkedinUrl: p.linkedinUrl,
              location: p.localizacao,
              photoUrl: p.foto,
              persona: p.persona,
              sourceActor: actorId,
              sourceProvider: p.fonte,
              sourceData: p,
            })
            gravados++
          } catch {
            // Continua gravando os demais
          }
        }

        // Lista vazia também conclui: debita zero. O custo da execução vai nos dois desfechos.
        await deps.db.finishCommitteeDiscovery({
          runId: inicio.runId,
          success: true,
          contactsFound: gravados,
          costUsd: medicao.costUsd ?? undefined,
        })
        await gravarCusto(pessoas.length)

        return json({
          runId: inicio.runId,
          contactsFound: pessoas.length,
          contactsAdded: gravados,
          proposed: pessoas,
        }, 200)
      }

      // 3. Revelar o e-mail de um contato. Telefone está fora (spec prospeccao-funcional): recusado antes da reserva.
      if (action === 'revelar-contato') {
        if (body.canal === 'telefone') {
          return json({ error: 'A revelação de telefone está indisponível.' }, 400)
        }
        const workspaceId = String(body.workspaceId ?? '').trim()
        const contactId = String(body.contactId ?? '').trim()
        const canal = 'email'

        if (!workspaceId || !contactId) {
          return new Response(JSON.stringify({ error: 'workspaceId and contactId are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const user = await deps.db.userFromJwt(authorization, apikey)
        if (!user) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const contato = await deps.db.getContactForReveal({
          workspaceId,
          contactId,
          authorization,
          apikey,
        })

        if (!contato) {
          return new Response(JSON.stringify({ error: 'Contato não encontrado' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Reserva os 2 créditos do e-mail
        const reserva = await deps.db.beginRevealContact({
          workspaceId,
          contactId,
          channel: canal,
          requestKey: body.requestKey ? String(body.requestKey) : undefined,
          authorization,
          apikey,
        })

        // O revelar chama o actor direto, como o comitê: a cascata engolia a exceção e a falha virava "não encontrado".
        const revelador = deps.provedorContatos
          ?? (deps.apify ? new ApifyProvedorDeContatos({ apify: deps.apify }) : provedor)
        const actorId = 'harvestapi~linkedin-profile-scraper'
        const medicao = { runId: null as string | null, costUsd: null as number | null }
        // Um perfil consultado por execução, achando ou não: input_units é a entrada do actor.
        const gravarCusto = () => {
          if (!medicao.runId || !deps.db.recordDiscoveryCost) return Promise.resolve()
          return deps.db.recordDiscoveryCost({
            workspaceId,
            actorId,
            runId: medicao.runId,
            items: 1,
            costUsd: medicao.costUsd,
          }).catch(() => {})
        }

        let revelado: DadoRevelado | null
        try {
          if (!revelador.revelarContato) throw new Error('nenhum provedor revela e-mail')
          revelado = await revelador.revelarContato(
            {
              nome: contato.name,
              linkedinUrl: contato.linkedin,
              empresa: contato.companyName,
            },
            canal,
            medicao,
          )
        } catch (e) {
          // Falha não é "não encontrado": libera a reserva, debita zero e diz que falhou.
          const mensagem = e instanceof Error ? e.message : 'erro desconhecido'
          await deps.db.finishRevealContact({ reservationId: reserva.reservationId, contactId, channel: canal })
          await gravarCusto()
          return json({ error: `A busca do e-mail falhou: ${mensagem}` }, 502)
        }

        // O banco decide: debita 2 só quando grava um e-mail que o Contato ainda não tinha; senão libera a reserva.
        const finalizado = await deps.db.finishRevealContact({
          reservationId: reserva.reservationId,
          contactId,
          channel: canal,
          value: revelado?.valor,
          source: revelado?.fonte,
        })
        await gravarCusto()

        const gravado = finalizado.success && revelado ? revelado : null
        return json({
          sucesso: finalizado.success,
          canal,
          valor: gravado?.valor ?? null,
          creditosDebitados: finalizado.debitedCredits,
          fonte: gravado?.fonte ?? null,
          lgpd: {
            origem: gravado?.fonte ?? null,
            coletadoEm: new Date().toISOString(),
            baseLegal: 'needs-info (dados profissionais de acesso público)',
          },
        }, 200)
      }

      return new Response(JSON.stringify({ error: `Ação não reconhecida: ${action}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro interno' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return deps.appOrigin ? comCors(deps.appOrigin, handler) : handler
}

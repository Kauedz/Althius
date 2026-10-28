// Fase 7 (o ICP pelo CRM): ler_icp_do_crm lê os negócios ganhos do HubSpot ou do Pipedrive pelo conector do Workspace
// (integration-tools, só leituras, com a sessão de quem pede) e propõe setor, porte e região pela regra da decisão 6:
// ticket maior e ciclo mais curto pesam mais. Não salva: as divergências com o ICP salvo vão para a pessoa escolher, e
// salvar continua com salvar_icp, que sempre pede confirmação.
import { divergenciasDoIcp, inferirIcpDosGanhos, type NegocioGanho } from '../icp-do-crm/inferir.ts'
import { ganhoDoHubspot, ganhoDoPipedrive } from '../icp-do-crm/dos-crms.ts'
import type { ServicosDoAgente } from './ferramentas.ts'
import type { ContextoDaFerramenta, Ferramenta } from './registro.ts'

/** Quantos negócios ganhos lemos por CRM (cada um pede mais uma ou duas leituras). */
export const MAXIMO_DE_GANHOS = 20

type Registro = Record<string, unknown>
const objeto = (v: unknown): Registro | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Registro) : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

async function chamar(s: ServicosDoAgente, ctx: ContextoDaFerramenta, integrationId: string, ferramenta: string, argumentos: Registro) {
  const r = await s.funcao(ctx, 'integration-tools', { action: 'chamar', workspaceId: ctx.workspaceId, integrationId, ferramenta, argumentos })
  if (r.erro === true || r.estruturado === undefined) throw new Error(`${integrationId} não respondeu ${ferramenta}.`)
  return r.estruturado
}

async function talvez<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

async function ganhosDoHubspot(s: ServicosDoAgente, ctx: ContextoDaFerramenta): Promise<NegocioGanho[]> {
  const busca = objeto(await chamar(s, ctx, 'hubspot', 'search_deals', {
    filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }] }],
    properties: ['amount', 'createdate', 'closedate'],
    limit: MAXIMO_DE_GANHOS,
  }))
  const deals = lista(busca?.results).map(objeto).filter((d): d is Registro => !!d).slice(0, MAXIMO_DE_GANHOS)
  return await Promise.all(deals.map(async (deal) => {
    const comAssociacoes = objeto(await talvez(chamar(s, ctx, 'hubspot', 'get_record', { objeto: 'deals', id: String(deal.id), associations: 'companies' })))
    const empresaId = objeto(lista(objeto(objeto(comAssociacoes?.associations)?.companies)?.results)[0])?.id
    const empresa = empresaId
      ? objeto(await talvez(chamar(s, ctx, 'hubspot', 'get_record', { objeto: 'companies', id: String(empresaId), properties: 'industry,numberofemployees,state,country' })))
      : null
    return ganhoDoHubspot(deal, empresa)
  }))
}

async function ganhosDoPipedrive(s: ServicosDoAgente, ctx: ContextoDaFerramenta): Promise<NegocioGanho[]> {
  const resposta = objeto(await chamar(s, ctx, 'pipedrive', 'list_deals', { status: 'won', limit: MAXIMO_DE_GANHOS }))
  const deals = lista(resposta?.data).map(objeto).filter((d): d is Registro => !!d).slice(0, MAXIMO_DE_GANHOS)
  return await Promise.all(deals.map(async (deal) => {
    const org = deal.org_id
    const orgId = typeof org === 'number' ? org : objeto(org)?.value
    const organizacao = typeof orgId === 'number'
      ? objeto(objeto(await talvez(chamar(s, ctx, 'pipedrive', 'get_organization', { id: orgId })))?.data)
      : null
    return ganhoDoPipedrive(deal, organizacao)
  }))
}

const CRMS = [
  { nome: 'HubSpot', ler: ganhosDoHubspot },
  { nome: 'Pipedrive', ler: ganhosDoPipedrive },
]

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function ferramentaIcpDoCrm(s: ServicosDoAgente): Ferramenta {
  return {
    nome: 'ler_icp_do_crm',
    descricao: 'Lê os negócios ganhos do CRM conectado (HubSpot ou Pipedrive) e propõe setor, porte e região do ICP, ' +
      'pesando ticket maior e ciclo mais curto. Mostra onde discorda do ICP salvo. Não salva.',
    esquema: {},
    aprovacao: 'livre',
    titulo: () => 'Ler os negócios ganhos do CRM para propor o ICP',
    cotar: () => Promise.resolve(0),
    async executar(ctx) {
      const lidos: string[] = []
      const ganhos: NegocioGanho[] = []
      for (const crm of CRMS) {
        const deste = await talvez(crm.ler(s, ctx))
        if (deste === null) continue
        lidos.push(crm.nome)
        ganhos.push(...deste)
      }
      if (!lidos.length) {
        return {
          resumo: 'Nenhum CRM conectado para ler negócios ganhos.',
          cartoes: [{ tipo: 'aviso', texto: 'Conecte o HubSpot ou Pipedrive em Conexões para eu ler os negócios ganhos.' }],
          custo: 0,
        }
      }
      const icp = inferirIcpDosGanhos(ganhos)
      if (!icp) {
        return {
          resumo: `${lidos.join(' e ')} sem negócios ganhos.`,
          cartoes: [{ tipo: 'aviso', texto: `Encontrei ${lidos.join(' e ')}, mas nenhum negócio ganho para ler.` }],
          custo: 0,
        }
      }
      const salvo = objeto(await s.rpc(ctx, 'get_my_workspace_icp', { p_workspace_id: ctx.workspaceId }))
      const divergencias = divergenciasDoIcp(icp, salvo ? { setor: texto(salvo.sector), porte: texto(salvo.companySize), regiao: texto(salvo.geography) } : null)
      const proposta = {
        setor: icp.setor.valor,
        porte: icp.porte.valor,
        geografia: icp.regiao.valor,
        cargos: [] as string[],
        oQueVende: null,
        miniIcp: null,
        porQueCompram: null,
      }
      const resumo = [
        `Proposta de ICP pelos ${icp.negocios} negócios ganhos (${lidos.join(', ')})`,
        proposta.setor && `setor: ${proposta.setor} (${Math.round(icp.setor.fatia * 100)}% do peso)`,
        proposta.porte && `porte: ${proposta.porte} (${Math.round(icp.porte.fatia * 100)}% do peso)`,
        proposta.geografia && `região: ${proposta.geografia} (${Math.round(icp.regiao.fatia * 100)}% do peso)`,
        divergencias.length
          ? `diverge do ICP salvo em ${divergencias.map((d) => `${d.campo} (CRM: ${d.doCrm}; salvo: ${d.doSite})`).join(', ')}; o CRM pesa mais, mas pergunte qual manter`
          : 'não diverge do ICP salvo',
        'Ainda não salva: mostre e chame salvar_icp com os campos que a pessoa aprovar.',
      ].filter(Boolean).join('; ')
      return {
        resumo,
        cartoes: [{ tipo: 'icp_proposto', origem: 'crm', crms: lidos, negocios: icp.negocios, ...proposta, divergencias }],
        custo: 0,
      }
    },
  }
}

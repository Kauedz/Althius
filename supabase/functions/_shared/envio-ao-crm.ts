// O escritor do Envio ao CRM (kanban-de-prospeccao 05, ADR-0020): leva a empresa, os Contatos e a nota que o banco montou
// (`begin_crm_handoff`) para o CRM, um escritor por CRM, pelas ferramentas REST dos perfis (`integracoes/perfis.ts`).
//
//   escreverNoCrm({ integrationId, payload, jaCriado, chamar, progresso?, agora? })
//
// É uma função pura em relação ao transporte: quem chama entrega `chamar(ferramenta, argumentos)`. A Edge Function
// `crm-handoff` (o Vendedor responsável clicando) passa `chamarFerramenta` com `decisaoDaPessoa`; o executor das Aprovações
// de Agentes, numa próxima fatia, passa `chamarFerramenta` com o `agenteId` (Propor → Aprovação; Executar → direto), sem
// mudar nada aqui. Nada é criado duas vezes: o que `jaCriado` traz (de uma tentativa anterior que falhou) é pulado, e cada
// objeto criado é entregue a `progresso` na hora, para uma queda no meio não perder o que já existe no CRM.
import { type ErroDeIntegracao, primeiroValor, type Resultado, type ResultadoDaFerramenta } from './integracoes/tipos.ts'

export interface EmpresaDoEnvio {
  nome: string
  dominio: string | null
  site: string | null
  cnpj: string | null
  segmento: string | null
  linkedin: string | null
}

export interface ContatoDoEnvio {
  id: string
  nome: string
  cargo: string | null
  email: string | null
  telefone: string | null
  linkedin: string | null
}

/** O que vai ao CRM, como `begin_crm_handoff` monta. */
export interface PayloadDoEnvio {
  empresa: EmpresaDoEnvio
  contatos: ContatoDoEnvio[]
  /** Em português, com quebras de linha. */
  nota: string
}

/** Os ids criados no CRM. `contatos` vai do id do Contato na Althius ao id no CRM. */
export interface RefsDoCrm {
  empresa?: string
  contatos?: Record<string, string>
  nota?: string
  /** Os Contatos que já existiam no CRM (pelo e-mail) e não foram duplicados. */
  existentes?: string[]
}

export type Chamar = (ferramenta: string, argumentos: Record<string, unknown>) => Promise<Resultado<ResultadoDaFerramenta>>

export interface ResultadoDoEnvio {
  ok: boolean
  refs: RefsDoCrm
  /** Para a pessoa, em português e sem token. */
  mensagem: string
  /** O que este CRM não recebe (ex.: a nota no RD Station CRM). */
  pendencias: string[]
  /** O erro tipado da Integração, quando a falha veio do Acesso (reconectar, indisponível…). */
  erro?: ErroDeIntegracao
}

export interface PedidoDeEscrita {
  integrationId: string
  payload: PayloadDoEnvio
  jaCriado?: RefsDoCrm
  chamar: Chamar
  progresso?: (refs: RefsDoCrm) => Promise<void>
  agora?: () => Date
}

const NOMES: Record<string, string> = { hubspot: 'HubSpot', pipedrive: 'Pipedrive', 'rd-station': 'RD Station CRM' }

/** Os CRMs com escritor. */
export function crmComEscritor(integrationId: string): boolean {
  return Object.hasOwn(NOMES, integrationId)
}

export function nomeDoCrm(integrationId: string): string {
  return NOMES[integrationId] ?? integrationId
}

/** Uma falha que interrompe o envio, com o que já foi criado guardado em `refs`. */
class Interrupcao extends Error {
  constructor(mensagem: string, readonly erro?: ErroDeIntegracao) {
    super(mensagem)
  }
}

function textoDe(r: ResultadoDaFerramenta): string {
  const partes = (r.conteudo ?? []).map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
  const texto = partes.join(' ').replace(/\s+/g, ' ').trim()
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto
}

function semVazios(objeto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}

function notaEmHtml(nota: string): string {
  return nota.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

function dividirNome(nome: string): { firstname: string; lastname?: string } {
  const [primeiro, ...resto] = nome.trim().split(/\s+/)
  return resto.length ? { firstname: primeiro, lastname: resto.join(' ') } : { firstname: primeiro }
}

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export async function escreverNoCrm(pedido: PedidoDeEscrita): Promise<ResultadoDoEnvio> {
  const { integrationId, payload } = pedido
  const crm = nomeDoCrm(integrationId)
  const refs: RefsDoCrm = {
    ...pedido.jaCriado,
    contatos: { ...pedido.jaCriado?.contatos },
    existentes: [...(pedido.jaCriado?.existentes ?? [])],
  }
  const pendencias: string[] = []
  const agora = pedido.agora ?? (() => new Date())

  const guardar = async () => {
    await pedido.progresso?.(refs).catch(() => {})
  }

  /** Chama uma ferramenta e devolve o resultado; a falha do Acesso interrompe com a mensagem dele. */
  async function chamar(ferramenta: string, argumentos: Record<string, unknown>): Promise<ResultadoDaFerramenta> {
    const r = await pedido.chamar(ferramenta, argumentos)
    if (!r.ok) throw new Interrupcao(r.erro.mensagem, r.erro)
    return r.valor
  }

  /** Cria e lê o id; recusa da ferramenta ou resposta sem id interrompe. */
  async function criar(o_que: string, ferramenta: string, argumentos: Record<string, unknown>, caminhos: string[]): Promise<string> {
    const r = await chamar(ferramenta, argumentos)
    if (r.erro) throw new Interrupcao(`O ${crm} recusou ${o_que}: ${textoDe(r) || 'sem detalhe'}.`)
    const id = primeiroValor(r.estruturado, caminhos)
    if (!id) throw new Interrupcao(`O ${crm} não devolveu o id de ${o_que}.`)
    return id
  }

  async function porContato(fazer: (c: ContatoDoEnvio) => Promise<void>) {
    for (const contato of payload.contatos) {
      if (refs.contatos![contato.id]) continue
      await fazer(contato)
      await guardar()
    }
  }

  try {
    if (integrationId === 'hubspot') {
      if (!refs.empresa) {
        refs.empresa = await criar('a empresa', 'create_company', {
          properties: semVazios({
            name: payload.empresa.nome,
            domain: payload.empresa.dominio,
            website: payload.empresa.site,
            linkedin_company_page: payload.empresa.linkedin,
          }),
        }, ['id'])
        await guardar()
      }
      await porContato(async (c) => {
        const r = await chamar('create_contact', {
          properties: semVazios({ ...dividirNome(c.nome), email: c.email, phone: c.telefone, jobtitle: c.cargo }),
          // não confirmado: 279 é o tipo de associação Contact → Company (sem rótulo) da tabela de tipos padrão.
          associations: [{ to: { id: refs.empresa }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 279 }] }],
        })
        if (r.erro) {
          // O HubSpot recusa o e-mail que já existe (409) e diz qual é o Contact: ele não é duplicado.
          const existente = /HTTP 409/.test(textoDe(r)) ? /Existing ID:\s*(\d+)/i.exec(textoDe(r))?.[1] : undefined
          if (!existente) throw new Interrupcao(`O ${crm} recusou o Contato ${c.nome}: ${textoDe(r) || 'sem detalhe'}.`)
          refs.contatos![c.id] = existente
          refs.existentes!.push(c.id)
          return
        }
        const id = primeiroValor(r.estruturado, ['id'])
        if (!id) throw new Interrupcao(`O ${crm} não devolveu o id do Contato ${c.nome}.`)
        refs.contatos![c.id] = id
      })
      if (!refs.nota) {
        refs.nota = await criar('a nota', 'create_note', {
          properties: { hs_note_body: notaEmHtml(payload.nota), hs_timestamp: agora().toISOString() },
          associations: [
            { to: { id: refs.empresa }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 }] },
            ...Object.values(refs.contatos!).map((id) => ({
              to: { id },
              types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
            })),
          ],
        }, ['id'])
        await guardar()
      }
    } else if (integrationId === 'pipedrive') {
      if (!refs.empresa) {
        refs.empresa = await criar('a organização', 'add_organization', { name: payload.empresa.nome }, ['data.id'])
        await guardar()
      }
      const orgId = Number(refs.empresa)
      await porContato(async (c) => {
        refs.contatos![c.id] = await criar(`o Contato ${c.nome}`, 'add_person', semVazios({
          name: c.nome,
          email: c.email,
          phone: c.telefone,
          org_id: Number.isFinite(orgId) ? orgId : refs.empresa,
        }), ['data.id'])
      })
      if (!refs.nota) {
        refs.nota = await criar('a nota', 'add_note', {
          content: notaEmHtml(payload.nota),
          org_id: Number.isFinite(orgId) ? orgId : refs.empresa,
        }, ['data.id'])
        await guardar()
      }
    } else if (integrationId === 'rd-station') {
      // não confirmado: o campo do id na resposta (`_id` ou `id`).
      if (!refs.empresa) {
        refs.empresa = await criar('a empresa', 'create_organization', { name: payload.empresa.nome }, ['_id', 'id'])
        await guardar()
      }
      await porContato(async (c) => {
        refs.contatos![c.id] = await criar(`o Contato ${c.nome}`, 'create_contact', semVazios({
          name: c.nome,
          title: c.cargo,
          emails: c.email ? [{ email: c.email }] : undefined,
          phones: c.telefone ? [{ phone: c.telefone }] : undefined,
          organization_id: refs.empresa,
        }), ['_id', 'id'])
      })
      pendencias.push('O RD Station CRM não recebe a nota: a API v1 confirmada só tem anotações em negociações.')
    } else {
      return { ok: false, refs, pendencias, mensagem: `A Althius ainda não sabe enviar Contas ao ${crm}.` }
    }
  } catch (erro) {
    if (!(erro instanceof Interrupcao)) throw erro
    const feitos = Object.keys(refs.contatos!).length
    const criado = !refs.empresa
      ? ''
      : feitos
      ? `A empresa e ${contar(feitos, 'Contato', 'Contatos')} já estão no ${crm}; tentar de novo não os cria outra vez.`
      : `A empresa já está no ${crm}; tentar de novo não a cria outra vez.`
    return { ok: false, refs, pendencias, mensagem: [erro.message, criado].filter(Boolean).join(' '), ...(erro.erro ? { erro: erro.erro } : {}) }
  }

  const novos = Object.keys(refs.contatos!).length - refs.existentes!.length
  const partes = [`a empresa`, contar(novos, 'Contato', 'Contatos')]
  if (refs.nota) partes.push('a nota')
  const existentes = refs.existentes!.length
    ? refs.existentes!.length === 1
      ? ` 1 Contato já existia no ${crm} e não foi duplicado.`
      : ` ${refs.existentes!.length} Contatos já existiam no ${crm} e não foram duplicados.`
    : ''
  return {
    ok: true,
    refs,
    pendencias,
    mensagem: `Enviada ao ${crm}: ${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}.${existentes}`,
  }
}

// O que os passos têm em comum: ler o modelo de entrada da cascata e os critérios do pedido, e a forma das vagas e das
// empresas que passam de um passo para o outro. Reaproveita os auxiliares dos adaptadores de Sinal (comparar empresas,
// datas e limites do banco); nada aqui fala com a rede.
import {
  dentroDoPeriodo,
  diasDoPeriodo,
  dataIso,
  dominio,
  lista,
  nomeDaEmpresa,
  objeto,
  paginaDoLinkedin,
  texto,
} from '../../../signal-runner/adaptadores/comum.ts'
import type { ContextoDoPasso, Item, SinalDeEmpresa } from '../tipos.ts'

export { dentroDoPeriodo, dataIso, diasDoPeriodo, dominio, lista, nomeDaEmpresa, objeto, paginaDoLinkedin, texto }

/** Uma lista de textos do pedido (`criterios`) ou, na falta, do modelo de entrada da cascata. */
export function listaDoPasso(ctx: ContextoDoPasso, chaveDoPedido: string, chaveDoModelo: string): string[] {
  const doPedido = lista(ctx.criterios[chaveDoPedido])
  return doPedido.length ? doPedido : lista(ctx.def.inputTemplate[chaveDoModelo])
}

/** A janela em dias: o período do pedido ("Últimos 7 dias"), ou o do modelo, ou 7. */
export function janelaDoPasso(ctx: ContextoDoPasso): number {
  if (ctx.criterios.periodo !== undefined) return diasDoPeriodo(ctx.criterios, 7)
  const doModelo = Number(ctx.def.inputTemplate.janelaDias)
  return Number.isFinite(doModelo) && doModelo > 0 ? Math.min(doModelo, 365) : 7
}

export interface EmpresaDaVaga {
  nome: string
  linkedinUrl: string
  site: string
  funcionarios?: number
}

export interface VagaNormalizada {
  titulo: string
  local: string
  descricao: string
  nivel: string
  link: string
  /** ISO 8601; nulo quando a fonte não traz. */
  publicadaEm: string | null
  fonte: string
}

/** O item de vaga que o passo de busca entrega. */
export function itemDeVaga(vaga: VagaNormalizada, empresa: EmpresaDaVaga): Item {
  return { tipo: 'vaga', ...vaga, empresa }
}

export function vagaDoItem(item: Item): { vaga: VagaNormalizada; empresa: EmpresaDaVaga } | null {
  if (item.tipo !== 'vaga') return null
  const e = objeto(item.empresa)
  const titulo = texto(item.titulo)
  if (!titulo || !texto(e.nome)) return null
  return {
    vaga: {
      titulo,
      local: texto(item.local),
      descricao: texto(item.descricao),
      nivel: texto(item.nivel),
      link: texto(item.link),
      publicadaEm: typeof item.publicadaEm === 'string' ? item.publicadaEm : null,
      fonte: texto(item.fonte) || 'Vagas',
    },
    empresa: { nome: texto(e.nome), linkedinUrl: texto(e.linkedinUrl), site: texto(e.site), ...(typeof e.funcionarios === 'number' ? { funcionarios: e.funcionarios } : {}) },
  }
}

/** A empresa candidata que sai da confirmação: uma por empresa, com as vagas que a trouxeram. */
export interface Candidata {
  chave: string
  empresa: EmpresaDaVaga
  vagas: VagaNormalizada[]
}

export function itemDeCandidata(c: Candidata): Item {
  return { tipo: 'empresa', chave: c.chave, empresa: c.empresa, vagas: c.vagas }
}

export function candidataDoItem(item: Item): Candidata | null {
  if (item.tipo !== 'empresa' || !Array.isArray(item.vagas)) return null
  const e = objeto(item.empresa)
  if (!texto(e.nome)) return null
  const vagas = (item.vagas as unknown[]).flatMap((v) => {
    const o = objeto(v)
    return texto(o.titulo)
      ? [{
        titulo: texto(o.titulo), local: texto(o.local), descricao: texto(o.descricao), nivel: texto(o.nivel), link: texto(o.link),
        publicadaEm: typeof o.publicadaEm === 'string' ? o.publicadaEm : null, fonte: texto(o.fonte) || 'Vagas',
      }]
      : []
  })
  return {
    chave: texto(item.chave),
    empresa: { nome: texto(e.nome), linkedinUrl: texto(e.linkedinUrl), site: texto(e.site), ...(typeof e.funcionarios === 'number' ? { funcionarios: e.funcionarios } : {}) },
    vagas,
  }
}

/** A chave de uma empresa para juntar vagas: a página do LinkedIn, o site ou o nome sem a forma jurídica. */
export function chaveDaEmpresa(e: EmpresaDaVaga): string {
  return paginaDoLinkedin(e.linkedinUrl) ? `li:${paginaDoLinkedin(e.linkedinUrl)}` : dominio(e.site) ? `site:${dominio(e.site)}` : `nome:${nomeDaEmpresa(e.nome)}`
}

/** O endereço da página da empresa no LinkedIn sem os parâmetros de rastreio. */
export function paginaLimpa(url: string): string {
  const pagina = paginaDoLinkedin(url)
  return pagina ? `https://www.linkedin.com/company/${pagina}` : ''
}

/** Só dígitos e letras do CNPJ (o novo formato é alfanumérico), em maiúsculas; vazio se não tem 14 posições. */
export function cnpjLimpo(valor: unknown): string {
  const v = texto(valor).replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return v.length === 14 ? v : ''
}

/** Quantas empresas que não são Conta uma execução leva ao banco: o resto fica só na contagem de "sem Conta". */
export const MAX_EMPRESAS_SEM_CONTA = 50

/**
 * Guarda o Sinal de uma empresa que não é Conta, para o motor entregá-lo ao banco depois dos Sinais das Contas. Fica na
 * memória da execução, e não no fluxo dos itens, para os passos seguintes (a Receita, por exemplo) só verem Contas.
 * Sem CNPJ válido nem site, o banco não consegue deduplicar a empresa com segurança e nada seria gravado: nem guarda.
 */
export function guardarSinalDeEmpresa(memoria: Map<string, unknown>, s: SinalDeEmpresa): void {
  if (!cnpjLimpo(s.empresa.cnpj) && !texto(s.empresa.site)) return
  const atual = memoria.get('sinaisDeEmpresas')
  const lista = Array.isArray(atual) ? atual as SinalDeEmpresa[] : []
  if (lista.length >= MAX_EMPRESAS_SEM_CONTA * 10) return
  lista.push(s)
  memoria.set('sinaisDeEmpresas', lista)
}

/** O que os passos guardaram, no formato que o banco aceita, de até `MAX_EMPRESAS_SEM_CONTA` empresas diferentes. */
export function sinaisDeEmpresaDaMemoria(memoria: Map<string, unknown>): SinalDeEmpresa[] {
  const atual = memoria.get('sinaisDeEmpresas')
  if (!Array.isArray(atual)) return []
  const empresas = new Set<string>()
  const saida: SinalDeEmpresa[] = []
  for (const s of atual as SinalDeEmpresa[]) {
    const chave = cnpjLimpo(s.empresa.cnpj) || paginaDoLinkedin(s.empresa.linkedinUrl) || dominio(s.empresa.site) || s.empresa.nome
    if (!empresas.has(chave) && empresas.size >= MAX_EMPRESAS_SEM_CONTA) continue
    empresas.add(chave)
    saida.push(s)
  }
  return saida
}

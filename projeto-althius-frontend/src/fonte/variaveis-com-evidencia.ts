// Resolver e prévia de variáveis com evidência (ticket 06). Não desenha tela: a página que já
// mostra o passo continua dona do layout e passa a chamar `previaDoPasso` quando for ligada.
// Envio, resposta e indicação não se emprestam. Dado de outra Conta ou Workspace não entra.
// Variável sem valor fica no texto e bloqueia; nunca vira string vazia.

import { valorDaVariavel, type DadosDasVariaveis } from './variaveis-do-passo'

export interface SinalAcessivel {
  workspaceId: string
  contaId: string
  frase: string
  fonte?: string | null
  evidencia?: string | null
  /** O servidor só considera Sinal dos últimos 30 dias. Quem chama já aplica essa regra. */
  valido: boolean
}

export interface ContatoReferenciado {
  id: string
  nome: string
  workspaceId: string
  contaId: string
}

export interface EvidenciaDeEnvio {
  contatoId: string
  workspaceId: string
  contaId: string
  status: string
}

export interface EvidenciaDeResposta {
  contatoId: string
  workspaceId: string
  contaId: string
}

export interface EvidenciaDeIndicacao {
  contatoId: string
  workspaceId: string
  contaId: string
  evidencia: string
}

export interface ContextoComEvidencia extends DadosDasVariaveis {
  workspaceId: string
  contaId: string
  sinais?: SinalAcessivel[]
  referenciaContatoId?: string | null
  referencia?: ContatoReferenciado | null
  envios?: EvidenciaDeEnvio[]
  respostas?: EvidenciaDeResposta[]
  indicacoes?: EvidenciaDeIndicacao[]
}

export interface PreviaDoPasso {
  assunto: string
  corpo: string
  faltando: string[]
  bloqueado: boolean
  motivo: string | null
}

const VARIAVEL = /\{\{\s*([\w.]+)\s*\}\}/g
const EVIDENCIA = new Set([
  'sinal.frase',
  'sinal.fonte',
  'sinal.evidencia',
  'referencia.envio',
  'referencia.resposta',
  'referencia.indicacao',
])

function mesmoLugar(item: { workspaceId: string; contaId: string }, ctx: ContextoComEvidencia): boolean {
  return item.workspaceId === ctx.workspaceId && item.contaId === ctx.contaId
}

function referenciaDestaConta(ctx: ContextoComEvidencia): ContatoReferenciado | null {
  const ref = ctx.referencia
  if (!ref || !ctx.referenciaContatoId || ref.id !== ctx.referenciaContatoId) return null
  if (!mesmoLugar(ref, ctx)) return null
  const nome = ref.nome.trim()
  return nome ? { ...ref, nome } : null
}

function sinalDestaConta(ctx: ContextoComEvidencia): SinalAcessivel | null {
  return (ctx.sinais ?? []).find((sinal) => sinal.valido && mesmoLugar(sinal, ctx) && sinal.frase.trim()) ?? null
}

function envioConfirmado(ctx: ContextoComEvidencia, contatoId: string): boolean {
  return (ctx.envios ?? []).some((envio) =>
    envio.contatoId === contatoId && envio.status === 'sent' && mesmoLugar(envio, ctx))
}

function temResposta(ctx: ContextoComEvidencia, contatoId: string): boolean {
  return (ctx.respostas ?? []).some((resposta) => resposta.contatoId === contatoId && mesmoLugar(resposta, ctx))
}

function indicacaoComprovada(ctx: ContextoComEvidencia, contato: ContatoReferenciado): boolean {
  const nome = contato.nome.toLowerCase()
  const primeiro = nome.split(/\s+/)[0] ?? ''
  return (ctx.indicacoes ?? []).some((item) => {
    if (item.contatoId !== contato.id || !mesmoLugar(item, ctx)) return false
    const evidencia = item.evidencia.trim().toLowerCase()
    return evidencia !== '' && evidencia !== nome && evidencia !== primeiro
  })
}

function valorDeEvidencia(nome: string, ctx: ContextoComEvidencia): string | null {
  if (nome === 'sinal.frase' || nome === 'sinal.fonte' || nome === 'sinal.evidencia') {
    const sinal = sinalDestaConta(ctx)
    if (!sinal) return null
    const valor = nome === 'sinal.frase' ? sinal.frase : nome === 'sinal.fonte' ? sinal.fonte : sinal.evidencia
    return valor?.trim() ? valor.trim() : null
  }
  if (!nome.startsWith('referencia.')) return null
  const contato = referenciaDestaConta(ctx)
  if (!contato) return null
  if (nome === 'referencia.envio') return envioConfirmado(ctx, contato.id) ? contato.nome : null
  if (nome === 'referencia.resposta') return temResposta(ctx, contato.id) ? contato.nome : null
  if (nome === 'referencia.indicacao') return indicacaoComprovada(ctx, contato) ? contato.nome : null
  return null
}

export function valorComEvidencia(nome: string, ctx: ContextoComEvidencia): string | null {
  const chave = nome.toLowerCase()
  if (EVIDENCIA.has(chave)) return valorDeEvidencia(chave, ctx)
  return valorDaVariavel(chave, ctx)
}

function motivoDaFalta(nome: string, ctx: ContextoComEvidencia): string {
  const contato = referenciaDestaConta(ctx)
  if (nome === 'referencia.resposta' && contato && envioConfirmado(ctx, contato.id)) {
    return `O envio a ${contato.nome} não é resposta nem indicação.`
  }
  if (nome === 'referencia.indicacao' && contato) {
    return `O nome de ${contato.nome} não é indicação comprovada.`
  }
  if (nome === 'referencia.envio' && contato) {
    return `Não há envio confirmado a ${contato.nome}. Tentativa agendada não conta.`
  }
  if (nome.startsWith('sinal.') && (ctx.sinais ?? []).some((sinal) => sinal.valido && !mesmoLugar(sinal, ctx))) {
    return `Falta evidência para {{${nome}}}. Sinal de outra Conta ou Workspace não entra. O passo não sai com variável vazia.`
  }
  return `Falta evidência para {{${nome}}}. O passo não sai com variável vazia.`
}

/** A mensagem como o Vendedor vê antes de autorizar. Token sem valor permanece; não vira vazio. */
export function previaDoPasso(assunto: string, corpo: string, ctx: ContextoComEvidencia): PreviaDoPasso {
  const faltando: string[] = []
  const resolver = (texto: string) => texto.replace(VARIAVEL, (token, nome: string) => {
    const chave = nome.toLowerCase()
    const valor = valorComEvidencia(chave, ctx)
    if (!valor) {
      if (!faltando.includes(chave)) faltando.push(chave)
      return token
    }
    return valor
  })
  const previa = { assunto: resolver(assunto), corpo: resolver(corpo) }
  return {
    ...previa,
    faltando,
    bloqueado: faltando.length > 0,
    motivo: faltando.length ? motivoDaFalta(faltando[0], ctx) : null,
  }
}

/** A autorização guarda o texto resolvido. Dado que mude esse texto exige nova revisão. */
export function mensagemAutorizadaMudou(
  autorizada: { assunto: string; corpo: string },
  atual: { assunto: string; corpo: string },
): boolean {
  return autorizada.assunto !== atual.assunto || autorizada.corpo !== atual.corpo
}

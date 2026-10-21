// Templates da Althius (ticket 07): estrutura reutilizável, sem Contato, destino, histórico ou autorização.
// A cópia é independente. A sugestão só escolhe um template deste catálogo e só quando há Sinal real.

import type { LiberacaoDoPasso, StepSequencia } from './sequencias-tipos'

export interface PassoDeTemplate {
  id: string
  ordem: number
  canal: 'email' | 'linkedin' | 'whatsapp'
  delayDiasUteis: number
  titulo: string
  assunto?: string
  corpo?: string
  objetivo?: string
  liberacao?: LiberacaoDoPasso
  predecessorId?: string
}

export interface TemplateDaAlthius {
  id: string
  nome: string
  resumo: string
  passos: PassoDeTemplate[]
}

export type MotivoDaSugestao = 'ok' | 'sem_contexto' | 'teto' | 'indisponivel'

export interface SugestaoDeTemplate {
  templateId: string | null
  justificativa: string
  motivo: MotivoDaSugestao
}

/** O catálogo que a Demonstração mostra. O banco semeia os mesmos ids; o Cliente não edita o original. */
export const TEMPLATES_DA_ALTHIUS: readonly TemplateDaAlthius[] = [
  {
    id: 'abertura-por-sinal',
    nome: 'Abertura pelo Sinal',
    resumo: 'Três e-mails, nos dias 0, 3 e 7, para abrir a partir de um Sinal da Conta. Sem destinatário.',
    passos: [
      {
        id: 'abertura-1',
        ordem: 1,
        canal: 'email',
        delayDiasUteis: 0,
        titulo: 'Abertura com o Sinal',
        assunto: '{{primeiro_nome}}, sobre a {{empresa}}',
        corpo: 'Oi {{primeiro_nome}}, vi um sinal recente na {{empresa}}. Faz sentido uma conversa?',
        objetivo: 'Abrir a conversa a partir do Sinal da Conta.',
      },
      {
        id: 'abertura-2',
        ordem: 2,
        canal: 'email',
        delayDiasUteis: 3,
        titulo: 'Retomada',
        assunto: 'Re: {{empresa}}',
        corpo: 'Retomando, {{primeiro_nome}}.',
        objetivo: 'Retomar se não houve resposta.',
      },
      {
        id: 'abertura-3',
        ordem: 3,
        canal: 'email',
        delayDiasUteis: 4,
        titulo: 'Último toque',
        assunto: 'Última ideia para {{empresa}}',
        corpo: 'Fico à disposição. {{remetente.nome}}',
        objetivo: 'Encerrar o ciclo sem insistir.',
      },
    ],
  },
  {
    id: 'retomada-curta',
    nome: 'Retomada curta',
    resumo: 'Dois e-mails, nos dias 0 e 4. Sem destinatário e sem afirmar resultado.',
    passos: [
      {
        id: 'retomada-1',
        ordem: 1,
        canal: 'email',
        delayDiasUteis: 0,
        titulo: 'Primeiro e-mail',
        assunto: '{{primeiro_nome}}, uma ideia para a {{empresa}}',
        corpo: 'Oi {{primeiro_nome}}, escrevo sobre a {{empresa}}.',
        objetivo: 'Abrir a conversa.',
      },
      {
        id: 'retomada-2',
        ordem: 2,
        canal: 'email',
        delayDiasUteis: 4,
        titulo: 'Segundo e-mail',
        assunto: 'Re: {{empresa}}',
        corpo: 'Retomando, {{primeiro_nome}}. {{remetente.nome}}',
        objetivo: 'Retomar uma vez.',
      },
    ],
  },
]

const CAMPOS_DE_DESTINO = ['contatoId', 'destino', 'metricas', 'anexos'] as const

export function templateSemDestinoReal(template: TemplateDaAlthius): boolean {
  return template.passos.every((passo) => CAMPOS_DE_DESTINO.every((campo) => !(campo in passo)))
}

/** Cópia independente: ids novos, Contato atribuído na hora, predecessor remapeado. O original não muda. */
export function copiarTemplate(template: TemplateDaAlthius, contatoId: string): StepSequencia[] {
  const ids = new Map(template.passos.map((passo) => [passo.id, `copia-${template.id}-${passo.ordem}`]))
  return template.passos.map((passo) => ({
    id: ids.get(passo.id) ?? `copia-${template.id}-${passo.ordem}`,
    ordem: passo.ordem,
    canal: passo.canal,
    contatoId,
    delayDiasUteis: passo.delayDiasUteis,
    titulo: passo.titulo,
    ...(passo.assunto ? { assunto: passo.assunto } : {}),
    ...(passo.corpo ? { corpo: passo.corpo } : {}),
    ...(passo.objetivo ? { objetivo: passo.objetivo } : {}),
    ...(passo.canal === 'email' ? { modoEmail: 'manual' as const } : {}),
    ...(passo.liberacao ? { liberacao: passo.liberacao } : {}),
    ...(passo.predecessorId && ids.has(passo.predecessorId)
      ? { predecessorId: ids.get(passo.predecessorId) }
      : {}),
  }))
}

const TETOS = new Set(['teto_atingido', 'sem_teto', 'sem_espaco'])

/**
 * Escolhe só o template de abertura quando ele está acessível e a Conta tem um Sinal real.
 * Sem Sinal, não escolhe. Teto bloqueado não escolhe. A frase cita o Sinal; não alega eficácia.
 */
export function sugerirTemplateDaAlthius(entrada: {
  templates: readonly TemplateDaAlthius[]
  conta: string
  sinal: { frase: string; data: string } | null
  teto?: string
}): SugestaoDeTemplate {
  if (entrada.teto && TETOS.has(entrada.teto)) {
    return { templateId: null, justificativa: '', motivo: 'teto' }
  }
  const frase = entrada.sinal?.frase.trim() ?? ''
  if (!frase) return { templateId: null, justificativa: '', motivo: 'sem_contexto' }
  const template = entrada.templates.find((item) => item.id === 'abertura-por-sinal')
  if (!template) return { templateId: null, justificativa: '', motivo: 'indisponivel' }
  return {
    templateId: template.id,
    motivo: 'ok',
    justificativa:
      `A Conta ${entrada.conta.trim()} tem o Sinal “${frase}”. ` +
      'O template Abertura pelo Sinal é uma estrutura de e-mails já existente, sem destinatário. ' +
      'Não há medida de resultado deste template.',
  }
}

export function templateDaResposta(bruto: unknown): TemplateDaAlthius | null {
  if (!bruto || typeof bruto !== 'object') return null
  const linha = bruto as Record<string, unknown>
  const id = typeof linha.id === 'string' ? linha.id : ''
  const nome = typeof linha.nome === 'string' ? linha.nome : ''
  const resumo = typeof linha.resumo === 'string' ? linha.resumo : ''
  if (!id || !nome || !Array.isArray(linha.passos)) return null
  const passos = linha.passos.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const passo = { ...(item as PassoDeTemplate) }
    for (const campo of CAMPOS_DE_DESTINO) delete (passo as Record<string, unknown>)[campo]
    if (!passo.id || !passo.titulo || !passo.canal) return []
    return [passo]
  })
  if (passos.length === 0) return null
  return { id, nome, resumo, passos }
}

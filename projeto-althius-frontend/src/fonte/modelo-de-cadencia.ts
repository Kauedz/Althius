// A Cadência do Playbook como modelo de Sequência (playbook-do-workspace, ticket 05): cada linha da seção Cadência
// (toque, canal, dia, objetivo) vira um passo, e o Template de mesmo nome da seção Templates dá o assunto e o corpo.
// Só E-mail, LinkedIn e WhatsApp viram passo; os outros canais ficam de fora, listados, e nada é descartado em silêncio.

import { normalizarParaBusca } from '@/lib/utils'
import type { LinhaDoPlaybook } from './playbook-tipos'
import type { CanalSuportado, StepSequencia } from './sequencias-tipos'

export interface ToqueDoModelo {
  titulo: string
  canal: CanalSuportado
  /** O dia da Cadência em que o toque sai, contado do primeiro. */
  dia: number
  objetivo: string
  assunto: string
  corpo: string
  /** WhatsApp e LinkedIn ainda não têm o ciclo real de envio: o passo nasce, mas não sai (canais 06 e 07). */
  dependeDoCanal: boolean
}

export interface ModeloDeCadencia {
  toques: ToqueDoModelo[]
  /** Os toques cujo canal a Sequência ainda não suporta (ligação, SMS...). */
  foraDoEscopo: string[]
}

function canalDoTexto(texto: string): CanalSuportado | undefined {
  const canal = normalizarParaBusca(texto)
  if (canal.includes('mail')) return 'email'
  if (canal.includes('linkedin')) return 'linkedin'
  if (canal.includes('whats')) return 'whatsapp'
  return undefined
}

function numeroDoDia(texto: string | undefined): number | undefined {
  const achado = /\d+/.exec(texto ?? '')
  return achado ? Number(achado[0]) : undefined
}

export function modeloDeCadencia(cadencia: LinhaDoPlaybook[], templates: LinhaDoPlaybook[]): ModeloDeCadencia {
  const toques: ToqueDoModelo[] = []
  const foraDoEscopo: string[] = []
  let diaAnterior = 0
  for (const linha of cadencia) {
    const titulo = (linha.toque ?? '').trim()
    if (!titulo) continue
    const canal = canalDoTexto(linha.canal ?? '')
    if (!canal) {
      foraDoEscopo.push(titulo)
      continue
    }
    const dia = Math.max(numeroDoDia(linha.dia) ?? diaAnterior, diaAnterior)
    diaAnterior = dia
    const template = templates.find((t) => normalizarParaBusca(t.nome ?? '') === normalizarParaBusca(titulo))
    toques.push({
      titulo,
      canal,
      dia,
      objetivo: (linha.objetivo ?? '').trim(),
      assunto: (template?.assunto ?? '').trim(),
      corpo: (template?.corpo ?? '').trim(),
      dependeDoCanal: canal !== 'email',
    })
  }
  return { toques, foraDoEscopo }
}

/** Os passos da Sequência a partir do modelo: o espaço entre eles é a diferença de dias, e todos começam no primeiro Contato. */
export function passosDoModelo(toques: ToqueDoModelo[], contatoId: string): StepSequencia[] {
  return toques.map((toque, indice) => ({
    id: `step-modelo-${indice + 1}`,
    ordem: indice + 1,
    canal: toque.canal,
    contatoId,
    delayDiasUteis: indice === 0 ? 0 : toque.dia - toques[indice - 1].dia,
    titulo: toque.titulo,
    ...(toque.canal === 'email' && toque.assunto ? { assunto: toque.assunto } : {}),
    ...(toque.corpo ? { corpo: toque.corpo } : {}),
    ...(toque.objetivo ? { objetivo: toque.objetivo } : {}),
    ...(toque.canal === 'email' ? { modoEmail: 'manual' as const } : {}),
    ...(toque.canal === 'linkedin' ? { subtipoLinkedIn: 'mensagem' as const } : {}),
  }))
}

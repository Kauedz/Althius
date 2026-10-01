// Os critérios de passagem do kanban (kanban-de-prospeccao, ticket 04): a linha da seção SLA e metas do Playbook cuja
// Definição é o nome de um Estágio de prospecção ("Em abordagem", "Fit"...) traz o critério para a Conta entrar nele.
// O critério é texto livre do Administrador: a tela o mostra e avisa, não o confere nem bloqueia.

import { normalizarParaBusca } from '@/lib/utils'
import { ESTAGIOS_DE_PROSPECCAO, type EstagioDeProspeccao } from './estagios-de-prospeccao'
import type { LinhaDoPlaybook } from './playbook-tipos'

export type CriteriosDePassagem = Partial<Record<EstagioDeProspeccao, string>>

/** O critério de cada Estágio que o SLA e metas nomeia; linhas de outras definições (Lead, SQL...) ficam de fora. */
export function criteriosDePassagem(linhas: LinhaDoPlaybook[]): CriteriosDePassagem {
  const criterios: CriteriosDePassagem = {}
  for (const linha of linhas) {
    const definicao = normalizarParaBusca(linha.definicao ?? '')
    const criterio = (linha.criterio ?? '').trim()
    if (!definicao || !criterio) continue
    const estagio = ESTAGIOS_DE_PROSPECCAO.find(
      ({ id, rotulo }) => normalizarParaBusca(rotulo) === definicao || id === definicao,
    )
    if (estagio && !criterios[estagio.id]) criterios[estagio.id] = criterio
  }
  return criterios
}

/** O Estágio seguinte do funil, ou nenhum depois de Descartada e de No CRM, que não têm passagem à mão. */
export function estagioSeguinte(estagio: EstagioDeProspeccao): EstagioDeProspeccao | undefined {
  if (estagio === 'descartada' || estagio === 'no_crm') return undefined
  const indice = ESTAGIOS_DE_PROSPECCAO.findIndex((e) => e.id === estagio)
  return ESTAGIOS_DE_PROSPECCAO[indice + 1]?.id
}

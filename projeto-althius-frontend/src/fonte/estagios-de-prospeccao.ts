// Os Estágios de prospecção do kanban de Contas (ADR-0020), na ordem das colunas. O banco guarda o mesmo
// identificador (`private.prospecting_stage_catalog`); o rótulo é o da tela.

export const ESTAGIOS_DE_PROSPECCAO = [
  { id: 'descoberta', rotulo: 'Descoberta' },
  { id: 'quente', rotulo: 'Quente' },
  { id: 'fit', rotulo: 'Fit' },
  { id: 'em_abordagem', rotulo: 'Em abordagem' },
  { id: 'respondeu', rotulo: 'Respondeu' },
  { id: 'reuniao', rotulo: 'Reunião' },
  { id: 'no_crm', rotulo: 'No CRM' },
  { id: 'descartada', rotulo: 'Descartada' },
] as const

export type EstagioDeProspeccao = (typeof ESTAGIOS_DE_PROSPECCAO)[number]['id']

export function eEstagioDeProspeccao(valor: unknown): valor is EstagioDeProspeccao {
  return ESTAGIOS_DE_PROSPECCAO.some((e) => e.id === valor)
}

/** No CRM só o envio ao CRM define: a pessoa não arrasta um cartão para lá. */
export const ESTAGIO_SO_DO_ENVIO_AO_CRM: EstagioDeProspeccao = 'no_crm'

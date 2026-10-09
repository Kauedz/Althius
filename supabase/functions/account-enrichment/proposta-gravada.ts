// record_proposed_contact devolve uma linha por gravação. Sem linha, nada foi gravado: é falha, e falha não conta
// nem cobra. `created` é "pessoa nova para a Conta"; só true vale como nova.
export function propostaGravada(data: unknown): { id: string; created: boolean } {
  const [row] = (Array.isArray(data) ? data : []) as Array<{ id?: string | null; created?: boolean | null }>
  if (!row?.id) throw new Error('record_proposed_contact não retornou dados')
  return { id: row.id, created: row.created === true }
}

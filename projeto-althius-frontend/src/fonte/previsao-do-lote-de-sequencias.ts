/** Prévia da criação em lote: quais Contas-alvo nascem Sequência e quais ficam de fora. */

export type MotivoForaDoLote = 'sem_email' | 'suprimida' | 'sequencia_ativa' | 'outro_responsavel'

export type DesfechoDoLote =
  | 'created'
  | 'sequence_in_progress'
  | 'not_responsible'
  | 'no_eligible_contact'
  | 'not_found'

export type KindDaSupressao = 'email' | 'domain'

export interface SupressaoDoWorkspace {
  kind: KindDaSupressao
  value: string
}

export interface ContaDoLote {
  id: string
  nome: string
  sobMinhaResponsabilidade?: boolean
}

export interface ContatoDoLote {
  id: string
  contaId: string
  email?: string
  /** Na Demonstração o endereço pode não vir; o canal de e-mail já conta como elegível. */
  canais?: { email?: boolean }
}

export interface SequenciaDoLote {
  contaId: string
  status: string
  participantesIds: string[]
}

export interface ContaNaPrevia {
  id: string
  nome: string
}

export interface ContaForaDaPrevia extends ContaNaPrevia {
  motivo: MotivoForaDoLote
}

const ROTULO_DO_MOTIVO_FORA: Record<MotivoForaDoLote, string> = {
  sem_email: 'Sem e-mail',
  suprimida: 'Suprimida',
  sequencia_ativa: 'Já em Sequência ativa',
  outro_responsavel: 'Outro Vendedor responsável',
}

const ROTULO_DO_DESFECHO: Record<DesfechoDoLote, string> = {
  created: 'Sequência criada',
  sequence_in_progress: 'Já tem Sequência em andamento',
  not_responsible: 'Outro Vendedor responsável',
  no_eligible_contact: 'Sem Contato elegível',
  not_found: 'Conta-alvo não encontrada',
}

export function rotuloDoMotivoForaDoLote(motivo: MotivoForaDoLote): string {
  return ROTULO_DO_MOTIVO_FORA[motivo]
}

export function rotuloDoDesfechoDoLote(desfecho: string): string {
  return ROTULO_DO_DESFECHO[desfecho as DesfechoDoLote] ?? desfecho
}

export function emailSuprimido(email: string, supressoes: SupressaoDoWorkspace[]): boolean {
  const valor = email.trim().toLowerCase()
  const dominio = valor.split('@')[1]
  return supressoes.some(
    (s) =>
      (s.kind === 'email' && s.value.trim().toLowerCase() === valor) ||
      (s.kind === 'domain' && s.value.trim().toLowerCase() === dominio),
  )
}

export function classificarContasDoLote({
  contas,
  contatos,
  sequencias,
  supressoes,
}: {
  contas: ContaDoLote[]
  contatos: ContatoDoLote[]
  sequencias: SequenciaDoLote[]
  supressoes: SupressaoDoWorkspace[]
}): { criar: ContaNaPrevia[]; fora: ContaForaDaPrevia[] } {
  const criar: ContaNaPrevia[] = []
  const fora: ContaForaDaPrevia[] = []

  for (const conta of contas) {
    if (conta.sobMinhaResponsabilidade === false) {
      fora.push({ id: conta.id, nome: conta.nome, motivo: 'outro_responsavel' })
      continue
    }
    if (sequencias.some((s) => s.contaId === conta.id && s.status !== 'encerrada')) {
      fora.push({ id: conta.id, nome: conta.nome, motivo: 'sequencia_ativa' })
      continue
    }
    const daConta = contatos.filter((c) => c.contaId === conta.id)
    const comEmail = daConta.filter((c) => Boolean(c.email?.trim()) || c.canais?.email === true)
    if (comEmail.length === 0) {
      fora.push({ id: conta.id, nome: conta.nome, motivo: 'sem_email' })
      continue
    }
    const livres = comEmail.filter((c) => !emailSuprimido(c.email ?? '', supressoes))
    if (livres.length === 0) {
      fora.push({ id: conta.id, nome: conta.nome, motivo: 'suprimida' })
      continue
    }
    criar.push({ id: conta.id, nome: conta.nome })
  }

  return { criar, fora }
}

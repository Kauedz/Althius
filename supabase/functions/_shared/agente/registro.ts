// O registro de ferramentas do agente único (Fase 3). Cada ferramenta embrulha o que o Althius já faz (o ICP, a busca
// de empresas, o aceite, o comitê, a Receita) e declara quanto custa e quando precisa da pessoa:
//   - `livre`: roda sem perguntar (ler, aceitar ou descartar o que a pessoa pediu);
//   - `teto`: roda enquanto o gasto da conversa mais o custo cabe no teto; passou, pergunta;
//   - `sempre`: toda vez pergunta (mensagem a prospect, ativar um Sinal).
// O portão é puro: o orquestrador o chama antes de executar.

export type Aprovacao = 'livre' | 'teto' | 'sempre'
export type MotivoConfirmacao = 'teto' | 'prospect'

/** Um cartão que a tela desenha abaixo do passo. `tipo` escolhe o desenho. */
export interface Cartao {
  tipo: 'empresas' | 'pessoas' | 'receita' | 'icp' | 'criterios' | 'sinal' | 'sequencia' | 'confirmacao' | 'aviso'
  [chave: string]: unknown
}

export interface ResultadoDaFerramenta {
  /** O que o modelo lê do resultado (curto, sem dado inventado). */
  resumo: string
  cartoes: Cartao[]
  /** Créditos que o passo gastou de fato. */
  custo: number
  /** Uma tarefa longa que segue em segundo plano (o passo fica `rodando`). */
  pendente?: { externo: Record<string, unknown> }
}

/** O que a ferramenta recebe para agir em nome de quem pede. O JWT fica só na memória. */
export interface ContextoDaFerramenta {
  workspaceId: string
  userId: string
  passoId: string
  authorization: string
  apikey: string
}

export interface Ferramenta {
  nome: string
  descricao: string
  /** Os campos da entrada, para o modelo (nome: descrição). */
  esquema: Record<string, string>
  aprovacao: Aprovacao
  titulo(entrada: Record<string, unknown>): string
  /** Créditos que a ferramenta pode gastar com esta entrada (o pior caso). */
  cotar(ctx: ContextoDaFerramenta, entrada: Record<string, unknown>): Promise<number>
  executar(ctx: ContextoDaFerramenta, entrada: Record<string, unknown>): Promise<ResultadoDaFerramenta>
  /** Atualiza uma tarefa longa (`pendente`): devolve null enquanto ela não acabou. */
  atualizar?(ctx: ContextoDaFerramenta, externo: Record<string, unknown>): Promise<ResultadoDaFerramenta | null>
}

export type Portao = { estado: 'rodar' } | { estado: 'aguardar'; motivo: MotivoConfirmacao }

export function portao(ferramenta: Pick<Ferramenta, 'aprovacao'>, custo: number, gastos: number, teto: number): Portao {
  if (ferramenta.aprovacao === 'sempre') return { estado: 'aguardar', motivo: 'prospect' }
  if (ferramenta.aprovacao === 'teto' && custo > 0 && gastos + custo > teto) return { estado: 'aguardar', motivo: 'teto' }
  return { estado: 'rodar' }
}

export function formatarCreditos(n: number): string {
  const v = Math.round(n * 100) / 100
  return `${v.toLocaleString('pt-BR')} ${v === 1 ? 'crédito' : 'créditos'}`
}

/** O cartão de confirmação: o que vai acontecer, quanto custa e por que o agente pergunta. */
export function cartaoDeConfirmacao(a: {
  titulo: string
  custo: number
  motivo: MotivoConfirmacao
  gastos: number
  teto: number
}): Cartao {
  const texto = a.motivo === 'teto'
    ? `${a.titulo} custa até ${formatarCreditos(a.custo)}. Esta conversa já gastou ${formatarCreditos(a.gastos)} de ${formatarCreditos(a.teto)}; confirmar passa do teto.`
    : `${a.titulo} fala com um prospect ou liga algo que fala por você. Nada sai sem a sua confirmação.`
  return { tipo: 'confirmacao', titulo: a.titulo, custo: a.custo, motivo: a.motivo, gastos: a.gastos, teto: a.teto, texto }
}

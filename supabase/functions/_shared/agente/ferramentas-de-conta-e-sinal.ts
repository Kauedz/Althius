// Ferramentas do agente sobre o que a TRILHA C publicou (Fases 5 e 6): explicar a Aderência de uma Descoberta, revelar o
// e-mail ou o telefone de um Contato e ligar um Sinal. Todas com a sessão de quem pede; o banco confere a Participação.
//   - explicar_aderencia: livre e grátis (account-fit-explanation; a nota é sempre a do banco).
//   - revelar_email: teto, até 2 créditos; o banco só debita quando grava um e-mail novo.
//   - revelar_telefone: teto, até 5 créditos (decisão de 28/10/2026); o banco só debita quando grava um telefone novo.
//   - ativar_sinal: sempre pergunta. Confere a prévia da Rodada (quote_signal_run) e não liga com bloqueio. As Rodadas
//     cobram depois, dentro do Teto do Sinal; o passo em si não gasta crédito da conversa.
import type { ServicosDoAgente } from './ferramentas.ts'
import { type Ferramenta, formatarCreditos } from './registro.ts'

export const CREDITOS_DO_EMAIL = 2
export const CREDITOS_DO_TELEFONE = 5

const UUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
function uuid(v: unknown, campo: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!UUID.test(s)) throw new Error(`Informe o id de ${campo}.`)
  return s
}
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const NIVEL: Record<string, string> = { alto: 'alta', medio: 'média', baixo: 'baixa' }

const BLOQUEIO: Record<string, string> = {
  sem_permissao: 'Você não pode mudar este Sinal.',
  sem_fonte: 'Este Sinal ainda não tem fonte disponível.',
  sem_contas: 'Este Sinal não tem Contas para olhar.',
  contrato_inativo: 'O contrato do Workspace não está ativo.',
  ja_na_fila: 'Já há uma Rodada deste Sinal na fila.',
  intervalo_minimo: 'A última Rodada foi há pouco; espere o intervalo mínimo.',
  teto_diario: 'O Teto diário do Sinal já foi atingido.',
  sem_creditos: 'Não há créditos suficientes para a próxima Rodada.',
  limite_do_mes: 'O limite do mês do Workspace já foi atingido.',
  limite_do_participante: 'O seu limite do mês já foi atingido.',
}

type Monitor = { id: string; name: string; state: string }
const linhas = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v ? [v as T] : [])

export function ferramentasDeContaESinal(s: ServicosDoAgente): Ferramenta[] {
  const monitores = async (ctx: Parameters<Ferramenta['executar']>[0]) =>
    linhas<Monitor>(await s.rpc(ctx, 'list_signal_monitors', { p_workspace_id: ctx.workspaceId }))

  const explicar: Ferramenta = {
    nome: 'explicar_aderencia',
    descricao: 'Explica por que uma empresa descoberta tem a Aderência que tem (o que bate e o que não bate com o ICP). Não muda a nota.',
    esquema: { descobertaId: 'o id da empresa descoberta' },
    aprovacao: 'livre',
    titulo: () => 'Explicar a Aderência da empresa',
    cotar: () => Promise.resolve(0),
    async executar(ctx, e) {
      const id = uuid(e.descobertaId, 'a empresa descoberta')
      const r = await s.funcao(ctx, 'account-fit-explanation', { discoveredAccountId: id })
      const explicacao = texto(r.explicacao)
      if (!explicacao) throw new Error('Não deu para explicar a Aderência agora.')
      const nivel = NIVEL[texto(r.nivel)]
      const nota = typeof r.pontuacao === 'number' ? ` (${r.pontuacao})` : ''
      const frase = nivel ? `Aderência ${nivel}${nota}: ${explicacao}` : explicacao
      return { resumo: frase, cartoes: [{ tipo: 'aviso', texto: frase, descobertaId: id }], custo: 0 }
    },
  }

  // Os mesmos passos para os dois canais: a função cota, reserva e só acerta o débito quando grava um dado novo.
  const revelarCanal = (canal: 'email' | 'telefone'): Ferramenta => {
    const email = canal === 'email'
    const creditos = email ? CREDITOS_DO_EMAIL : CREDITOS_DO_TELEFONE
    const dado = email ? 'o e-mail' : 'o telefone'
    return {
      nome: email ? 'revelar_email' : 'revelar_telefone',
      descricao: email
        ? `Procura o e-mail profissional de um Contato (até ${creditos} créditos, só se achar um novo). Não envia nada.`
        : `Procura o telefone de um Contato (até ${creditos} créditos, só se achar um novo). Não liga nem manda mensagem.`,
      esquema: { contatoId: 'o id do Contato' },
      aprovacao: 'teto',
      titulo: () => (email ? 'Revelar o e-mail do Contato' : 'Revelar o telefone do Contato'),
      cotar: () => Promise.resolve(creditos),
      async executar(ctx, e) {
        const id = uuid(e.contatoId, 'o Contato')
        const r = await s.funcao(ctx, 'account-enrichment', { action: 'revelar-contato', workspaceId: ctx.workspaceId, contactId: id, canal })
        const custo = Math.max(0, Number(r.creditosDebitados) || 0)
        const valor = texto(r.valor)
        const frase = !valor
          ? `Não achei ${dado} deste Contato; nada foi cobrado.`
          : r.jaExistia === true || custo === 0
          ? `O Contato já tinha ${dado} ${valor}; nada foi cobrado.`
          : `${email ? 'E-mail' : 'Telefone'} encontrado: ${valor} (${formatarCreditos(custo)}).`
        return { resumo: frase, cartoes: [{ tipo: 'aviso', texto: frase }], custo }
      },
    }
  }

  const listar: Ferramenta = {
    nome: 'listar_sinais',
    descricao: 'Lista os Sinais do Workspace com nome, estado e id.',
    esquema: {},
    aprovacao: 'livre',
    titulo: () => 'Ver os Sinais do Workspace',
    cotar: () => Promise.resolve(0),
    async executar(ctx) {
      const ms = await monitores(ctx)
      const resumo = ms.length
        ? `Sinais: ${ms.slice(0, 20).map((m) => `${m.name} [id ${m.id}, ${m.state}]`).join('; ')}`
        : 'O Workspace ainda não tem Sinal.'
      return { resumo, cartoes: [], custo: 0 }
    },
  }

  const ativar: Ferramenta = {
    nome: 'ativar_sinal',
    descricao: 'Liga um Sinal do Workspace para rodar na Agenda dele. Sempre pede a confirmação da pessoa. Use o id de listar_sinais.',
    esquema: { sinalId: 'o id do Sinal' },
    aprovacao: 'sempre',
    explicacao: 'Liga o Sinal na Agenda dele; cada Rodada cobra dentro do Teto do Sinal.',
    titulo: () => 'Ativar o Sinal',
    cotar: () => Promise.resolve(0),
    async executar(ctx, e) {
      const id = uuid(e.sinalId, 'o Sinal')
      const m = (await monitores(ctx)).find((x) => x.id === id)
      if (!m) throw new Error('Não encontrei este Sinal no Workspace.')
      if (m.state === 'ativo') {
        const frase = `O Sinal "${m.name}" já está ativo.`
        return { resumo: frase, cartoes: [{ tipo: 'aviso', texto: frase }], custo: 0 }
      }
      const [previa] = linhas<{ ate_creditos?: number | string; bloqueio?: string | null }>(
        await s.rpc(ctx, 'quote_signal_run', { p_workspace_id: ctx.workspaceId, p_monitor_id: id }),
      )
      if (previa?.bloqueio) throw new Error(BLOQUEIO[previa.bloqueio] ?? 'O Sinal não pode ser ativado agora.')
      await s.rpc(ctx, 'set_signal_monitor_state', { p_id: id, p_state: 'ativo' })
      const ate = Number(previa?.ate_creditos)
      const frase = `Sinal "${m.name}" ativado.` + (Number.isFinite(ate) && ate > 0 ? ` Cada Rodada custa até ${formatarCreditos(ate)}, dentro do Teto do Sinal.` : '')
      return { resumo: frase, cartoes: [{ tipo: 'aviso', texto: frase }], custo: 0 }
    },
  }

  return [explicar, revelarCanal('email'), revelarCanal('telefone'), listar, ativar]
}

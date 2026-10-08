// Regras dos Avisos do Workspace: a quem cada aviso se destina, pela Participação e pelo papel, e o que ele diz.
// Um aviso só informa; a capacidade de decidir continua nas operações.
import { categoriaDa, podeDecidir, ROTULO_DA_DECISAO } from './regras'
import { DOCUMENTOS_DA_MEMORIA, efeitoDaDecisao, frasesDo } from './regras-memoria'
import type {
  Aprovacao,
  AprovacaoDeAcao,
  Autor,
  AvisoDoWorkspace,
  ContaDeUsuarioId,
  Decisao,
  ItemDeAtividade,
  Papel,
  ParticipacaoAtiva,
  RevisaoDecidida,
} from './tipos'

/** Um aviso ainda sem identificador, que a fonte dá ao emitir. */
export type NovoAviso = Omit<AvisoDoWorkspace, 'id'>

/** O que cada papel recebe, na ordem em que Preferências mostra; segue as regras de destinatário abaixo. */
export function avisosQueRecebe(papel: Papel | null): string[] {
  return [
    ...(papel && podeDecidir('revisao-da-memoria', papel) ? ['Revisões do ICP e das Personas aguardando sua decisão'] : []),
    'Outras Aprovações aguardando decisão no Workspace',
    'O resultado das Aprovações que você pediu',
    'Falhas de Execução nos seus pedidos aos Agentes',
  ]
}

/** Só quem ainda participa do Workspace recebe os avisos dele. */
function ativas(contaIds: ContaDeUsuarioId[], participacoes: ParticipacaoAtiva[]): ContaDeUsuarioId[] {
  return contaIds.filter((contaId) => participacoes.some((p) => p.contaId === contaId))
}

/** Quem pode decidir a Aprovação, pela categoria dela e pelo papel de cada participante ativo, na Demonstração. */
function quemDecide(aprovacao: Aprovacao, participacoes: ParticipacaoAtiva[]): ContaDeUsuarioId[] {
  const categoria = categoriaDa(aprovacao)
  return participacoes.filter((p) => podeDecidir(categoria, p.papel, 'demonstracao')).map((p) => p.contaId)
}

/** Uma Aprovação acabou de entrar na fila: avisa quem pode decidi-la. */
export function avisoDeAprovacaoSolicitada(
  aprovacao: Aprovacao,
  nomeDoAgente: string,
  participacoes: ParticipacaoAtiva[],
): NovoAviso {
  const destinatarios = quemDecide(aprovacao, participacoes)
  if (!aprovacao.revisao) {
    return {
      tipo: 'aprovacao-solicitada',
      destinatarios,
      titulo: `Aprovação pendente do ${nomeDoAgente}`,
      texto: `${aprovacao.acao}. Decida em Aprovações.`,
      para: '/aprovacoes',
    }
  }
  const { documento, solicitante } = aprovacao.revisao
  const { nome, comArtigo } = DOCUMENTOS_DA_MEMORIA[documento]
  const proposta = frasesDo(documento).concordar(`um novo ${nome}`, `novas ${nome}`)
  return {
    tipo: 'aprovacao-solicitada',
    destinatarios,
    titulo: `Revisão ${comArtigo} aguardando Aprovação`,
    texto: `O ${nomeDoAgente} propôs ${proposta} a pedido de ${solicitante.nome}. Decida em Aprovações.`,
    para: '/aprovacoes',
  }
}

/**
 * Uma Aprovação das demais categorias foi decidida: avisa quem a pediu ao Agente na Althius, se ainda participa do
 * Workspace. Sem quem a tenha pedido (ex.: vinda de um Canal), não há a quem avisar.
 */
export function avisoDeAprovacaoDecidida(
  aprovacao: AprovacaoDeAcao,
  decisao: Decisao,
  { solicitanteId, decididaPor, onde }: { solicitanteId?: ContaDeUsuarioId; decididaPor: Autor; onde: string },
  participacoes: ParticipacaoAtiva[],
): NovoAviso {
  const efeito = decisao === 'aprovada' ? 'Ação executada.' : 'Nada foi alterado.'
  return {
    tipo: 'aprovacao-decidida',
    destinatarios: ativas(solicitanteId ? [solicitanteId] : [], participacoes),
    titulo: `${ROTULO_DA_DECISAO[decisao]}: ${aprovacao.acao}`,
    texto: `Decidida por ${decididaPor.nome} ${onde}. ${efeito}`,
    para: aprovacao.sequenciaId ? `/sequencias/${aprovacao.sequenciaId}` : '/aprovacoes',
  }
}

/** Uma Revisão da Memória do Workspace foi decidida: avisa quem a pediu, se ainda participa do Workspace. */
export function avisoDeRevisaoDecidida(
  decisao: Decisao,
  { documento, solicitante, decididaPor }: RevisaoDecidida,
  participacoes: ParticipacaoAtiva[],
): NovoAviso {
  const rotulo = ROTULO_DA_DECISAO[decisao]
  return {
    tipo: 'aprovacao-decidida',
    destinatarios: ativas([solicitante.contaId], participacoes),
    titulo: `Sua revisão ${DOCUMENTOS_DA_MEMORIA[documento].comArtigo} foi ${rotulo.toLowerCase()}`,
    texto: `${rotulo} por ${decididaPor.nome}. ${efeitoDaDecisao(documento, decisao)}`,
    para: `/configuracoes/memoria/${documento}`,
  }
}

/**
 * Uma Execução ou ação falhou e nada mudou (`falhou` na Atividade): avisa quem pediu o trabalho, se ainda participa do
 * Workspace. O aviso leva ao que a Atividade indica, ou à Atividade do Agente.
 */
export function avisoDeFalha(
  item: ItemDeAtividade,
  nomeDoAgente: string,
  quemPediu: ContaDeUsuarioId,
  participacoes: ParticipacaoAtiva[],
): NovoAviso {
  return {
    tipo: 'falha',
    destinatarios: ativas([quemPediu], participacoes),
    titulo: `Falha na Execução do ${nomeDoAgente}`,
    texto: `${item.descricao}. ${item.resultado}`,
    para: item.link?.para ?? `/agentes/${item.agenteId}/atividade`,
  }
}

// Memória do Workspace da fonte simulada: o ICP vigente e as revisões propostas pelo Scopus, que entram na fila
// de Aprovações. Persistem juntos, associados ao Workspace, numa gravação só: ou tudo muda, ou nada muda.
import * as demo from './dados-demo'
import {
  aplicarMudancas,
  dependentesDoIcp,
  DOCUMENTOS_DA_MEMORIA,
  ERRO_REVISAO_JA_DECIDIDA,
  ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO,
} from './regras-memoria'
import { revisoesDoIcp } from './roteiros'
import { dataDeHoje } from './formatar-data'
import type { ArmazenamentoDemonstrativo, criarParticipacoesSimuladas } from './simulada-participacoes'
import type {
  Aprovacao,
  Autor,
  Decisao,
  DocumentoDaMemoria,
  IcpVigente,
  MemoriaDoWorkspace,
  SecaoDoDocumento,
} from './tipos'

const CHAVE_DA_MEMORIA = `althius:memoria:${demo.WORKSPACE_ATUAL}`

/** A gravação no armazenamento falhou: nada foi alterado. */
export class FalhaAoGravar extends Error {}

interface EstadoDaMemoria {
  icp: IcpVigente
  /** As Aprovações de revisão, pendentes ou decididas: são registros da fila, não versões do documento. */
  revisoes: Aprovacao[]
}

const ehTexto = (valor: unknown): valor is string => typeof valor === 'string'
const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null
const ehAutor = (valor: unknown): valor is Autor => ehObjeto(valor) && ehTexto(valor.contaId) && ehTexto(valor.nome)
const ehSecoes = (valor: unknown): valor is SecaoDoDocumento[] =>
  Array.isArray(valor) && valor.every((s) => ehObjeto(s) && ehTexto(s.titulo) && ehTexto(s.texto))

function ehRevisao(valor: unknown): valor is Aprovacao {
  if (!ehObjeto(valor) || !ehTexto(valor.id) || !['pendente', 'aprovada', 'rejeitada'].includes(valor.estado as string)) return false
  const revisao = valor.revisao
  return (
    ehObjeto(revisao) &&
    revisao.documento === 'icp' &&
    ehTexto(revisao.pedido) &&
    ehTexto(revisao.pedidaEm) &&
    ehAutor(revisao.solicitante) &&
    ehSecoes(revisao.proposto) &&
    ehSecoes(revisao.vigenteNoPedido) &&
    (revisao.decididaPor === undefined || ehAutor(revisao.decididaPor))
  )
}

/** Lê a Memória salva; se algo não for reconhecido, volta aos dados de exemplo. */
function memoriaSalva(armazenamento: ArmazenamentoDemonstrativo | null): EstadoDaMemoria | null {
  try {
    const bruto = armazenamento?.getItem(CHAVE_DA_MEMORIA)
    if (!bruto) return null
    const lido: unknown = JSON.parse(bruto)
    if (!ehObjeto(lido) || !ehObjeto(lido.icp) || !Array.isArray(lido.revisoes)) return null
    const { icp, revisoes } = lido
    if (!ehSecoes(icp.secoes) || !ehTexto(icp.aprovadoEm) || !ehAutor(icp.aprovadoPor) || !revisoes.every(ehRevisao)) return null
    return { icp: icp as unknown as IcpVigente, revisoes }
  } catch {
    return null
  }
}

/**
 * A Memória do Workspace da demonstração. Qualquer participante ativo pede revisão; só um Administrador ativo
 * decide, validado aqui e não só na interface. As operações são síncronas e lançam um erro com a mensagem para
 * o usuário.
 */
export function criarMemoriaSimulada({
  armazenamento,
  participacoes,
}: {
  armazenamento: ArmazenamentoDemonstrativo | null
  participacoes: ReturnType<typeof criarParticipacoesSimuladas>
}) {
  let estado: EstadoDaMemoria = memoriaSalva(armazenamento) ?? { icp: structuredClone(demo.icpInicial), revisoes: [] }

  /** Grava o estado novo inteiro e só então o adota: uma falha deixa o anterior valendo em todas as áreas. */
  function adotar(novo: EstadoDaMemoria) {
    try {
      armazenamento?.setItem(CHAVE_DA_MEMORIA, JSON.stringify(novo))
    } catch {
      throw new FalhaAoGravar('Não foi possível salvar a Memória do Workspace.')
    }
    estado = novo
  }

  function autorDaSessao(): Autor {
    const { id, nome } = participacoes.usuario()
    return { contaId: id, nome }
  }

  function revisao(aprovacaoId: string): Aprovacao {
    const encontrada = estado.revisoes.find((r) => r.id === aprovacaoId)
    if (!encontrada) throw new Error(`Não encontrado: ${aprovacaoId}`)
    return encontrada
  }

  return {
    memoria: (): MemoriaDoWorkspace => ({ icp: estado.icp }),
    revisoes: () => estado.revisoes,
    ehRevisao: (aprovacaoId: string) => estado.revisoes.some((r) => r.id === aprovacaoId),

    /** A proposta do Agente fica pendente: o documento vigente e o que depende dele não mudam. */
    solicitar(documento: DocumentoDaMemoria, pedido: string): Aprovacao {
      const { nome, comArtigo, titulo, agenteId, agente } = DOCUMENTOS_DA_MEMORIA[documento]
      if (participacoes.papelDaSessao() === null) throw new Error('Você não participa deste Workspace.')
      const texto = pedido.trim()
      if (!texto) throw new Error(`Conte ao ${agente} o que deveria mudar.`)
      const doDocumento = estado.revisoes.filter((r) => r.revisao?.documento === documento)
      if (doDocumento.some((r) => r.estado === 'pendente')) {
        throw new Error(`Já existe uma proposta ${comArtigo} pendente. Aguarde a decisão de um Administrador.`)
      }
      const roteiro = revisoesDoIcp[doDocumento.length % revisoesDoIcp.length]
      const proposto = aplicarMudancas(estado.icp.secoes, roteiro.mudancas)
      const quantidade = dependentesDoIcp(proposto).length
      const aprovacao: Aprovacao = {
        id: `revisao-${documento}-${doDocumento.length + 1}`,
        agenteId,
        acao: titulo,
        impacto: `Substitui o ${nome} vigente e atualiza as ${quantidade} configurações que dependem dele, sem novas Aprovações por módulo.`,
        justificativa: roteiro.resposta,
        origem: 'althius',
        gatilho: 'conversa',
        estado: 'pendente',
        revisao: {
          documento,
          pedido: texto,
          solicitante: autorDaSessao(),
          pedidaEm: dataDeHoje(),
          proposto,
          vigenteNoPedido: estado.icp.secoes,
        },
      }
      adotar({ ...estado, revisoes: [aprovacao, ...estado.revisoes] })
      return aprovacao
    },

    /**
     * Só um Administrador ativo decide; basta um, e pode ser quem pediu. Aprovar substitui o documento vigente
     * e a decisão na mesma gravação; recusar mantém o documento.
     */
    decidir(aprovacaoId: string, decisao: Decisao): Aprovacao {
      const papel = participacoes.papelDaSessao()
      if (papel === null) throw new Error('Você não participa deste Workspace.')
      if (papel !== 'administrador') throw new Error(ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO)
      const pendente = revisao(aprovacaoId)
      if (pendente.estado !== 'pendente' || !pendente.revisao) throw new Error(ERRO_REVISAO_JA_DECIDIDA)
      const decididaPor = autorDaSessao()
      const decidida: Aprovacao = { ...pendente, estado: decisao, revisao: { ...pendente.revisao, decididaPor } }
      adotar({
        icp:
          decisao === 'aprovada'
            ? { secoes: pendente.revisao.proposto, aprovadoEm: dataDeHoje(), aprovadoPor: decididaPor }
            : estado.icp,
        revisoes: estado.revisoes.map((r) => (r.id === aprovacaoId ? decidida : r)),
      })
      return decidida
    },
  }
}

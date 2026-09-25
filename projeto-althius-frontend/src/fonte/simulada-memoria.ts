// Memória do Workspace da fonte simulada: o ICP e as Personas vigentes e as revisões propostas pelo Scopus e pelo
// Ethos, que entram na fila de Aprovações. Persistem juntos, associados ao Workspace, numa gravação só: ou tudo muda,
// ou nada muda.
import * as demo from './dados-demo'
import { podeDecidir } from './regras'
import {
  aplicarMudancas,
  dependentesDe,
  DOCUMENTOS_DA_MEMORIA,
  ehDocumentoDaMemoria,
  ERRO_REVISAO_JA_DECIDIDA,
  ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO,
  frasesDo,
} from './regras-memoria'
import { revisoesDaMemoria } from './roteiros'
import { diaIso } from './formatar-data'
import type { ArmazenamentoDemonstrativo, criarParticipacoesSimuladas } from './simulada-participacoes'
import type {
  AprovacaoDeRevisao,
  AprovacaoDeRevisaoDecidida,
  AprovacaoDeRevisaoPendente,
  Autor,
  Decisao,
  DocumentoDaMemoria,
  DocumentoVigente,
  MemoriaDoWorkspace,
  SecaoDoDocumento,
} from './tipos'

const CHAVE_DA_MEMORIA = `althius:memoria:${demo.WORKSPACE_ATUAL}`

/** A gravação no armazenamento falhou: nada foi alterado. */
export class FalhaAoGravar extends Error {}

interface EstadoDaMemoria extends MemoriaDoWorkspace {
  /** As Aprovações de revisão, pendentes ou decididas: são registros da fila; só a pendente guarda conteúdo. */
  revisoes: AprovacaoDeRevisao[]
}

const ehTexto = (valor: unknown): valor is string => typeof valor === 'string'
const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null
const ehAutor = (valor: unknown): valor is Autor => ehObjeto(valor) && ehTexto(valor.contaId) && ehTexto(valor.nome)
const ehSecoes = (valor: unknown): valor is SecaoDoDocumento[] =>
  Array.isArray(valor) && valor.every((s) => ehObjeto(s) && ehTexto(s.titulo) && ehTexto(s.texto))
const ehDocumento = (valor: unknown): valor is DocumentoVigente =>
  ehObjeto(valor) && ehSecoes(valor.secoes) && ehTexto(valor.aprovadoEm) && ehAutor(valor.aprovadoPor)

/**
 * Lê uma revisão salva: pendente, com o conteúdo proposto; decidida, com quem decidiu. Uma decidida salva com o
 * conteúdo, como antes, volta sem ele: a fila não guarda o histórico dos documentos.
 */
function revisaoSalva(valor: unknown): AprovacaoDeRevisao | null {
  if (!ehObjeto(valor) || !ehTexto(valor.id) || !ehObjeto(valor.revisao)) return null
  const { documento, pedido, pedidaEm, solicitante, proposto, vigenteNoPedido, decididaPor } = valor.revisao
  if (!ehDocumentoDaMemoria(documento) || !ehTexto(pedido) || !ehTexto(pedidaEm) || !ehAutor(solicitante)) return null
  const lida = valor as unknown as AprovacaoDeRevisao
  const base = { documento, pedido, pedidaEm, solicitante }
  if (valor.estado === 'pendente') {
    if (!ehSecoes(proposto) || !ehSecoes(vigenteNoPedido)) return null
    return { ...lida, estado: 'pendente', revisao: { ...base, proposto, vigenteNoPedido } }
  }
  if ((valor.estado !== 'aprovada' && valor.estado !== 'rejeitada') || !ehAutor(decididaPor)) return null
  return { ...lida, estado: valor.estado, revisao: { ...base, decididaPor } }
}

/**
 * Lê a Memória salva; se algo não for reconhecido, volta aos dados de exemplo. Uma Memória gravada antes das Personas
 * (só o ICP e as revisões dele) mantém o ICP aprovado e começa pelas Personas de exemplo.
 */
function memoriaSalva(armazenamento: ArmazenamentoDemonstrativo | null): EstadoDaMemoria | null {
  try {
    const bruto = armazenamento?.getItem(CHAVE_DA_MEMORIA)
    if (!bruto) return null
    const lido: unknown = JSON.parse(bruto)
    if (!ehObjeto(lido) || !ehDocumento(lido.icp)) return null
    const personas = lido.personas === undefined ? structuredClone(demo.personasIniciais) : lido.personas
    if (!ehDocumento(personas)) return null
    if (!Array.isArray(lido.revisoes)) return null
    const revisoes = lido.revisoes.map(revisaoSalva)
    if (revisoes.some((r) => r === null)) return null
    return { icp: lido.icp, personas, revisoes: revisoes as AprovacaoDeRevisao[] }
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
  hoje,
}: {
  armazenamento: ArmazenamentoDemonstrativo | null
  participacoes: ReturnType<typeof criarParticipacoesSimuladas>
  /** O dia de referência da demonstração, o mesmo do Plano: dá a data dos pedidos e das aprovações. */
  hoje: Date
}) {
  let estado: EstadoDaMemoria = memoriaSalva(armazenamento) ?? {
    icp: structuredClone(demo.icpInicial),
    personas: structuredClone(demo.personasIniciais),
    revisoes: [],
  }

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

  function revisao(aprovacaoId: string): AprovacaoDeRevisao {
    const encontrada = estado.revisoes.find((r) => r.id === aprovacaoId)
    if (!encontrada) throw new Error(`Não encontrado: ${aprovacaoId}`)
    return encontrada
  }

  return {
    memoria: (): MemoriaDoWorkspace => ({ icp: estado.icp, personas: estado.personas }),
    revisoes: () => estado.revisoes,
    ehRevisao: (aprovacaoId: string) => estado.revisoes.some((r) => r.id === aprovacaoId),

    /** A proposta do Agente fica pendente: o documento vigente e o que depende dele não mudam. */
    solicitar(documento: DocumentoDaMemoria, pedido: string): AprovacaoDeRevisaoPendente {
      const { comArtigo, titulo, agenteId, agente } = DOCUMENTOS_DA_MEMORIA[documento]
      const { oVigente, dele } = frasesDo(documento)
      participacoes.exigirParticipacao()
      const texto = pedido.trim()
      if (!texto) throw new Error(`Conte ao ${agente} o que deveria mudar.`)
      const doDocumento = estado.revisoes.filter((r) => r.revisao.documento === documento)
      if (doDocumento.some((r) => r.estado === 'pendente')) {
        throw new Error(`Já existe uma proposta ${comArtigo} pendente. Aguarde a decisão de um Administrador.`)
      }
      const roteiros = revisoesDaMemoria[documento]
      const roteiro = roteiros[doDocumento.length % roteiros.length]
      const proposto = aplicarMudancas(estado[documento].secoes, roteiro.mudancas)
      const quantidade = dependentesDe(documento, proposto).length
      const aprovacao: AprovacaoDeRevisaoPendente = {
        id: `revisao-${documento}-${doDocumento.length + 1}`,
        agenteId,
        acao: titulo,
        impacto: `Substitui ${oVigente} e atualiza as ${quantidade} configurações que dependem ${dele}, sem novas Aprovações por módulo.`,
        justificativa: roteiro.resposta,
        origem: 'althius',
        gatilho: 'conversa',
        estado: 'pendente',
        revisao: {
          documento,
          pedido: texto,
          solicitante: autorDaSessao(),
          pedidaEm: diaIso(hoje),
          proposto,
          vigenteNoPedido: estado[documento].secoes,
        },
      }
      adotar({ ...estado, revisoes: [aprovacao, ...estado.revisoes] })
      return aprovacao
    },

    /**
     * Só um Administrador ativo decide; basta um, e pode ser quem pediu. Aprovar substitui o documento da proposta
     * e a decisão na mesma gravação, sem tocar no outro documento; recusar mantém os dois. A revisão decidida deixa
     * de guardar o conteúdo: o aprovado passa a ser o vigente, e o anterior não fica em lugar nenhum.
     */
    decidir(aprovacaoId: string, decisao: Decisao): AprovacaoDeRevisaoDecidida {
      if (!podeDecidir('revisao-da-memoria', participacoes.exigirParticipacao())) {
        throw new Error(ERRO_SO_ADMINISTRADOR_DECIDE_REVISAO)
      }
      const pendente = revisao(aprovacaoId)
      if (pendente.estado !== 'pendente') throw new Error(ERRO_REVISAO_JA_DECIDIDA)
      const decididaPor = autorDaSessao()
      const { documento, pedido, pedidaEm, solicitante, proposto } = pendente.revisao
      const decidida: AprovacaoDeRevisaoDecidida = {
        ...pendente,
        estado: decisao,
        revisao: { documento, pedido, pedidaEm, solicitante, decididaPor },
      }
      const revisoes = estado.revisoes.map((r) => (r.id === aprovacaoId ? decidida : r))
      adotar(
        decisao === 'aprovada'
          ? { ...estado, [documento]: { secoes: proposto, aprovadoEm: diaIso(hoje), aprovadoPor: decididaPor }, revisoes }
          : { ...estado, revisoes },
      )
      return decidida
    },
  }
}

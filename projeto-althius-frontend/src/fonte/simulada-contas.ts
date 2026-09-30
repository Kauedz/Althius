import type {
  ContaAlvo,
  Contato,
  CustoDaBusca,
  DestinosReaisContato,
  FonteDeContas,
  Interacao,
  NovaInteracao,
  NovoSinal,
  Sinal,
} from './contas-tipos'
import { criarDadosIniciais } from './dados-contas-demo'
import { ESTAGIO_SO_DO_ENVIO_AO_CRM, type EstagioDeProspeccao } from './estagios-de-prospeccao'
import { estaValido, foiDisparado, parseDataDisparo } from './regras-sinais'
import type { FonteDeSequencias } from './sequencias-tipos'

export function normalizarWhatsApp(numero: string): string {
  const limpo = numero.trim()
  if (!limpo) return ''
  if (limpo.startsWith('+')) {
    const digitos = limpo.slice(1).replace(/\D/g, '')
    if (digitos.length < 8 || digitos.length > 15) {
      throw new Error('Número de WhatsApp inválido: deve conter entre 8 e 15 dígitos')
    }
    return `+${digitos}`
  }
  const digitos = limpo.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`
  }
  if (digitos.length >= 8 && digitos.length <= 15) {
    return `+${digitos}`
  }
  throw new Error('Número de WhatsApp inválido: deve conter entre 8 e 15 dígitos')
}

export function validarEmail(email: string): string {
  const limpo = email.trim().toLowerCase()
  if (!limpo) return ''
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regex.test(limpo)) {
    throw new Error('Formato de e-mail inválido')
  }
  return limpo
}

export interface OpcoesFonteDeContasSimulada {
  atrasoMs?: number
  hoje?: Date
  falha?: boolean
  vazia?: boolean
  fonteDeSequencias?: FonteDeSequencias
  armazenamento?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export interface FonteDeContasSimulada extends FonteDeContas {
  definirHoje(hoje: Date): void
  definirFalha(falha: boolean): void
  definirVazia(vazia: boolean): void
  vincularFonteDeSequencias(fonteDeSequencias: FonteDeSequencias): void
}

// As Contas Fit e Quentes da Demonstração se espalham pelo funil, para o kanban de exemplo mostrar todas as colunas.
const FUNIL_DE_EXEMPLO: EstagioDeProspeccao[] = ['quente', 'fit', 'em_abordagem', 'respondeu', 'reuniao', 'no_crm']

/**
 * O estágio de exemplo de uma Conta da Demonstração, para o kanban não nascer vazio: Não fit fica Descartada; as Fit
 * e Quentes se espalham pelo funil pela posição na lista; as outras Fit ficam em Fit, as Quentes em Quente e o resto
 * em Descoberta.
 */
function estagioDeExemplo(conta: ContaAlvo, posicao: number): EstagioDeProspeccao {
  if (conta.aderencia === 'nao-fit') return 'descartada'
  if (conta.aderencia === 'fit' && conta.quente) return FUNIL_DE_EXEMPLO[posicao % FUNIL_DE_EXEMPLO.length]
  if (conta.aderencia === 'fit') return 'fit'
  if (conta.quente) return 'quente'
  return 'descoberta'
}

function projetarConta(conta: ContaAlvo, todosSinais: Sinal[], refHoje: Date): ContaAlvo {
  const sinaisDaConta = todosSinais
    .filter((s) => s.contaId === conta.id)
    .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
  const sinaisDisparados = sinaisDaConta.filter((s) => foiDisparado(s, refHoje))
  const sinaisValidos = sinaisDisparados.filter((s) => estaValido(s, refHoje))
  return {
    ...conta,
    ultimoSinal: sinaisDisparados[0],
    totalSinaisValidos: sinaisValidos.length,
    quente: sinaisValidos.length > 0,
  }
}

/**
 * Cria a implementação simulada da FonteDeContas.
 * Aceita opções para testes (atraso, data de hoje fixa, falha e lista vazia).
 */
export function criarFonteDeContasSimulada(
  opcoes: OpcoesFonteDeContasSimulada = {},
): FonteDeContasSimulada {
  const CHAVE_STORAGE = 'althius:contatos-destinos:v1'
  let { atrasoMs = 0, hoje = new Date(), falha = false, vazia = false, fonteDeSequencias, armazenamento } = opcoes
  let fonteDeSequenciasVinculada: FonteDeSequencias | undefined = fonteDeSequencias
  const ouvintes = new Set<() => void>()

  let dados = vazia
    ? { contas: [], contatos: [], sinais: [], interacoes: [] }
    : criarDadosIniciais(hoje)

  if (armazenamento && !vazia) {
    try {
      const bruto = armazenamento.getItem(CHAVE_STORAGE)
      if (bruto) {
        const salvos: Record<string, DestinosReaisContato> = JSON.parse(bruto)
        dados.contatos = dados.contatos.map((c) => {
          const destinos = salvos[c.id]
          if (!destinos) return c
          return {
            ...c,
            email: destinos.email ?? c.email,
            whatsapp: destinos.whatsapp ?? c.whatsapp,
            linkedin: destinos.linkedin ?? c.linkedin,
            ehReal: true,
            canais: {
              email: Boolean(destinos.email ?? c.email),
              telefone: Boolean(destinos.whatsapp ?? c.whatsapp),
              linkedin: Boolean(destinos.linkedin ?? c.linkedin),
            },
          }
        })
      }
    } catch {
      // Ignora erro de leitura
    }
  }

  function salvarDestinos(): void {
    if (!armazenamento) return
    try {
      const mapa: Record<string, DestinosReaisContato> = {}
      for (const c of dados.contatos) {
        if (c.email || c.whatsapp || c.linkedin) {
          mapa[c.id] = {
            email: c.email,
            whatsapp: c.whatsapp,
            linkedin: c.linkedin,
          }
        }
      }
      armazenamento.setItem(CHAVE_STORAGE, JSON.stringify(mapa))
    } catch {
      // Ignora erro de gravacao
    }
  }

  // O kanban de exemplo da Demonstração: o estágio movido à mão fica aqui; sem ele, vem de estagioDeExemplo.
  const estagios = new Map<string, EstagioDeProspeccao>()
  // Quando foi a última busca de Sinais pedida em cada Conta (só na memória, como o resto da Demonstração).
  const buscasEm = new Map<string, string>()

  function notificar(): void {
    for (const ouvinte of ouvintes) {
      ouvinte()
    }
  }

  async function aguardar(): Promise<void> {
    if (atrasoMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, atrasoMs))
    }
    if (falha) {
      throw new Error('Falha ao carregar dados de contas')
    }
  }

  return {
    hoje() {
      return hoje
    },

    definirHoje(novaData: Date) {
      hoje = novaData
      notificar()
    },

    definirFalha(novaFalha: boolean) {
      falha = novaFalha
      notificar()
    },

    definirVazia(novaVazia: boolean) {
      vazia = novaVazia
      dados = vazia
        ? { contas: [], contatos: [], sinais: [], interacoes: [] }
        : criarDadosIniciais(hoje)
      notificar()
    },

    vincularFonteDeSequencias(fonte: FonteDeSequencias) {
      fonteDeSequenciasVinculada = fonte
    },

    observar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },

    async contas(): Promise<ContaAlvo[]> {
      await aguardar()
      return dados.contas.map((c, posicao) => {
        const conta = projetarConta(c, dados.sinais, hoje)
        return { ...conta, estagio: estagios.get(c.id) ?? estagioDeExemplo(conta, posicao) }
      })
    },

    async moverEstagio(contaId: string, estagio: EstagioDeProspeccao): Promise<void> {
      await aguardar()
      const conta = dados.contas.find((c) => c.id === contaId)
      if (!conta) throw new Error('Conta-alvo não encontrada.')
      if (conta.sobMinhaResponsabilidade === false) {
        throw new Error('Só o Vendedor responsável pode mover esta Conta no kanban.')
      }
      if (estagio === ESTAGIO_SO_DO_ENVIO_AO_CRM) throw new Error('Só o envio ao CRM leva a Conta para No CRM.')
      estagios.set(contaId, estagio)
      notificar()
    },

    // "Buscar Sinais de novo" na Demonstração: o custo é de exemplo (2 Monitoramentos, 1 crédito cada) e pedir só marca
    // a hora da última busca: nenhum Sinal novo é gravado, porque nada roda de verdade.
    async custoDeBuscarSinais(contaId: string): Promise<CustoDaBusca> {
      await aguardar()
      if (!dados.contas.some((c) => c.id === contaId)) throw new Error('Conta-alvo não encontrada.')
      return { monitoramentos: 2, creditos: 2, saldo: 120, emAndamento: false, terminouEm: buscasEm.get(contaId) ?? null, motivo: null }
    },

    async buscarSinaisDeNovo(contaId: string): Promise<void> {
      await aguardar()
      if (!dados.contas.some((c) => c.id === contaId)) throw new Error('Conta-alvo não encontrada.')
      buscasEm.set(contaId, hoje.toISOString())
      notificar()
    },

    async conta(id: string): Promise<ContaAlvo> {
      await aguardar()
      const encontrada = dados.contas.find((c) => c.id === id)
      if (!encontrada) {
        throw new Error(`Conta-alvo "${id}" não encontrada`)
      }
      return projetarConta(encontrada, dados.sinais, hoje)
    },

    async contatos(): Promise<Contato[]> {
      await aguardar()
      return [...dados.contatos]
    },

    async contatosDaConta(contaId: string): Promise<Contato[]> {
      await aguardar()
      return dados.contatos.filter((c) => c.contaId === contaId)
    },

    async sinais(): Promise<Sinal[]> {
      await aguardar()
      return dados.sinais
        .filter((s) => foiDisparado(s, hoje))
        .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    },

    async sinaisDaConta(contaId: string): Promise<Sinal[]> {
      await aguardar()
      return dados.sinais
        .filter((s) => s.contaId === contaId && foiDisparado(s, hoje))
        .sort((a, b) => parseDataDisparo(b.data).getTime() - parseDataDisparo(a.data).getTime())
    },

    async adicionarSinal(novoSinal: NovoSinal): Promise<Sinal> {
      await aguardar()
      const rawData = novoSinal.dataDisparo ?? novoSinal.dataAcontecimento ?? novoSinal.data ?? new Date()
      const dataIso = rawData instanceof Date ? rawData.toISOString() : String(rawData)
      const dataAcontecimento = novoSinal.dataAcontecimento
        ? (novoSinal.dataAcontecimento instanceof Date ? novoSinal.dataAcontecimento.toISOString() : String(novoSinal.dataAcontecimento))
        : dataIso
      const acontecimentoId = novoSinal.acontecimentoId ?? novoSinal.id

      // Deduplicação pelo mesmo acontecimento na Conta-alvo
      const existente = dados.sinais.find((s) => {
        if (s.contaId !== novoSinal.contaId) return false
        const idExistente = s.acontecimentoId ?? s.id
        return acontecimentoId && idExistente === acontecimentoId
      })

      if (existente) {
        // Reencontro: mantém data original e não renova validade
        const vezesAnteriores = existente.reencontrado?.vezes ?? 0
        existente.reencontrado = {
          data: dataIso,
          monitoramentoId: novoSinal.monitoramentoId ?? existente.monitoramentoId,
          fonte: novoSinal.fonte ?? existente.fonte,
          vezes: vezesAnteriores + 1,
        }
        notificar()
        return existente
      }

      const id = novoSinal.id ?? `sinal-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const frase = novoSinal.frase ?? novoSinal.titulo ?? novoSinal.descricao ?? ''
      const descricao = novoSinal.descricao ?? novoSinal.frase ?? novoSinal.titulo
      const titulo = novoSinal.titulo ?? novoSinal.frase
      const sinal: Sinal = {
        id,
        contaId: novoSinal.contaId,
        acontecimentoId: acontecimentoId ?? id,
        tipo: novoSinal.tipo,
        tipoId: novoSinal.tipoId,
        monitoramentoId: novoSinal.monitoramentoId,
        titulo,
        frase,
        descricao,
        data: dataIso,
        dataDisparo: dataIso,
        dataAcontecimento,
        fonte: novoSinal.fonte,
        evidencia: novoSinal.evidencia,
        detectadoPor: novoSinal.detectadoPor,
        reencontrado: novoSinal.reencontrado,
      }

      dados.sinais = [sinal, ...dados.sinais]
      notificar()
      return sinal
    },

    async interacoesDaConta(contaId: string): Promise<Interacao[]> {
      await aguardar()
      return dados.interacoes
        .filter((i) => i.contaId === contaId)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    },

    async registrarInteracao(nova: NovaInteracao): Promise<Interacao> {
      await aguardar()
      const dataIso = nova.data ?? hoje.toISOString()
      const novaId = `interacao-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      const interacao: Interacao = {
        id: novaId,
        contaId: nova.contaId,
        contatoId: nova.contatoId,
        tipo: nova.tipo,
        data: dataIso,
        participanteCliente: nova.participanteCliente ?? 'Marina Costa',
        origem: nova.origem ?? 'Demonstração',
      }

      dados.interacoes = [interacao, ...dados.interacoes]

      const conta = dados.contas.find((c) => c.id === nova.contaId)
      if (conta) {
        conta.ultimoContatoEm = dataIso
      }
      notificar()

      // Regra account-first do produto: qualquer resposta na Conta-alvo (positiva ou negativa)
      // pausa a sequência inteira da empresa para análise humana.
      if (
        fonteDeSequenciasVinculada &&
        (nova.tipo === 'email-recebido' || nova.tipo === 'reuniao')
      ) {
        const seq = await fonteDeSequenciasVinculada.sequenciaPorConta(nova.contaId)
        if (seq && seq.status === 'ativa') {
          const contato = dados.contatos.find((c) => c.id === nova.contatoId)
          const nomeContato = contato?.nome ?? 'Contato'
          const canal = nova.origem ?? (nova.tipo === 'reuniao' ? 'Reunião' : 'E-mail')
          const novoStatus = nova.tipo === 'reuniao' ? 'reuniao' : 'pausada'
          const motivo =
            nova.tipo === 'reuniao'
              ? `Reunião marcada com ${nomeContato}.`
              : `${nomeContato} respondeu via ${canal} hoje.`
          await fonteDeSequenciasVinculada.atualizarDocumento(seq.id, {
            status: novoStatus,
            motivoPause: motivo,
          })
        }
      }

      return interacao
    },

    async atualizarDestinosContato(
      contatoId: string,
      destinos: DestinosReaisContato,
    ): Promise<Contato> {
      await aguardar()
      const indice = dados.contatos.findIndex((c) => c.id === contatoId)
      if (indice === -1) {
        throw new Error(`Contato "${contatoId}" não encontrado`)
      }

      const atual = dados.contatos[indice]
      const email = destinos.email ? validarEmail(destinos.email) : atual.email
      const whatsapp = destinos.whatsapp ? normalizarWhatsApp(destinos.whatsapp) : atual.whatsapp
      const linkedin = destinos.linkedin !== undefined ? destinos.linkedin.trim() : atual.linkedin

      const atualizado: Contato = {
        ...atual,
        email,
        whatsapp,
        linkedin,
        ehReal: true,
        canais: {
          email: Boolean(email),
          telefone: Boolean(whatsapp),
          linkedin: Boolean(linkedin),
        },
      }

      dados.contatos = dados.contatos.map((c, i) => (i === indice ? atualizado : c))
      salvarDestinos()
      notificar()
      return atualizado
    },
  }
}

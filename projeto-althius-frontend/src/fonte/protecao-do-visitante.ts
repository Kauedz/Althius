// O Workspace visitante (acesso-e-planos): a Demonstração que já existe, só leitura. Quem entra sem Participação num
// Workspace contratado vê os dados de exemplo, mas toda ação paga (Monitoramento, Descoberta, Comitê, revelar contato,
// Agentes, Sequência) abre o modal "Fale com a equipe Althius" em vez de rodar. Este invólucro troca essas ações das
// fontes por uma que avisa o modal e recusa, sem tocar nas fontes simuladas. Nada vai ao servidor.

import type { Ambiente } from './ambiente'

/** A ação que o visitante tentou: a tela mostra esta mensagem e o modal abre por cima. */
export class ErroDeAcaoDoVisitante extends Error {
  constructor() {
    super('Esta ação não está disponível na demonstração. Fale com a equipe Althius.')
    this.name = 'ErroDeAcaoDoVisitante'
  }
}

type Fontes = 'fonte' | 'fonteDeContas' | 'fonteDeSequencias' | 'fonteDeSinais' | 'fonteDeDescobertas'

/** As ações pagas, por fonte. Ler continua livre. */
export const ACOES_PAGAS_DO_VISITANTE: Record<Fontes, readonly string[]> = {
  // Agentes: conversar e coordenar gastam rodadas; criar Agente e convidar mexem num Workspace de verdade.
  fonte: ['conversar', 'conversarCoordenado', 'criarAgente', 'convidarParaWorkspace'],
  // Comitê e revelar contato; enriquecer e buscar Sinais de novo gastam créditos; o envio ao CRM sai da Althius.
  fonteDeContas: ['buscarComite', 'revelarContato', 'aceitarContatoProposto', 'enriquecerReceita', 'buscarSinaisDeNovo', 'enviarAoCrm'],
  // Sequência: confirmar, enviar, ativar e decidir a retenção da Conta (continuar retoma os envios).
  fonteDeSequencias: [
    'criarSequencia', 'confirmarParticipantes', 'confirmarPasso', 'enviarPasso', 'ativarEnvios', 'liberarPassoManual',
    'aprovarEEnviarProposta', 'decidirRetencao',
  ],
  // Monitoramento.
  fonteDeSinais: ['salvarMonitoramento', 'mudarEstado', 'simularDisparo', 'pedirSinal'],
  // Descoberta.
  fonteDeDescobertas: ['buscarContas', 'aceitarDescoberta'],
}

const CONVERSAS = new Set(['conversar', 'conversarCoordenado'])

function proteger<T extends object>(fonte: T, metodos: readonly string[], aoBloquear: () => void): T {
  return new Proxy(fonte, {
    get(alvo, propriedade) {
      const valor = Reflect.get(alvo, propriedade, alvo)
      if (typeof valor !== 'function') return valor
      if (typeof propriedade === 'string' && metodos.includes(propriedade)) {
        if (CONVERSAS.has(propriedade)) {
          // Uma Conversa é um iterável assíncrono: ao pedir o primeiro passo o modal abre, e a Conversa termina em falha,
          // sem resposta no lugar.
          return async function* (): AsyncGenerator<{ tipo: 'falha'; motivo: string }> {
            aoBloquear()
            yield { tipo: 'falha', motivo: new ErroDeAcaoDoVisitante().message }
          }
        }
        return () => {
          aoBloquear()
          return Promise.reject(new ErroDeAcaoDoVisitante())
        }
      }
      return valor.bind(alvo)
    },
  })
}

/** O ambiente de Demonstração do visitante: as ações pagas abrem `aoBloquear` e recusam. */
export function protegerAmbienteDoVisitante(ambiente: Ambiente, aoBloquear: () => void): Ambiente {
  const protegido: Ambiente = { ...ambiente }
  for (const nome of Object.keys(ACOES_PAGAS_DO_VISITANTE) as Fontes[]) {
    protegido[nome] = proteger(ambiente[nome] as object, ACOES_PAGAS_DO_VISITANTE[nome], aoBloquear) as never
  }
  return protegido
}

/**
 * O armazenamento do visitante: em memória, já com o onboarding da Demonstração concluído, para ele cair na Casca e
 * não deixar nada no navegador depois de sair.
 */
export function criarArmazenamentoDoVisitante(): Storage {
  const dados = new Map<string, string>([
    ['althius.onboarding.v3', JSON.stringify({ ramo: 'convidado', etapa: 'checklist', day0Concluido: true, concluido: true })],
  ])
  return {
    get length() {
      return dados.size
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => void dados.delete(chave),
    setItem: (chave, valor) => void dados.set(chave, String(valor)),
  }
}

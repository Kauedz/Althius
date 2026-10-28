import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Ambiente, MotivoDasConversasIndisponiveis, ModoDoAmbiente, ModuloDoWorkspace } from './ambiente'
import type { FonteDeConexoes } from './conexoes-tipos'
import type { FonteDeContasRemetentes } from './contas-remetentes-tipos'
import type { FonteDeOnboarding } from './onboarding-tipos'
import type { FonteDeAutomacao } from './automacao-tipos'
import type { FonteDoPlaybook } from './playbook-tipos'
import type { FonteDeSinais } from './sinais-tipos'
import type { FonteDeDescobertas } from './descobertas-tipos'
import type { FonteDeAgentes, FonteDeContas, FonteDeSequencias, FonteObservavel } from './tipos'
import { ErroDoAgente, type FonteDoAgente } from './agente-tipos'

/** O que as telas sabem do ambiente atual: o modo, para se identificar, e se um módulo já tem backend. */
export interface AmbienteAtual {
  motivoDasConversas?: MotivoDasConversasIndisponiveis
  modo: ModoDoAmbiente
  disponivel(modulo: ModuloDoWorkspace): boolean
}

const ContextoDoAmbiente = createContext<AmbienteAtual | null>(null)

export function AmbienteProvider({ ambiente, children }: { ambiente: Ambiente; children: ReactNode }) {
  const { modo, indisponiveis, motivoDasConversas } = ambiente
  const valor = useMemo<AmbienteAtual>(() => ({ modo, motivoDasConversas, disponivel: (modulo) => !indisponiveis.has(modulo) }), [modo, indisponiveis, motivoDasConversas])
  return <ContextoDoAmbiente.Provider value={valor}>{children}</ContextoDoAmbiente.Provider>
}

export function useAmbiente(): AmbienteAtual {
  const ambiente = useContext(ContextoDoAmbiente)
  if (!ambiente) throw new Error('useAmbiente precisa de um AmbienteProvider')
  return ambiente
}

const ContextoDaFonte = createContext<FonteDeAgentes | null>(null)

export function FonteProvider({ fonte, children }: { fonte: FonteDeAgentes; children: ReactNode }) {
  return <ContextoDaFonte.Provider value={fonte}>{children}</ContextoDaFonte.Provider>
}

export function useFonte(): FonteDeAgentes {
  const fonte = useContext(ContextoDaFonte)
  if (!fonte) throw new Error('useFonte precisa de um FonteProvider')
  return fonte
}

const ContextoDaFonteDeContas = createContext<FonteDeContas | null>(null)

export function FonteDeContasProvider({ fonte, children }: { fonte: FonteDeContas; children: ReactNode }) {
  return <ContextoDaFonteDeContas.Provider value={fonte}>{children}</ContextoDaFonteDeContas.Provider>
}

export function useFonteDeContas(): FonteDeContas {
  const fonte = useContext(ContextoDaFonteDeContas)
  if (!fonte) throw new Error('useFonteDeContas precisa de um FonteDeContasProvider')
  return fonte
}

const ContextoDaFonteDeSequencias = createContext<FonteDeSequencias | null>(null)

export function FonteDeSequenciasProvider({
  fonte,
  children,
}: {
  fonte: FonteDeSequencias
  children: ReactNode
}) {
  return <ContextoDaFonteDeSequencias.Provider value={fonte}>{children}</ContextoDaFonteDeSequencias.Provider>
}

export function useFonteDeSequencias(): FonteDeSequencias {
  const fonte = useContext(ContextoDaFonteDeSequencias)
  if (!fonte) throw new Error('useFonteDeSequencias precisa de um FonteDeSequenciasProvider')
  return fonte
}

const ContextoDaFonteDeOnboarding = createContext<FonteDeOnboarding | null>(null)

export function FonteDeOnboardingProvider({
  fonte,
  children,
}: {
  fonte: FonteDeOnboarding
  children: ReactNode
}) {
  return <ContextoDaFonteDeOnboarding.Provider value={fonte}>{children}</ContextoDaFonteDeOnboarding.Provider>
}

export function useFonteDeOnboarding(): FonteDeOnboarding {
  const fonte = useContext(ContextoDaFonteDeOnboarding)
  if (!fonte) throw new Error('useFonteDeOnboarding precisa de um FonteDeOnboardingProvider')
  return fonte
}

const ContextoDaFonteDeSinais = createContext<FonteDeSinais | null>(null)

export function FonteDeSinaisProvider({
  fonte,
  children,
}: {
  fonte: FonteDeSinais
  children: ReactNode
}) {
  return <ContextoDaFonteDeSinais.Provider value={fonte}>{children}</ContextoDaFonteDeSinais.Provider>
}

export function useFonteDeSinais(): FonteDeSinais {
  const fonte = useContext(ContextoDaFonteDeSinais)
  if (!fonte) throw new Error('useFonteDeSinais precisa de um FonteDeSinaisProvider')
  return fonte
}

const ContextoDaFonteDeContasRemetentes = createContext<FonteDeContasRemetentes | null>(null)

export function FonteDeContasRemetentesProvider({
  fonte,
  children,
}: {
  fonte: FonteDeContasRemetentes
  children: ReactNode
}) {
  return <ContextoDaFonteDeContasRemetentes.Provider value={fonte}>{children}</ContextoDaFonteDeContasRemetentes.Provider>
}

export function useFonteDeContasRemetentes(): FonteDeContasRemetentes {
  const fonte = useContext(ContextoDaFonteDeContasRemetentes)
  if (!fonte) throw new Error('useFonteDeContasRemetentes precisa de um FonteDeContasRemetentesProvider')
  return fonte
}

const ContextoDaFonteDeAutomacao = createContext<FonteDeAutomacao | null>(null)

export function FonteDeAutomacaoProvider({ fonte, children }: { fonte: FonteDeAutomacao; children: ReactNode }) {
  return <ContextoDaFonteDeAutomacao.Provider value={fonte}>{children}</ContextoDaFonteDeAutomacao.Provider>
}

export function useFonteDeAutomacao(): FonteDeAutomacao {
  const fonte = useContext(ContextoDaFonteDeAutomacao)
  if (!fonte) throw new Error('useFonteDeAutomacao precisa de um FonteDeAutomacaoProvider')
  return fonte
}

const ContextoDaFonteDoPlaybook = createContext<FonteDoPlaybook | null>(null)

export function FonteDoPlaybookProvider({ fonte, children }: { fonte: FonteDoPlaybook; children: ReactNode }) {
  return <ContextoDaFonteDoPlaybook.Provider value={fonte}>{children}</ContextoDaFonteDoPlaybook.Provider>
}

export function useFonteDoPlaybook(): FonteDoPlaybook {
  const fonte = useContext(ContextoDaFonteDoPlaybook)
  if (!fonte) throw new Error('useFonteDoPlaybook precisa de um FonteDoPlaybookProvider')
  return fonte
}

const ContextoDaFonteDeConexoes = createContext<FonteDeConexoes | null>(null)

export function FonteDeConexoesProvider({
  fonte,
  children,
}: {
  fonte: FonteDeConexoes
  children: ReactNode
}) {
  return <ContextoDaFonteDeConexoes.Provider value={fonte}>{children}</ContextoDaFonteDeConexoes.Provider>
}

export function useFonteDeConexoes(): FonteDeConexoes {
  const fonte = useContext(ContextoDaFonteDeConexoes)
  if (!fonte) throw new Error('useFonteDeConexoes precisa de um FonteDeConexoesProvider')
  return fonte
}

const ContextoDaFonteDeDescobertas = createContext<FonteDeDescobertas | null>(null)

export function FonteDeDescobertasProvider({
  fonte,
  children,
}: {
  fonte?: FonteDeDescobertas
  children: ReactNode
}) {
  return <ContextoDaFonteDeDescobertas.Provider value={fonte ?? null}>{children}</ContextoDaFonteDeDescobertas.Provider>
}

export function useFonteDeDescobertas(): FonteDeDescobertas {
  const fonte = useContext(ContextoDaFonteDeDescobertas)
  if (!fonte) throw new Error('useFonteDeDescobertas precisa de um FonteDeDescobertasProvider')
  return fonte
}

/** Sem a Fonte do agente (um ambiente montado à mão), a tela diz que ele está fora do ar e não inventa resposta. */
const AGENTE_INDISPONIVEL: FonteDoAgente = {
  disponivel: () => Promise.resolve(false),
  conversas: () => Promise.resolve([]),
  conversa: () => Promise.reject(new ErroDoAgente('Esta conversa não existe ou não é sua.', 'nao_encontrada')),
  enviar: () => Promise.reject(new ErroDoAgente('O agente está fora do ar agora.', 'model_unavailable')),
  confirmar: () => Promise.reject(new ErroDoAgente('O agente está fora do ar agora.', 'model_unavailable')),
  cancelar: () => Promise.reject(new ErroDoAgente('O agente está fora do ar agora.', 'model_unavailable')),
  escolher: () => Promise.reject(new ErroDoAgente('O agente está fora do ar agora.', 'model_unavailable')),
  atualizar: () => Promise.resolve(false),
  pedidoDoCanal: () => Promise.reject(new ErroDoAgente('Não encontrei este pedido. Ele é de outra pessoa ou já não está neste Workspace.', 'nao_encontrado')),
}

const ContextoDaFonteDoAgente = createContext<FonteDoAgente>(AGENTE_INDISPONIVEL)

export function FonteDoAgenteProvider({ fonte, children }: { fonte?: FonteDoAgente; children: ReactNode }) {
  return <ContextoDaFonteDoAgente.Provider value={fonte ?? AGENTE_INDISPONIVEL}>{children}</ContextoDaFonteDoAgente.Provider>
}

export function useFonteDoAgente(): FonteDoAgente {
  return useContext(ContextoDaFonteDoAgente)
}

export interface EstadoDoCarregamento<T> {
  dados: T | undefined
  carregando: boolean
  erro: Error | null
  recarregar: () => void
}

/**
 * Carrega dados de qualquer fonte observável e recarrega sempre que ela avisa uma mudança.
 */
export function useCarregamento<F extends FonteObservavel, T>(
  fonte: F,
  carregar: (fonte: F) => Promise<T>,
  dependencias: unknown[],
): EstadoDoCarregamento<T> {
  const [dados, setDados] = useState<{ chave: string; valor: T }>()
  const [erro, setErro] = useState<{ chave: string; erro: Error } | null>(null)
  const [versao, setVersao] = useState(0)
  const chave = JSON.stringify(dependencias)

  const recarregar = useCallback(() => {
    setVersao((v) => v + 1)
  }, [])

  useEffect(() => fonte.observar(recarregar), [fonte, recarregar])

  useEffect(() => {
    let ativo = true
    setErro(null)
    carregar(fonte)
      .then((valor) => {
        if (ativo) {
          setDados({ chave, valor })
          setErro(null)
        }
      })
      .catch((err) => {
        if (ativo) {
          setErro({ chave, erro: err instanceof Error ? err : new Error(String(err)) })
        }
      })
    return () => {
      ativo = false
    }
    // `carregar` muda a cada render; as dependências declaradas controlam a recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, versao, chave])

  const dadosAtuais = dados?.chave === chave ? dados.valor : undefined
  const erroAtual = erro?.chave === chave ? erro.erro : null
  const carregando = dadosAtuais === undefined && erroAtual === null

  return {
    dados: dadosAtuais,
    carregando,
    erro: erroAtual,
    recarregar,
  }
}

/**
 * Carrega dados da fonte e recarrega sempre que ela avisa uma mudança.
 * Devolve `undefined` enquanto a primeira carga não termina.
 *
 * Pode ser chamado usando a fonte padrão de Agentes do contexto:
 *   `useDados((fonte) => fonte.agentes(), [])`
 * Ou passando explicitamente qualquer fonte observável:
 *   `useDados(fonte, (f) => f.itens(), [])`
 */
export function useDados<T>(carregar: (fonte: FonteDeAgentes) => Promise<T>, dependencias: unknown[]): T | undefined
export function useDados<F extends FonteObservavel, T>(
  fonte: F,
  carregar: (fonte: F) => Promise<T>,
  dependencias: unknown[],
): T | undefined
export function useDados<T>(
  carregarOuFonte: ((fonte: FonteDeAgentes) => Promise<T>) | FonteObservavel,
  dependenciasOuCarregar: unknown[] | ((fonte: any) => Promise<T>),
  dependenciasSeFonte?: unknown[],
): T | undefined {
  const fontePadrao = useContext(ContextoDaFonte)

  const ehFonteExplicita =
    typeof carregarOuFonte === 'object' && carregarOuFonte !== null && 'observar' in carregarOuFonte

  const fonte = ehFonteExplicita ? (carregarOuFonte as FonteObservavel) : fontePadrao
  const carregar = (ehFonteExplicita ? dependenciasOuCarregar : carregarOuFonte) as (
    fonte: FonteObservavel,
  ) => Promise<T>
  const dependencias = (ehFonteExplicita ? dependenciasSeFonte : dependenciasOuCarregar) as unknown[]

  if (!fonte) {
    throw new Error('useDados precisa de um FonteProvider ou de uma fonte passada explicitamente')
  }

  const { dados } = useCarregamento(fonte, carregar, dependencias)
  return dados
}

/**
 * Carrega dados da FonteDeContas do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeContas<T>(
  carregar: (fonte: FonteDeContas) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeContas()
  return useCarregamento(fonte, carregar, dependencias)
}

/**
 * Carrega dados da FonteDeSequencias do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeSequencias<T>(
  carregar: (fonte: FonteDeSequencias) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeSequencias()
  return useCarregamento(fonte, carregar, dependencias)
}

/**
 * Carrega dados da FonteDeSinais do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeSinais<T>(
  carregar: (fonte: FonteDeSinais) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeSinais()
  return useCarregamento(fonte, carregar, dependencias)
}

/**
 * Carrega dados da FonteDeConexoes do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeConexoes<T>(
  carregar: (fonte: FonteDeConexoes) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeConexoes()
  return useCarregamento(fonte, carregar, dependencias)
}

/**
 * Carrega dados da FonteDeDescobertas do contexto com estado completo de carregamento (dados, carregando, erro e recarregar).
 */
export function useDadosDeDescobertas<T>(
  carregar: (fonte: FonteDeDescobertas) => Promise<T>,
  dependencias: unknown[] = [],
): EstadoDoCarregamento<T> {
  const fonte = useFonteDeDescobertas()
  return useCarregamento(fonte, carregar, dependencias)
}


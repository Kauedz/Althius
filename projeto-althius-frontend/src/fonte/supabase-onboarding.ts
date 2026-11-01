// Day0 operacional: o banco decide o ramo, retoma os campos salvos e guarda a conclusão. A leitura do site é da
// Edge Function `icp-site-read`, que só lê o domínio confirmado e não grava nada; a sugestão fica nesta Fonte até
// a pessoa salvar.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoDaLeitura, EstadoDeOnboarding, FonteDeOnboarding, LeituraDoSite, MiniIcpEProduto } from './onboarding-tipos'
import { criarFonteDeOnboardingIndisponivel } from './indisponivel'
import { normalizarDominio } from './dominio-do-site'
import { aplicarLeitura } from './regras-onboarding'

type Registro = Pick<EstadoDeOnboarding, 'ramo' | 'etapa' | 'papel' | 'comoConheceu' | 'empresa' | 'dominio' | 'logoDoSite' | 'concluido'> & {
  miniIcp?: string
  oQueVende?: string
  porQueCompram?: string
}

const CAMPOS_SUGERIDOS = ['miniIcp', 'oQueVende', 'porQueCompram'] as const

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

/** A leitura que a função devolveu, só com os campos esperados; nenhuma quando a resposta não tem o formato. */
function leituraDaResposta(dados: unknown): LeituraDoSite | null {
  const leitura = (dados as { leitura?: unknown } | null)?.leitura
  if (!leitura || typeof leitura !== 'object' || Array.isArray(leitura)) return null
  const bruta = leitura as Record<string, unknown>
  return {
    oQueVende: texto(bruta.oQueVende),
    miniIcp: texto(bruta.miniIcp),
    porQueCompram: texto(bruta.porQueCompram),
    personas: Array.isArray(bruta.personas) ? bruta.personas.filter((p): p is string => typeof p === 'string') : [],
  }
}

export function criarFonteDeOnboardingSupabase(cliente: SupabaseClient, workspaceId: string): FonteDeOnboarding {
  const ouvintes = new Set<() => void>()
  let leitura: EstadoDaLeitura = { situacao: 'inativa', resultado: null }
  /** O checklist que a última leitura sugeriu. Um campo salvo no banco sempre vence a sugestão. */
  let sugerido: EstadoDeOnboarding['checklist'] | null = null
  let ultimo: EstadoDeOnboarding | null = null
  let leituraAtual = 0
  const publicar = () => ouvintes.forEach((ouvinte) => ouvinte())

  function montar(registro: Registro): EstadoDeOnboarding {
    const salvo = {
      miniIcp: registro.miniIcp ?? '',
      oQueVende: registro.oQueVende ?? '',
      porQueCompram: registro.porQueCompram ?? '',
    }
    const checklist: EstadoDeOnboarding['checklist'] = {
      ...salvo,
      personas: sugerido ? [...sugerido.personas] : [],
      produto: 'pendente',
      persona: 'pendente',
      sinal: 'pendente',
    }
    if (sugerido) {
      for (const campo of CAMPOS_SUGERIDOS) if (!salvo[campo]) checklist[campo] = sugerido[campo]
    }
    return {
      ...registro,
      workspace: null, // A identidade da Casca continua sendo a do Workspace provisionado pela equipe.
      leitura: { situacao: leitura.situacao, resultado: leitura.resultado ? structuredClone(leitura.resultado) : null },
      checklist,
      convitePulado: false,
      retornoAoChecklist: false,
      day0Concluido: registro.concluido,
    }
  }

  async function consultar(acao?: string, valor?: string): Promise<EstadoDeOnboarding> {
    const { data, error } = await cliente.rpc(acao ? 'save_my_day0' : 'get_my_day0', {
      p_workspace_id: workspaceId,
      ...(acao ? { p_action: acao, p_value: valor ?? null } : {}),
    })
    if (error || !data) throw new Error('Não foi possível carregar ou salvar o Day0. Verifique sua conexão e tente novamente.')
    ultimo = montar(data as Registro)
    if (acao) publicar()
    return ultimo
  }

  async function lerSite(bruto: string): Promise<LeituraDoSite | null> {
    const dominio = normalizarDominio(bruto)
    const estado = ultimo ?? (await consultar().catch(() => null))
    if (!estado || estado.ramo !== 'criador' || !dominio || dominio !== estado.dominio) return null
    const esta = ++leituraAtual
    leitura = { ...leitura, situacao: 'lendo' }
    ultimo = { ...estado, leitura: { ...leitura } }
    publicar()
    try {
      const { data, error } = await cliente.functions.invoke('icp-site-read', { body: { workspaceId, dominio } })
      if (esta !== leituraAtual) return null
      const resultado = error ? null : leituraDaResposta(data)
      if (!resultado) throw new Error('sem leitura')
      sugerido = aplicarLeitura(ultimo.checklist, leitura.resultado, resultado)
      leitura = { situacao: 'pronta', resultado: structuredClone(resultado) }
      await consultar().catch(() => null)
      publicar()
      return structuredClone(resultado)
    } catch {
      if (esta !== leituraAtual) return null
      leitura = { ...leitura, situacao: 'falhou' }
      if (ultimo) ultimo = { ...ultimo, leitura: { ...leitura } }
      publicar()
      return null
    }
  }

  return {
    ...criarFonteDeOnboardingIndisponivel(),
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    ler: () => consultar(),
    iniciar: () => consultar(),
    retomar: () => consultar(),
    dispensarRetorno: () => consultar(),
    definirPapel: (papel) => consultar('papel', papel),
    definirCliente: (nome) => consultar('empresa', nome.trim()),
    definirDominio: async (dominio) => {
      const host = normalizarDominio(dominio)
      if (!host) throw new Error('Informe um domínio válido.')
      const mudou = ultimo?.dominio !== host
      if (mudou) {
        leituraAtual++ // Uma leitura do domínio anterior não vale mais.
        leitura = { situacao: 'inativa', resultado: null }
        sugerido = null
      }
      const estado = await consultar('dominio', host)
      // Começa a leitura sem esperar por ela; o checklist recebe a sugestão quando ela chegar.
      if (mudou && estado.ramo === 'criador') void lerSite(host)
      return estado
    },
    definirComoConheceu: (origem) => consultar('hdyhau', origem),
    salvarProduto: async (campos: MiniIcpEProduto) => {
      const produto = { miniIcp: campos.miniIcp, oQueVende: campos.oQueVende, porQueCompram: campos.porQueCompram }
      const estado = await consultar('produto', JSON.stringify(produto))
      // O que a pessoa salvou deixa de ser sugestão, inclusive um campo que ela apagou.
      if (sugerido) sugerido = { ...sugerido, ...produto }
      return estado
    },
    concluirOnboarding: () => consultar('concluir'),
    // A resolução do logo fica fora desta fatia. Nenhum resultado é inventado.
    buscarLogo: async () => null,
    lerSite,
  }
}

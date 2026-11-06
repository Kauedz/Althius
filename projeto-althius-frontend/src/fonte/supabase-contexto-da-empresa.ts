// O Contexto da empresa do Workspace operacional, no Supabase (contexto-da-empresa, ticket 01). Tudo passa pelas
// funções do banco, que conferem a Participação ativa e o papel: todo participante lê, só Administrador grava.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ERRO_CONTEXTO_MUDOU,
  MOTIVOS_DA_FALHA_DA_GERACAO,
  type ContextoDaEmpresa,
  type FonteDoContextoDaEmpresa,
  type GeracaoDoContexto,
  type MotivoDaFalhaDaGeracao,
  type OrigemDoContexto,
} from './contexto-da-empresa-tipos'
import { corpoDoErroDaFuncao, motivoDaFalhaDaFuncao } from './falha-da-edge-function'

interface RegistroDoContexto {
  version: number | null
  empresa: unknown
  icp: unknown
  personas: unknown
  origin: string | null
  updated_by: string | null
  updated_at: string | null
  site: unknown
  generation?: unknown
}

const MOTIVOS: [code: string, trecho: string, texto: string][] = [
  ['42501', 'only administrators', 'Só um Administrador altera o Contexto da empresa.'],
  ['42501', 'active workspace membership required', 'Você não participa mais deste Workspace.'],
  ['40001', 'company context changed', ERRO_CONTEXTO_MUDOU],
  ['22023', 'company context too long', 'Um dos textos passou do tamanho máximo (40 mil caracteres).'],
  ['22023', 'invalid company context', 'O contexto não está no formato esperado.'],
  ['22023', 'no company context suggestion to decide', 'Esta sugestão já foi decidida. Recarregue para ver o contexto atual.'],
  ['P0002', 'company context generation not found', 'Esta sugestão não existe mais.'],
]

export function recusaDoContexto(erro: { code?: string; message?: string }): Error {
  const achada = MOTIVOS.find(([code, trecho]) => erro.code === code && (erro.message ?? '').includes(trecho))
  return new Error(achada ? achada[2] : 'Não foi possível concluir agora. Tente de novo.')
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '')

/** A geração como o banco a devolve; nula quando o formato não é o esperado. */
export function geracaoLida(bruto: unknown): GeracaoDoContexto | null {
  if (!bruto || typeof bruto !== 'object') return null
  const g = bruto as Record<string, unknown>
  if (typeof g.id !== 'string') return null
  const base = { id: g.id, site: texto(g.site), iniciadaEm: texto(g.created_at) }
  if (g.state === 'gerando') return { ...base, estado: 'gerando' }
  if (g.state === 'falha') {
    const motivo = (typeof g.failure === 'string' && g.failure in MOTIVOS_DA_FALHA_DA_GERACAO ? g.failure : 'falhou') as MotivoDaFalhaDaGeracao
    return { ...base, estado: 'falha', motivo }
  }
  if (g.state === 'sugestao') {
    return {
      ...base,
      estado: 'sugestao',
      textos: { empresa: texto(g.empresa), icp: texto(g.icp), personas: texto(g.personas) },
      fontes: Array.isArray(g.sources) ? g.sources.filter((f): f is string => typeof f === 'string') : [],
    }
  }
  return null
}

/** O contexto como o banco o devolve, sem confiar no formato. */
export function contextoLido(registro: RegistroDoContexto, autorDe: (conta: string | null) => string | null): ContextoDaEmpresa {
  return {
    site: texto(registro.site),
    geracao: geracaoLida(registro.generation),
    vigente:
      typeof registro.version === 'number' && registro.updated_at
        ? {
            versao: registro.version,
            empresa: texto(registro.empresa),
            icp: texto(registro.icp),
            personas: texto(registro.personas),
            origem: (registro.origin === 'geracao' ? 'geracao' : 'manual') satisfies OrigemDoContexto,
            autor: autorDe(registro.updated_by),
            em: registro.updated_at,
          }
        : null,
  }
}

export function criarFonteDoContextoDaEmpresaSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  /** Os nomes de quem participa do Workspace, pela Conta de usuário. */
  nomes: () => Promise<Map<string, string>>,
): FonteDoContextoDaEmpresa {
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  async function chamar<T>(funcao: string, parametros: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await cliente.rpc(funcao, { p_workspace_id: obterWorkspaceId(), ...parametros })
    if (error) throw recusaDoContexto(error)
    return data as T
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async contexto() {
      const [registro, porConta] = await Promise.all([
        chamar<RegistroDoContexto>('get_company_context'),
        nomes().catch(() => new Map<string, string>()),
      ])
      return contextoLido(registro, (conta) => (conta ? (porConta.get(conta) ?? null) : null))
    },
    async salvar(textos, versaoEsperada) {
      const versao = await chamar<number>('save_company_context', {
        p_empresa: textos.empresa,
        p_icp: textos.icp,
        p_personas: textos.personas,
        p_expected_version: versaoEsperada,
      })
      avisar()
      return versao
    },
    async gerar(site) {
      const { error } = await cliente.functions.invoke('company-context-generation', {
        body: { workspaceId: obterWorkspaceId(), ...(site !== undefined ? { site } : {}) },
      })
      if (error) {
        const corpo = await corpoDoErroDaFuncao(error)
        throw new Error(
          typeof corpo?.error === 'string' ? corpo.error : await motivoDaFalhaDaFuncao('company-context-generation', error, ''),
        )
      }
      avisar()
    },
    async aceitarSugestao(geracaoId, versaoEsperada) {
      const versao = await chamar<number>('accept_company_context_suggestion', {
        p_generation_id: geracaoId,
        p_expected_version: versaoEsperada,
      })
      avisar()
      return versao
    },
    async descartarGeracao(geracaoId) {
      await chamar<unknown>('discard_company_context_generation', { p_generation_id: geracaoId })
      avisar()
    },
  }
}

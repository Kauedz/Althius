// O Playbook do Workspace operacional, no Supabase (playbook-do-workspace, ticket 02). Tudo passa pelas funções do
// banco, que conferem a Participação ativa e o papel: todo participante lê, só Administrador grava e restaura; o Membro
// propõe uma revisão, que vai para Aprovações.
// O autor de cada versão chega como Conta de usuário; o nome vem de quem participa do Workspace.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SECOES_DO_PLAYBOOK,
  type ConteudoDoPlaybook,
  type FonteDoPlaybook,
  type IdDaSecaoDoPlaybook,
  type SecaoDoPlaybook,
} from './playbook-tipos'

interface RegistroDaVersao {
  version: number
  updated_by: string | null
  updated_at: string
}

interface RegistroDaSecao {
  section: string
  name: string
  version: number | null
  content: { texto?: unknown; linhas?: unknown } | null
  updated_by: string | null
  updated_at: string | null
  history: RegistroDaVersao[]
}

const ERRO_SO_ADMINISTRADOR = 'Só um Administrador edita o Playbook.'

const MOTIVOS: [code: string, trecho: string, texto: string][] = [
  ['42501', 'only administrators', ERRO_SO_ADMINISTRADOR],
  ['22023', 'the revision does not change', 'A proposta é igual à versão vigente.'],
  ['42501', 'active workspace membership required', 'Você não participa mais deste Workspace.'],
  ['22023', 'invalid playbook content', 'O conteúdo desta seção não está no formato do Playbook.'],
  ['22023', 'playbook content too long', 'O conteúdo desta seção passou do tamanho máximo.'],
  ['P0002', 'playbook version not found', 'Esta versão do Playbook não existe.'],
]

function recusa(erro: { code?: string; message?: string }): Error {
  const achada = MOTIVOS.find(([code, trecho]) => erro.code === code && (erro.message ?? '').includes(trecho))
  return new Error(achada ? achada[2] : 'Não foi possível concluir agora. Tente de novo.')
}

/** O conteúdo como o banco o devolve, sem confiar no formato: só texto e linhas de texto passam. */
export function conteudoLido(bruto: RegistroDaSecao['content']): ConteudoDoPlaybook {
  const linhas = Array.isArray(bruto?.linhas) ? bruto.linhas : []
  return {
    texto: typeof bruto?.texto === 'string' ? bruto.texto : '',
    linhas: linhas.flatMap((linha) =>
      linha && typeof linha === 'object'
        ? [Object.fromEntries(Object.entries(linha).map(([campo, valor]) => [campo, typeof valor === 'string' ? valor : '']))]
        : [],
    ),
  }
}

export function criarFonteDoPlaybookSupabase(
  cliente: SupabaseClient,
  obterWorkspaceId: () => string,
  /** Os nomes de quem participa do Workspace, pela Conta de usuário. */
  nomes: () => Promise<Map<string, string>>,
  /** A fila de Aprovações: decidir uma revisão relê o Playbook, e propor relê a fila. */
  aprovacoes?: { observar(ouvinte: () => void): () => void; invalidar(): void },
): FonteDoPlaybook {
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())
  aprovacoes?.observar(avisar)

  async function chamar<T>(funcao: string, parametros: Record<string, unknown>): Promise<T> {
    const { data, error } = await cliente.rpc(funcao, { p_workspace_id: obterWorkspaceId(), ...parametros })
    if (error) throw recusa(error)
    return data as T
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    async secao(id): Promise<SecaoDoPlaybook> {
      const [registro, porConta] = await Promise.all([
        chamar<RegistroDaSecao>('get_playbook_section', { p_section: id }),
        nomes().catch(() => new Map<string, string>()),
      ])
      const autorDe = (conta: string | null) => (conta ? (porConta.get(conta) ?? null) : null)
      return {
        id,
        nome: SECOES_DO_PLAYBOOK.find((secao) => secao.id === id)?.nome ?? registro.name,
        vigente:
          registro.version === null || registro.updated_at === null
            ? null
            : {
                versao: registro.version,
                autor: autorDe(registro.updated_by),
                em: registro.updated_at,
                conteudo: conteudoLido(registro.content),
              },
        historico: registro.history.map((h) => ({ versao: h.version, autor: autorDe(h.updated_by), em: h.updated_at })),
      }
    },
    async salvar(id: IdDaSecaoDoPlaybook, conteudo) {
      const versao = await chamar<number>('save_playbook_section', { p_section: id, p_content: conteudo })
      avisar()
      return versao
    },
    async propor(id, conteudo, justificativa = '') {
      await chamar<unknown>('propose_playbook_revision', {
        p_section: id,
        p_content: conteudo,
        p_justification: justificativa,
      })
      aprovacoes?.invalidar()
      avisar()
    },
    async restaurar(id, versao) {
      const nova = await chamar<number>('restore_playbook_version', { p_section: id, p_version: versao })
      avisar()
      return nova
    },
  }
}

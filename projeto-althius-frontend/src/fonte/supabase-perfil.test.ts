import { describe, expect, it } from 'vitest'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDoPerfilSupabase } from './supabase-perfil'

const MARINA = { id: 'usuario-marina', email: 'marina@cliente.com.br' }

/** O perfil da Marina no Workspace operacional, com o que o banco gravou em `gravacoes`. */
function fonteDaMarina() {
  const gravacoes: Record<string, unknown>[] = []
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe(MARINA),
    rpcs: {
      save_my_profile: (parametros) => {
        gravacoes.push(parametros)
        return [{ name: parametros.p_display_name, avatar_data_url: parametros.p_avatar_data_url, email: MARINA.email }]
      },
    },
  })
  const fonte = criarFonteDoPerfilSupabase(cliente, {
    usuario: MARINA,
    participacao: { workspaceId: 'ws-pessoal-marina', nomeDoWorkspace: 'Marina Souza', papel: 'administrador' },
  })
  return { fonte, gravacoes }
}

describe('Perfil do Workspace operacional', () => {
  it('grava nome e foto; o e-mail é o do acesso e só é conferido', async () => {
    const { fonte, gravacoes } = fonteDaMarina()
    await fonte.salvarPerfil({ nome: '  Marina Costa ', email: 'Marina@Cliente.com.br', foto: undefined })
    expect(gravacoes).toEqual([{ p_display_name: 'Marina Costa', p_avatar_data_url: null }])
  })

  it('recusa trocar o e-mail por aqui, sem gravar nada', async () => {
    const { fonte, gravacoes } = fonteDaMarina()
    await expect(fonte.salvarPerfil({ nome: 'Marina', email: 'outra@cliente.com.br' })).rejects.toThrow(
      'O e-mail é o do seu acesso à Althius e não muda por aqui.',
    )
    expect(gravacoes).toEqual([])
  })
})

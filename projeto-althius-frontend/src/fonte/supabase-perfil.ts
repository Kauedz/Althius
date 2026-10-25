// Meu perfil e Preferências do Workspace operacional, no Supabase (CRM-08). O perfil (nome e foto) e as preferências
// (tema e notificações do navegador) são da Conta de usuário, e não do Workspace: as funções do banco agem sempre sobre
// a Conta de usuário da sessão, sem receber o id de ninguém, então uma pessoa nunca lê nem sobrescreve os de outra. O
// e-mail é o do acesso no Supabase Auth e não muda por aqui; a senha também é do Supabase Auth (módulo de autenticação).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContaDeUsuarioDaSessao, ParticipacaoNoWorkspace } from './ambiente'
import type { FonteDeAgentes, Perfil, Preferencias, PreferenciasDeAvisosDoCanal, TemaEscolhido } from './tipos'

interface RegistroDoPerfil {
  name: string | null
  avatar_data_url: string | null
  email: string
}

interface RegistroDasPreferencias {
  theme: TemaEscolhido | null
  browser_notifications: boolean
}

/** As recusas das funções de perfil e preferências (migration perfil_e_preferencias), pelo trecho da mensagem. */
const RECUSAS: [trecho: string, texto: string][] = [
  ['invalid name', 'Informe seu nome, com até 120 caracteres.'],
  ['invalid avatar', 'Escolha uma imagem JPG, PNG, WebP ou GIF de até 256 KB.'],
  ['invalid theme', 'Escolha o tema claro ou o escuro.'],
]

function converterErro(error: { message: string; code?: string }, falha: string): Error {
  const recusa = error.code === '22023' ? RECUSAS.find(([trecho]) => error.message.includes(trecho)) : undefined
  return new Error(recusa ? recusa[1] : falha)
}

const FALHA_AO_CARREGAR_O_PERFIL = 'Não foi possível carregar seu perfil. Verifique sua conexão e tente de novo.'
const FALHA_AO_SALVAR_O_PERFIL = 'Não foi possível salvar o perfil agora. Nada foi alterado; verifique sua conexão e tente de novo.'
const FALHA_AO_CARREGAR_AS_PREFERENCIAS = 'Não foi possível carregar suas preferências. Verifique sua conexão e tente de novo.'
const FALHA_AO_SALVAR_AS_PREFERENCIAS = 'Não foi possível salvar agora. Nada foi alterado; verifique sua conexão e tente de novo.'

export type FonteDoPerfil = Pick<
  FonteDeAgentes,
  'observar' | 'workspace' | 'perfil' | 'salvarPerfil' | 'preferencias' | 'salvarPreferencias' | 'telefoneVerificadoDoCanal' | 'operarTelefoneVerificadoDoCanal' | 'preferenciasDeAvisosDoCanal' | 'salvarPreferenciasDeAvisosDoCanal'
>

export function criarFonteDoPerfilSupabase(
  cliente: SupabaseClient,
  { usuario, participacao }: { usuario: ContaDeUsuarioDaSessao; participacao: ParticipacaoNoWorkspace },
): FonteDoPerfil {
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  async function perfil(): Promise<Perfil> {
    const { data, error } = await cliente.rpc('get_my_profile')
    if (error) throw converterErro(error, FALHA_AO_CARREGAR_O_PERFIL)
    const [linha] = (data ?? []) as RegistroDoPerfil[]
    // Sem nome no cadastro, o campo começa vazio: o nome nunca é deduzido do e-mail.
    return { nome: linha?.name ?? '', email: linha?.email ?? usuario.email, foto: linha?.avatar_data_url ?? undefined }
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },

    async workspace() {
      // O menu pessoal não para por uma falha do perfil: mostra o e-mail até o perfil voltar.
      const salvo = await perfil().catch(() => null)
      return {
        cliente: participacao.nomeDoWorkspace,
        descricao: '',
        usuario: { id: usuario.id, nome: salvo?.nome || usuario.email, email: usuario.email, foto: salvo?.foto, cargo: '' },
        papel: participacao.papel,
        aprovacoesPendentes: 0,
      }
    },

    perfil,

    // O e-mail é o do acesso no Supabase Auth: um e-mail diferente do da sessão é recusado, sem gravar nada.
    async salvarPerfil({ nome, email, foto }) {
      if (email.trim().toLowerCase() !== usuario.email.toLowerCase()) {
        throw new Error('O e-mail é o do seu acesso à Althius e não muda por aqui.')
      }
      const { error } = await cliente.rpc('save_my_profile', { p_display_name: nome.trim(), p_avatar_data_url: foto ?? null })
      if (error) throw converterErro(error, FALHA_AO_SALVAR_O_PERFIL)
      avisar()
    },

    async preferencias(): Promise<Preferencias> {
      const { data, error } = await cliente.rpc('get_my_preferences')
      if (error) throw converterErro(error, FALHA_AO_CARREGAR_AS_PREFERENCIAS)
      const [linha] = (data ?? []) as RegistroDasPreferencias[]
      return {
        notificacoesDoNavegador: linha?.browser_notifications === true,
        ...(linha?.theme ? { tema: linha.theme } : {}),
      }
    },

    // Só o que mudou vai ao banco: o que não veio continua como está, também se outro dispositivo acabou de mudar.
    async salvarPreferencias({ tema, notificacoesDoNavegador }) {
      const { error } = await cliente.rpc('save_my_preferences', {
        p_theme: tema ?? null,
        p_browser_notifications: notificacoesDoNavegador ?? null,
      })
      if (error) throw converterErro(error, FALHA_AO_SALVAR_AS_PREFERENCIAS)
      avisar()
    },

    async telefoneVerificadoDoCanal() {
      const { data, error } = await cliente.rpc('get_my_channel_phone')
      if (error) throw converterErro(error, FALHA_AO_CARREGAR_O_PERFIL)
      const [linha] = (data ?? []) as { phone_e164: string | null; suspended: boolean; email_pending: boolean }[]
      return { telefone: linha?.phone_e164 ?? null, suspenso: linha?.suspended ?? false, emailPendente: linha?.email_pending ?? false }
    },

    async operarTelefoneVerificadoDoCanal(acao, dados = {}) {
      const { data, error } = await cliente.functions.invoke('canal-phone-verification', {
        body: { action: acao, phone: dados.telefone, code: dados.codigo },
      })
      if (error) throw new Error('Não foi possível atualizar o telefone. Verifique os dados e tente novamente.')
      avisar()
      return { emailPendente: data?.emailPending === true }
    },

    async preferenciasDeAvisosDoCanal() {
      const { data, error } = await cliente.rpc('get_my_channel_notice_preferences')
      if (error) throw converterErro(error, FALHA_AO_CARREGAR_O_PERFIL)
      return data as PreferenciasDeAvisosDoCanal
    },

    async salvarPreferenciasDeAvisosDoCanal(preferencias) {
      const { error } = await cliente.rpc('save_my_channel_notice_preferences', { p_preferences: preferencias })
      if (error) throw converterErro(error, FALHA_AO_SALVAR_AS_PREFERENCIAS)
      avisar()
    },
  }
}

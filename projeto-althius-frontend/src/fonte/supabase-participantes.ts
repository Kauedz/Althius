// Participantes e convites do Workspace operacional, no Supabase (CRM-03). Tudo passa pelas funções do banco, que
// conferem a Participação ativa e o papel de quem chama: só Administrador convida, revoga convite, muda papel e
// remove Participação; o último Administrador e o Titular do Workspace pessoal ficam protegidos lá. Nenhum e-mail é
// enviado: o convite traz o link, que o Administrador copia.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enderecoDoConvite } from '@/auth/destino'
import {
  ERRO_CONVITE_DE_OUTRO_EMAIL,
  ERRO_DE_EMAIL,
  ERRO_DE_PAPEL,
  ERRO_SEM_PARTICIPACAO,
  ERRO_SO_ADMINISTRADOR,
  ERRO_TITULAR,
  ERRO_ULTIMO_ADMINISTRADOR,
} from './regras'
import type { Convite, EstadoDoConvite, FonteDeAgentes, NovoConvite, Papel, ParticipantesDoWorkspace } from './tipos'

type Role = 'admin' | 'member'

interface RegistroDoParticipante {
  user_id: string
  email: string
  name: string | null
  role: Role
  is_owner: boolean
}

interface RegistroDoConvite {
  id: string
  email: string
  role: Role
  status: EstadoDoConvite
  created_at: string
  expires_at: string
  token: string | null
}

interface RegistroDoWorkspace {
  name: string
  created_at: string
}

const PAPEL: Record<Role, Papel> = { admin: 'administrador', member: 'membro' }
const ROLE: Record<Papel, Role> = { administrador: 'admin', membro: 'member' }

/** Uma recusa das funções do banco: o SQLSTATE e o trecho da mensagem que a identifica, e o texto para a pessoa. */
type Recusa = [code: string, trecho: string, texto: (email?: string) => string]

/** As recusas das funções de participantes e convites (migration convites_e_participantes), num só lugar. */
const RECUSAS: Recusa[] = [
  ['42501', 'only administrators', () => ERRO_SO_ADMINISTRADOR],
  ['42501', 'active workspace membership required', () => ERRO_SEM_PARTICIPACAO],
  ['42501', 'last administrator', () => ERRO_ULTIMO_ADMINISTRADOR],
  ['42501', 'owner of a personal workspace', () => ERRO_TITULAR],
  ['42501', 'cannot remove yourself', () => 'Você não pode remover a si mesmo por aqui.'],
  ['42501', 'another email', () => ERRO_CONVITE_DE_OUTRO_EMAIL],
  ['42501', 'email not verified', () => 'Confirme seu e-mail antes de aceitar o convite.'],
  ['22023', 'invalid email', () => ERRO_DE_EMAIL],
  ['22023', 'invalid role', () => ERRO_DE_PAPEL],
  ['22023', 'only pending invitations', () => 'Só um convite pendente pode ser cancelado.'],
  ['22023', 'invitation revoked', () => 'Este convite foi cancelado por um Administrador do Workspace. Peça um novo convite.'],
  ['22023', 'invitation expired', () => 'Este convite expirou. Peça um novo convite a um Administrador do Workspace.'],
  ['22023', 'invitation already used', () => 'Este convite já foi usado. Peça um novo convite a um Administrador do Workspace.'],
  ['23505', 'already participates', (email) => `${email ?? 'Esta pessoa'} já participa deste Workspace.`],
  ['23505', 'pending invitation already exists', (email) => `Já existe um convite pendente para ${email ?? 'este e-mail'}.`],
  ['P0002', 'invitation not found', () => 'Este link de convite não é válido. Confira o link ou peça um novo convite.'],
  ['P0002', 'participant not found', () => 'Esta pessoa não participa deste Workspace.'],
]

/**
 * A mensagem para a pessoa, a partir da recusa que a função do banco levantou; uma falha que não é recusa (rede,
 * servidor) vira `falha`, sem mostrar o erro técnico.
 */
function converterErro(error: { message: string; code?: string }, falha: string, email?: string): Error {
  const recusa = RECUSAS.find(([code, trecho]) => error.code === code && error.message.includes(trecho))
  return new Error(recusa ? recusa[2](email) : falha)
}

const FALHA_NA_OPERACAO = 'Não foi possível concluir agora. Verifique sua conexão e tente de novo.'

/** O que o aceite deu: o Workspace em que a pessoa passou a participar, ou por que o convite não valeu. */
export type ResultadoDoAceite = { workspaceId: string } | { recusa: string }

/**
 * Aceita o convite do token com a Conta de usuário da sessão. Quem decide é o banco: o convite precisa estar pendente
 * e a sessão precisa ter exatamente o e-mail convidado, verificado; o domínio não basta. Chame depois do bootstrap do
 * Workspace pessoal.
 */
export async function aceitarConvite(cliente: SupabaseClient, token: string): Promise<ResultadoDoAceite> {
  const { data, error } = await cliente.rpc('accept_workspace_invitation', { p_token: token })
  if (error) {
    // Uma falha de rede ou do servidor não é recusa: o convite pode continuar valendo.
    return { recusa: converterErro(error, 'Não foi possível aceitar o convite agora. Abra o link do convite de novo em instantes.').message }
  }
  return { workspaceId: (data as { id: string }).id }
}

function converterConvite(linha: RegistroDoConvite): Convite {
  return {
    id: linha.id,
    email: linha.email,
    papel: PAPEL[linha.role],
    registradoEm: linha.created_at.slice(0, 10),
    expiraEm: linha.expires_at.slice(0, 10),
    estado: linha.status,
    ...(linha.token && linha.status === 'pendente' ? { link: enderecoDoConvite(linha.token) } : {}),
  }
}

export type FonteDeParticipantes = Pick<
  FonteDeAgentes,
  'observar' | 'participantesDoWorkspace' | 'convidarParaWorkspace' | 'cancelarConvite' | 'mudarPapel' | 'removerDoWorkspace'
>

export function criarFonteDeParticipantesSupabase(
  cliente: SupabaseClient,
  workspaceId: string,
  usuarioId: string,
): FonteDeParticipantes {
  const ouvintes = new Set<() => void>()
  const avisar = () => ouvintes.forEach((ouvinte) => ouvinte())

  /** Chama a função do banco e, se ela recusar, lança a mensagem para a pessoa. */
  async function chamar<T>(funcao: string, parametros: Record<string, unknown>, email?: string): Promise<T> {
    const { data, error } = await cliente.rpc(funcao, parametros)
    if (error) throw converterErro(error, FALHA_NA_OPERACAO, email)
    return data as T
  }

  return {
    observar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },

    async participantesDoWorkspace(): Promise<ParticipantesDoWorkspace> {
      const [participantes, convites, workspace] = await Promise.all([
        chamar<RegistroDoParticipante[]>('list_workspace_participants', { p_workspace_id: workspaceId }),
        chamar<RegistroDoConvite[]>('list_workspace_invitations', { p_workspace_id: workspaceId }),
        cliente.from('workspaces').select('name, created_at').eq('id', workspaceId).maybeSingle(),
      ])
      if (workspace.error) throw new Error(FALHA_NA_OPERACAO)
      const dados = workspace.data as RegistroDoWorkspace | null
      const administradores = participantes.filter((p) => p.role === 'admin')
      const daSessao = participantes.find((p) => p.user_id === usuarioId)
      return {
        informacoes: { nome: dados?.name ?? 'Workspace', descricao: '', criadoEm: (dados?.created_at ?? '').slice(0, 10) },
        contaId: usuarioId,
        papel: daSessao ? PAPEL[daSessao.role] : null,
        participantes: participantes.map((p) => ({
          // Sem nome no cadastro, a pessoa aparece pelo e-mail; o nome nunca é deduzido dele.
          conta: { id: p.user_id, nome: p.name ?? p.email, email: p.email, cargo: '' },
          papel: PAPEL[p.role],
          ultimoAdministrador: p.role === 'admin' && administradores.length === 1,
          // As Participações noutros Workspaces são de outros Clientes: não aparecem aqui.
          outrasParticipacoes: [],
          titular: p.is_owner,
        })),
        convites: convites.map(converterConvite),
      }
    },

    async convidarParaWorkspace({ email, papel }: NovoConvite) {
      const normalizado = email.trim().toLowerCase()
      const [linha] = await chamar<RegistroDoConvite[]>(
        'invite_to_workspace',
        { p_workspace_id: workspaceId, p_email: normalizado, p_role: ROLE[papel] },
        normalizado,
      )
      avisar()
      return converterConvite(linha)
    },

    async cancelarConvite(conviteId) {
      await chamar('revoke_workspace_invitation', { p_invitation_id: conviteId })
      avisar()
    },

    async mudarPapel(contaId, papel) {
      await chamar('change_participant_role', { p_workspace_id: workspaceId, p_user_id: contaId, p_role: ROLE[papel] })
      avisar()
    },

    async removerDoWorkspace(contaId) {
      await chamar('remove_participant', { p_workspace_id: workspaceId, p_user_id: contaId })
      avisar()
    },
  }
}

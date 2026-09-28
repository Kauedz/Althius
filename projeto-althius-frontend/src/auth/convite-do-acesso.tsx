import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { lerPreviaDoConvite, type PreviaDoConvite } from '@/fonte/supabase-participantes'
import { useAutenticacao } from './contexto'
import { tokenDoConviteNoDestino, tokenDoConviteNoEndereco } from './destino'

/**
 * O convite que a tela de acesso atual atende: nenhum, a prévia ainda chegando, a prévia lida ou a falha ao lê-la,
 * com a nova tentativa.
 */
export type ConviteDoAcesso =
  | { estado: 'sem-convite' }
  | { estado: 'carregando' }
  | { estado: 'falha'; mensagem: string; tentarDeNovo: () => void }
  | { estado: 'lido'; token: string; previa: PreviaDoConvite }

/** As prévias já lidas nesta visita às telas de acesso, para ir do convite ao cadastro ou à entrada sem ler de novo. */
const PreviasLidas = createContext<Map<string, PreviaDoConvite> | null>(null)

export function MemoriaDosConvites({ children }: { children: ReactNode }) {
  const [lidas] = useState(() => new Map<string, PreviaDoConvite>())
  return <PreviasLidas.Provider value={lidas}>{children}</PreviasLidas.Provider>
}

/**
 * O convite do link aberto (`/convite/<token>`) ou lembrado como destino da tela de acesso (`?destino=/convite/<token>`).
 * O e-mail travado vem sempre da prévia do banco, nunca do endereço.
 */
export function useConviteDoAcesso(): ConviteDoAcesso {
  const { cliente } = useAutenticacao()
  const memoria = useContext(PreviasLidas)
  const [propria] = useState(() => new Map<string, PreviaDoConvite>())
  const lidas = memoria ?? propria
  // O endereço muda ao navegar entre as telas de acesso; o token é lido dele a cada renderização.
  useLocation()
  const token = tokenDoConviteNoEndereco() ?? tokenDoConviteNoDestino()
  const previa = token ? lidas.get(token) : undefined
  const [, setLeituras] = useState(0)
  const [tentativa, setTentativa] = useState(0)
  const [falha, setFalha] = useState<{ token: string; tentativa: number; mensagem: string } | null>(null)

  useEffect(() => {
    if (!token || previa) return
    let ativo = true
    lerPreviaDoConvite(cliente, token).then(
      (lida) => {
        if (!ativo) return
        lidas.set(token, lida)
        setLeituras((n) => n + 1)
      },
      (erro: unknown) => {
        if (ativo) setFalha({ token, tentativa, mensagem: erro instanceof Error ? erro.message : String(erro) })
      },
    )
    return () => { ativo = false }
  }, [cliente, lidas, token, previa, tentativa])

  if (!token) return { estado: 'sem-convite' }
  if (previa) return { estado: 'lido', token, previa }
  if (falha?.token === token && falha.tentativa === tentativa) {
    return { estado: 'falha', mensagem: falha.mensagem, tentarDeNovo: () => setTentativa((n) => n + 1) }
  }
  return { estado: 'carregando' }
}

/** O e-mail que a tela de acesso trava: o do convite pendente; sem convite pendente, nenhum. */
function emailTravadoDoConvite(convite: ConviteDoAcesso): string | null {
  return convite.estado === 'lido' && convite.previa.estado === 'pendente' ? convite.previa.email : null
}

/**
 * Espera a prévia do convite que a tela de acesso atende, antes de mostrá-la com o e-mail travado; sem convite, mostra
 * a tela na hora. Uma falha de leitura é explicada, com nova tentativa.
 */
export function ComOConviteDoAcesso({ children }: { children: (emailTravado: string | null) => ReactNode }) {
  const convite = useConviteDoAcesso()
  if (convite.estado === 'carregando') return <CarregandoOConvite />
  if (convite.estado === 'falha') return <FalhaAoCarregarOConvite mensagem={convite.mensagem} tentarDeNovo={convite.tentarDeNovo} />
  return children(emailTravadoDoConvite(convite))
}

export function CarregandoOConvite() {
  return <p role="status" className="text-sm text-al-muted">Carregando o convite…</p>
}

export function FalhaAoCarregarOConvite({ mensagem, tentarDeNovo }: { mensagem: string; tentarDeNovo: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p role="alert" className="text-sm text-al-erro">{mensagem}</p>
      <Button onClick={tentarDeNovo}>Tentar de novo</Button>
    </div>
  )
}

/** O aviso junto do e-mail travado, que explica por que ele não se troca. */
export function AvisoDoEmailTravado({ id, email }: { id: string; email: string }) {
  return <p id={id} className="text-xs text-al-muted">Este convite é para {email}</p>
}

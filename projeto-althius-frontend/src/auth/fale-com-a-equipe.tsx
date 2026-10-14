import { useState, type FormEvent, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { enviarPedidoDeAcesso, ERRO_DO_PEDIDO_DE_ACESSO } from '@/fonte/supabase-contrato'

/**
 * "Fale com a equipe Althius": o que abre quando o visitante tenta uma ação paga na demonstração. Nome, empresa,
 * telefone e mensagem vão para a equipe, que cria o Workspace depois do contrato.
 */
export function ModalFaleComAEquipe({
  cliente,
  aberto,
  aoMudar,
}: {
  cliente: SupabaseClient
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">{aberto && <Corpo cliente={cliente} aoFechar={() => aoMudar(false)} />}</DialogContent>
    </Dialog>
  )
}

function Corpo({ cliente, aoFechar }: { cliente: SupabaseClient; aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !empresa.trim() || !telefone.trim() || !mensagem.trim()) {
      setErro('Preencha nome, empresa, telefone e mensagem.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      await enviarPedidoDeAcesso(cliente, { nome, empresa, telefone, mensagem })
      setEnviado(true)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : ERRO_DO_PEDIDO_DE_ACESSO)
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="titulo-secao text-xl">Recebemos seu pedido</DialogTitle>
          <DialogDescription>A equipe Althius entra em contato em breve, pelo telefone e pelo e-mail da sua conta.</DialogDescription>
        </DialogHeader>
        <div>
          <button type="button" className={BOTAO_PRIMARIO} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="titulo-secao text-xl">Fale com a equipe Althius</DialogTitle>
        <DialogDescription>
          Esta ação não está disponível na demonstração. O Workspace da sua empresa nasce depois do contrato: conte um
          pouco sobre vocês e a equipe Althius responde.
        </DialogDescription>
      </DialogHeader>
      <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <Campo rotulo="Nome">
          <input required autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className="campo h-10" />
        </Campo>
        <Campo rotulo="Empresa">
          <input required autoComplete="organization" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={160} className="campo h-10" />
        </Campo>
        <Campo rotulo="Telefone">
          <input required type="tel" autoComplete="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={40} className="campo h-10" />
        </Campo>
        <Campo rotulo="Mensagem">
          <textarea required value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={2000} className="campo min-h-24 py-2" />
        </Campo>
        {erro && (
          <p role="alert" className="text-sm text-al-erro">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={BOTAO_PRIMARIO} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>
            Agora não
          </button>
        </div>
      </form>
    </>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="rotulo text-al-ink">{rotulo}</span>
      {children}
    </label>
  )
}

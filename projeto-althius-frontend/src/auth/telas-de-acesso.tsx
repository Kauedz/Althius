import { useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/marca'
import { useAutenticacao } from './contexto'
import { ROTA_DE_CADASTRO, ROTA_DE_ENTRADA, destinoDepoisDoAcesso, enderecoDeEntrada } from './destino'
import { TelaDeCadastro } from './tela-de-cadastro'

/** As telas para quem ainda não tem sessão. Qualquer outro endereço leva a /entrar, lembrando o destino. */
export function TelasDeAcesso({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROTA_DE_ENTRADA} element={<TelaDeEntrada aoAcessarDemonstracao={aoAcessarDemonstracao} />} />
        <Route path={ROTA_DE_CADASTRO} element={<TelaDeCadastro />} />
        <Route path="*" element={<IrParaEntrada />} />
      </Routes>
    </BrowserRouter>
  )
}

function IrParaEntrada() {
  const { pathname, search } = useLocation()
  return <Navigate to={enderecoDeEntrada(pathname + search)} replace />
}

function TelaDeEntrada({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  const { entrarComLink, carregando } = useAutenticacao()
  const [email, setEmail] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setMensagem('')
    setErro('')
    try {
      await entrarComLink(email, destinoDepoisDoAcesso() ?? '/')
      setMensagem('Se este e-mail já tem acesso, enviaremos um link seguro para entrar.')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível iniciar a sessão.')
    }
  }

  return (
    <CascaDeAcesso>
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <div>
          <h1 className="titulo-secao text-2xl">Entrar</h1>
          <p className="mt-2 text-sm text-al-muted">Use o e-mail convidado pelo administrador. O link de acesso expira após o uso.</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm" htmlFor="email-acesso">E-mail
          <input id="email-acesso" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="campo h-10 bg-al-bg px-3 text-al-ink" />
        </label>
        {mensagem && <p role="status" className="text-sm text-al-sucesso">{mensagem}</p>}
        {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
        <Button type="submit" disabled={carregando}>{carregando ? 'Enviando…' : 'Enviar link de acesso'}</Button>
        <p className="text-sm text-al-muted">Ainda não tem conta? <Link to={{ pathname: ROTA_DE_CADASTRO, search: window.location.search }} className="text-al-accent underline">Criar conta</Link></p>
        {aoAcessarDemonstracao && (
          <>
            <div className="relative my-1 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-al-line" />
              </div>
              <span className="relative bg-al-bg px-2 text-xs uppercase tracking-wider text-al-muted">ou</span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={aoAcessarDemonstracao}
              className="border-al-accent/40 text-al-accent hover:bg-al-accent/10"
            >
              Abrir Demonstração (sem login)
            </Button>
          </>
        )}
      </form>
    </CascaDeAcesso>
  )
}

/**
 * A moldura das telas de acesso: no desktop, o formulário de um lado e a proposta da Althius do outro; no celular,
 * uma coluna só, com o logo acima do formulário.
 */
export function CascaDeAcesso({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-al-bg text-al-ink lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-4 py-8 sm:px-10 lg:px-16">
        <Logo className="h-5 self-start" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside aria-label="Sobre a Althius" className="hidden flex-col justify-center gap-6 border-l border-al-line bg-al-surface px-16 lg:flex">
        <p className="rotulo text-al-accent">Revenue OS</p>
        <p className="titulo-secao max-w-md text-3xl leading-tight">Opere o go-to-market da sua empresa com agentes especialistas.</p>
        <p className="max-w-md text-sm text-al-muted">ICP, Personas, Contas-alvo, Sinais e Sequências num só Workspace, com você aprovando o que importa.</p>
      </aside>
    </main>
  )
}

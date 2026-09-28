import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from '@/components/marca'
import { MemoriaDosConvites } from './convite-do-acesso'
import { ROTA_DE_CADASTRO, ROTA_DE_ENTRADA, ROTA_DE_REDEFINICAO_DA_SENHA, ROTA_DO_CONVITE, ROTA_ESQUECI_A_SENHA, enderecoDeEntrada } from './destino'
import { TelaDeCadastro } from './tela-de-cadastro'
import { TelaDeEntrada } from './tela-de-entrada'
import { TelaDoConvite } from './tela-do-convite'
import { LinkDeRedefinicaoInvalido, TelaEsqueciASenha } from './tela-esqueci-a-senha'

/**
 * As telas para quem ainda não tem sessão. O link de um convite mostra o convite; qualquer outro endereço leva a
 * /entrar, lembrando o destino.
 */
export function TelasDeAcesso({ aoAcessarDemonstracao }: { aoAcessarDemonstracao?: () => void }) {
  return (
    <BrowserRouter>
      <MemoriaDosConvites>
        <Routes>
          <Route path={`${ROTA_DO_CONVITE}/:token`} element={<CascaDeAcesso><TelaDoConvite /></CascaDeAcesso>} />
          <Route path={ROTA_DE_ENTRADA} element={<CascaDeAcesso><TelaDeEntrada aoAcessarDemonstracao={aoAcessarDemonstracao} /></CascaDeAcesso>} />
          <Route path={ROTA_DE_CADASTRO} element={<TelaDeCadastro />} />
          <Route path={ROTA_ESQUECI_A_SENHA} element={<CascaDeAcesso><TelaEsqueciASenha /></CascaDeAcesso>} />
          <Route path={ROTA_DE_REDEFINICAO_DA_SENHA} element={<CascaDeAcesso><LinkDeRedefinicaoInvalido /></CascaDeAcesso>} />
          <Route path="*" element={<IrParaEntrada />} />
        </Routes>
      </MemoriaDosConvites>
    </BrowserRouter>
  )
}

function IrParaEntrada() {
  const { pathname, search } = useLocation()
  return <Navigate to={enderecoDeEntrada(pathname + search)} replace />
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

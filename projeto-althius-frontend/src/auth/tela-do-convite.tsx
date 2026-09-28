import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { ROTULO_DO_PAPEL } from '@/fonte/regras'
import { CarregandoOConvite, FalhaAoCarregarOConvite, useConviteDoAcesso } from './convite-do-acesso'
import { ROTA_DE_CADASTRO, ROTA_DE_ENTRADA, ROTA_DO_CONVITE } from './destino'

/** O que dizer de um convite que não pode mais ser aceito, pelo estado que a prévia devolveu. */
const CONVITE_ENCERRADO = {
  expirado: {
    titulo: 'Convite expirado',
    texto: 'Este convite expirou. Peça um novo convite a um Administrador do Workspace.',
  },
  revogado: {
    titulo: 'Convite revogado',
    texto: 'Este convite foi revogado por um Administrador do Workspace. Peça um novo convite, se ainda precisar do acesso.',
  },
  desconhecido: {
    titulo: 'Convite não encontrado',
    texto: 'Este link de convite não é válido. Confira se o link está completo ou peça um novo convite.',
  },
}

/**
 * `/convite/<token>` sem sessão: diz de qual Workspace é o convite, com qual papel e para qual e-mail, e leva ao
 * cadastro ou à entrada com esse e-mail travado e o convite como destino. Um convite que não vale mais é explicado.
 */
export function TelaDoConvite() {
  const convite = useConviteDoAcesso()

  // Um endereço que não traz um token legível (`/convite/%`) não é convite: vai à entrada normal.
  if (convite.estado === 'sem-convite') return <Navigate to={ROTA_DE_ENTRADA} replace />
  if (convite.estado === 'carregando') return <CarregandoOConvite />
  if (convite.estado === 'falha') {
    return (
      <Secao titulo="Convite">
        <FalhaAoCarregarOConvite mensagem={convite.mensagem} tentarDeNovo={convite.tentarDeNovo} />
      </Secao>
    )
  }

  const { token, previa } = convite
  // O convite volta a ser o destino depois do cadastro ou da entrada, que o aceitam com a sessão do e-mail convidado.
  const destino = `?${new URLSearchParams({ destino: `${ROTA_DO_CONVITE}/${encodeURIComponent(token)}` })}`

  if (previa.estado === 'pendente') {
    return (
      <Secao titulo={`Convite para o Workspace ${previa.workspace}`}>
        <p className="text-sm text-al-muted">
          Você foi convidado para o Workspace <strong className="text-al-ink">{previa.workspace}</strong> como{' '}
          <strong className="text-al-ink">{ROTULO_DO_PAPEL[previa.papel]}</strong>. Este convite é para{' '}
          <strong className="text-al-ink">{previa.email}</strong>.
        </p>
        <p className="text-sm text-al-muted">
          Para aceitar, crie sua conta ou entre com este e-mail. Você também terá seu Workspace pessoal.
        </p>
        <Link to={{ pathname: ROTA_DE_CADASTRO, search: destino }} className={buttonVariants()}>Criar conta com este e-mail</Link>
        <Link to={{ pathname: ROTA_DE_ENTRADA, search: destino }} className={buttonVariants({ variant: 'outline' })}>
          Já tenho conta: entrar
        </Link>
      </Secao>
    )
  }

  if (previa.estado === 'aceito') {
    return (
      <Secao titulo="Convite já aceito">
        <p className="text-sm text-al-muted">
          Este convite já foi aceito. Entre com a conta do e-mail convidado para abrir o Workspace.
        </p>
        <Link to={{ pathname: ROTA_DE_ENTRADA, search: destino }} className={buttonVariants()}>Entrar</Link>
      </Secao>
    )
  }

  const { titulo, texto } = CONVITE_ENCERRADO[previa.estado]
  return (
    <Secao titulo={titulo}>
      <p className="text-sm text-al-muted">{texto}</p>
      <p className="text-sm text-al-muted">
        Já tem conta? <Link to={ROTA_DE_ENTRADA} className="text-al-accent underline">Entrar</Link>
      </p>
    </Secao>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby="titulo-do-convite" className="flex flex-col gap-5">
      <h1 id="titulo-do-convite" className="titulo-secao text-2xl">{titulo}</h1>
      {children}
    </section>
  )
}

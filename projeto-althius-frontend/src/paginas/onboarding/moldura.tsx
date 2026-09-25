import type { ReactNode } from 'react'
import { Logo } from '@/components/marca'
import type { EtapaDeOnboarding } from '@/fonte/onboarding-tipos'
import { etapasDoRamo } from '@/fonte/regras-onboarding'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, type PropsDaEtapa } from './componentes'
import { TrocaDeRamoDaDemonstracao } from './troca-de-ramo'

const ROTULO_DA_ETAPA: Record<EtapaDeOnboarding, string> = {
  papel: 'Papel',
  empresa: 'Empresa',
  dominio: 'Site',
  hdyhau: 'Como nos conheceu',
  convite: 'Convite',
  checklist: 'Checklist',
}

/**
 * Todo passo tem o mesmo rodapé: Voltar à esquerda (desabilitado só no primeiro passo) e, à direita, o pulo
 * permitido e Continuar. Nenhum passo fica sem saída.
 */
export function Moldura({
  estado,
  fonte,
  titulo,
  continuar,
  pular,
  children,
}: PropsDaEtapa & {
  titulo: string
  continuar: { rotulo?: string; disabled?: boolean; aoContinuar: () => void }
  pular?: { rotulo: string; aoPular: () => void }
  children: ReactNode
}) {
  const etapas = etapasDoRamo(estado.ramo)
  const indice = etapas.indexOf(estado.etapa)
  const lendoOSite = estado.leitura.situacao === 'lendo' && estado.etapa !== 'checklist'

  return (
    <div className="min-h-screen bg-al-bg text-al-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-3">
            <TrocaDeRamoDaDemonstracao estado={estado} fonte={fonte} />
            <span className="selo">Demonstração</span>
          </div>
        </header>
        <nav aria-label="Progresso do onboarding" className="flex flex-col gap-2">
          <p className="rotulo">
            Passo {indice + 1} de {etapas.length}
          </p>
          <ol className="flex gap-1">
            {etapas.map((etapa, posicao) => (
              <li
                key={etapa}
                aria-current={etapa === estado.etapa ? 'step' : undefined}
                title={ROTULO_DA_ETAPA[etapa]}
                className={cn('h-1 flex-1', posicao <= indice ? 'bg-al-ink' : 'bg-al-line')}
              >
                <span className="sr-only">{ROTULO_DA_ETAPA[etapa]}</span>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex flex-col gap-6">
          <h1 className="titulo-display text-3xl">{titulo}</h1>
          {children}
          {lendoOSite && (
            <p role="status" className="text-sm text-al-muted">
              Lendo o site {estado.dominio}. Você pode seguir enquanto isso.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-al-line pt-6">
            <button type="button" className={BOTAO_SECUNDARIO} disabled={indice <= 0} onClick={() => void fonte.voltar()}>
              Voltar
            </button>
            <div className="flex flex-wrap gap-2">
              {pular && (
                <button type="button" className={BOTAO_SECUNDARIO} onClick={pular.aoPular}>
                  {pular.rotulo}
                </button>
              )}
              <button
                type="button"
                className={BOTAO_PRIMARIO}
                disabled={continuar.disabled}
                onClick={continuar.aoContinuar}
              >
                {continuar.rotulo ?? 'Continuar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// O checklist do Norte: o Contexto da empresa e o Sinal, o progresso do onboarding e os próximos passos depois deles.
import { Check, Circle } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoDoWorkspace } from '@/components/logos'
import type { ContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'
import { ENDERECO_DO_CONTEXTO } from '@/fonte/contexto-no-onboarding'
import type { EstadoDeOnboarding, ItemDoChecklist, MarcoDoOnboarding, SituacaoDoItem } from '@/fonte/onboarding-tipos'
import { criaOWorkspace, progressoDoOnboarding } from '@/fonte/regras-onboarding'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, type PropsDaEtapa } from './componentes'
import { PainelDoContextoNoOnboarding, useContextoComAndamento } from './contexto-no-onboarding'
import { Moldura } from './moldura'

const ROTULO_DA_SITUACAO: Record<SituacaoDoItem, string> = {
  pendente: 'Pendente',
  concluido: 'Concluído',
  pulado: 'Pulado',
}

const NOME_DO_ITEM: Record<ItemDoChecklist, string> = {
  contexto: '1. Contexto da empresa',
  sinal: '2. Sinal',
}

const ROTULO_DO_PULO: Record<ItemDoChecklist, string> = {
  contexto: 'Pular contexto',
  sinal: 'Pular Sinal',
}

const ROTULO_DO_MARCO: Record<MarcoDoOnboarding, string> = {
  workspace: 'Workspace',
  site: 'Site e logo',
  contexto: 'Contexto da empresa',
  sinal: 'Sinal',
}

/** Por que o próximo marco importa, na chamada do progresso do onboarding. */
const CHAMADA_DO_MARCO: Record<MarcoDoOnboarding, string> = {
  workspace: 'É onde os Agentes trabalham.',
  site: 'Dá o logo do Workspace e a leitura que escreve o Contexto da empresa.',
  contexto: 'Diz o que você vende, para quem e quem compra.',
  sinal: 'Mostra a hora de abordar uma Conta-alvo.',
}

export function EtapaChecklist({ estado, fonte }: PropsDaEtapa) {
  const navegar = useNavigate()
  const { dados: contexto } = useContextoComAndamento()
  const contextoVigente = !!contexto?.vigente

  async function concluir() {
    await fonte.concluirOnboarding()
    navegar('/')
  }

  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Checklist do Norte"
      continuar={{ rotulo: 'Concluir onboarding', aoContinuar: () => void concluir() }}
    >
      {estado.workspace ? (
        <div className="flex items-center gap-3">
          <LogoDoWorkspace nome={estado.workspace.nomeSugerido} endereco={estado.logoDoSite} />
          <p>Workspace: {estado.workspace.nomeSugerido}. Criado para você, sem nenhuma Conta-alvo.</p>
        </div>
      ) : (
        <p>Você entra no Workspace para o qual foi convidado. A empresa do Cliente fica como está.</p>
      )}
      <p>A ordem do Norte: Contexto da empresa, depois Sinal.</p>
      <PainelDoProgresso estado={estado} contextoVigente={contextoVigente} />
      <ol aria-label="Checklist do Norte" className="flex flex-col gap-4">
        <ItemContexto estado={estado} fonte={fonte} contexto={contexto} />
        <ItemSinal estado={estado} fonte={fonte} />
      </ol>
      <ProximosPassos />
    </Moldura>
  )
}

/**
 * O Contexto da empresa conta como concluído pela versão vigente dele. Quem criou o Workspace acompanha a leitura do
 * site; quem foi convidado só vê se ele já vale e onde consultá-lo.
 */
function ItemContexto({ estado, fonte, contexto }: PropsDaEtapa & { contexto: ContextoDaEmpresa | undefined }) {
  return (
    <Item item="contexto" estado={estado} fonte={fonte} concluido={!!contexto?.vigente} acoes={null}>
      {criaOWorkspace(estado.ramo) ? (
        <PainelDoContextoNoOnboarding contexto={contexto} />
      ) : (
        <p>
          {contexto?.vigente
            ? 'O Contexto da empresa já vale: consulte em Configurações o que a empresa vende, os clientes ideais e as Personas.'
            : 'Um Administrador do Workspace ainda vai gerar o Contexto da empresa em Configurações.'}{' '}
          <Link className="font-medium underline underline-offset-4" to={ENDERECO_DO_CONTEXTO}>
            Abrir em Configurações
          </Link>
        </p>
      )}
    </Item>
  )
}

function ItemSinal({ estado, fonte }: PropsDaEtapa) {
  const navegar = useNavigate()

  function abrirSinais() {
    void fonte.pedirRetornoAoChecklist()
    void fonte.registrarVisitaASinais()
    navegar('/sinais')
  }

  return (
    <Item
      item="sinal"
      estado={estado}
      fonte={fonte}
      acoes={
        <button type="button" className={BOTAO_PRIMARIO} onClick={abrirSinais}>
          Abrir Sinais
        </button>
      }
    >
      <p>
        Abra Sinais para ver como um Sinal indica a hora de abordar uma Conta-alvo. Abrir a página basta: não é preciso
        criar um Monitoramento.
      </p>
    </Item>
  )
}

/**
 * Quanto do onboarding já está completo, com um segmento por marco na ordem do Norte e a chamada para o próximo que
 * falta. Um item pulado não conta. A 100%, comemora.
 */
function PainelDoProgresso({ estado, contextoVigente }: { estado: EstadoDeOnboarding; contextoVigente: boolean }) {
  const { marcos, percentual, proximo } = progressoDoOnboarding(estado, contextoVigente)
  const completo = proximo === null
  return (
    <section
      aria-label="Onboarding completo"
      className={cn('rounded-xl flex flex-col gap-3 border p-4', completo ? 'border-al-ink' : 'border-al-line')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="rotulo">Onboarding completo</p>
        <p className="titulo-display text-3xl tabular-nums">{percentual}%</p>
      </div>
      <div
        role="progressbar"
        aria-label="Onboarding completo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual}
        aria-valuetext={`${percentual}% completo`}
        className="flex gap-1"
      >
        {marcos.map(({ marco, feito }) => (
          <span
            key={marco}
            className={cn('h-1.5 flex-1 transition-colors duration-500', feito ? 'bg-al-ink' : 'bg-al-line')}
          />
        ))}
      </div>
      <ul aria-label="Marcos do onboarding" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {marcos.map(({ marco, feito }) => (
          <li
            key={marco}
            aria-label={`${ROTULO_DO_MARCO[marco]}: ${feito ? 'feito' : 'falta'}`}
            className={cn('flex items-center gap-1.5', feito ? 'text-al-ink' : 'text-al-muted')}
          >
            {feito ? (
              <Check strokeWidth={2} className="size-3.5" aria-hidden />
            ) : (
              <Circle strokeWidth={1.5} className="size-3.5" aria-hidden />
            )}
            {ROTULO_DO_MARCO[marco]}
          </li>
        ))}
      </ul>
      <p aria-live="polite">
        {completo ? (
          <span className="flex animate-in items-center gap-2 font-medium duration-500 fade-in-0 zoom-in-95">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-al-ink text-al-bg">
              <Check strokeWidth={2.5} className="size-4" aria-hidden />
            </span>
            Onboarding 100% completo: Contexto da empresa e Sinal concluídos.
          </span>
        ) : (
          `Próximo: ${ROTULO_DO_MARCO[proximo]}. ${CHAMADA_DO_MARCO[proximo]}`
        )}
      </p>
    </section>
  )
}

/** Depois do Sinal, o caminho do Norte segue pelas experiências que já existem no App. */
function ProximosPassos() {
  return (
    <section aria-labelledby="proximos-passos" className="flex flex-col gap-3">
      <h2 id="proximos-passos" className="titulo-secao text-lg">
        Depois do checklist
      </h2>
      <ol aria-label="Próximos passos" className="flex flex-col gap-3">
        <li className="rounded-xl flex flex-col gap-1 border border-al-line p-4">
          <Link to="/sinais?vista=encontrados" className="font-medium underline underline-offset-4">
            Ver Contas-alvo com Sinal
          </Link>
          <p className="text-sm text-al-muted">As Contas-alvo com Sinal encontrado vêm primeiro.</p>
        </li>
        <li className="rounded-xl flex flex-col gap-1 border border-al-line p-4">
          <Link to="/sequencias" className="font-medium underline underline-offset-4">
            Criar a Sequência
          </Link>
          <p className="text-sm text-al-muted">Com a Conta-alvo escolhida, monte a Sequência de abordagem.</p>
        </li>
      </ol>
      <p className="text-sm text-al-muted">Reunião no App segue só como status de demonstração.</p>
    </section>
  )
}

/**
 * Um item do checklist, com a situação dele, as ações próprias e o pulo enquanto ele não está concluído. `concluido`
 * vale para o item que conta por fora da Fonte de onboarding, como o Contexto da empresa.
 */
function Item({
  item,
  estado,
  fonte,
  concluido: concluidoFora = false,
  acoes,
  children,
}: PropsDaEtapa & { item: ItemDoChecklist; concluido?: boolean; acoes: ReactNode; children: ReactNode }) {
  const situacao = concluidoFora ? 'concluido' : estado.checklist[item]
  const concluido = situacao === 'concluido'
  const nome = NOME_DO_ITEM[item]
  return (
    <li
      aria-label={nome}
      className={cn('rounded-xl flex flex-col gap-3 border bg-al-surface p-4', concluido ? 'border-al-ink' : 'border-al-line')}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="titulo-secao text-lg">{nome}</h2>
        <span className={cn('selo', concluido && 'border-al-ink bg-al-ink text-al-bg')}>
          {concluido && <Check strokeWidth={2} className="size-3" aria-hidden />}
          {ROTULO_DA_SITUACAO[situacao]}
        </span>
      </div>
      {children}
      <div className="flex flex-wrap gap-2">
        {acoes}
        {!concluido && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem(item)}>
            {ROTULO_DO_PULO[item]}
          </button>
        )}
      </div>
    </li>
  )
}

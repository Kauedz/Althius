// O checklist do Norte: os três itens, o progresso do onboarding e os próximos passos depois deles.
import { Check, Circle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoDoWorkspace } from '@/components/logos'
import type {
  EstadoDeOnboarding,
  ItemDoChecklist,
  MarcoDoOnboarding,
  MiniIcpEProduto,
  SituacaoDoItem,
} from '@/fonte/onboarding-tipos'
import { criaOWorkspace, progressoDoOnboarding } from '@/fonte/regras-onboarding'
import { cn } from '@/lib/utils'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo, type PropsDaEtapa } from './componentes'
import { Moldura } from './moldura'

const ROTULO_DA_SITUACAO: Record<SituacaoDoItem, string> = {
  pendente: 'Pendente',
  concluido: 'Concluído',
  pulado: 'Pulado',
}

const NOME_DO_ITEM: Record<ItemDoChecklist, string> = {
  produto: '1. Mini-ICP e produto',
  persona: '2. Persona',
  sinal: '3. Sinal',
}

const ROTULO_DO_PULO: Record<ItemDoChecklist, string> = {
  produto: 'Pular mini-ICP',
  persona: 'Pular Persona',
  sinal: 'Pular Sinal',
}

const ROTULO_DO_MARCO: Record<MarcoDoOnboarding, string> = {
  workspace: 'Workspace',
  site: 'Site e logo',
  produto: 'Mini-ICP e produto',
  persona: 'Persona',
  sinal: 'Sinal',
}

/** Por que o próximo marco importa, na chamada do progresso do onboarding. */
const CHAMADA_DO_MARCO: Record<MarcoDoOnboarding, string> = {
  workspace: 'É onde os Agentes trabalham.',
  site: 'Dá o logo do Workspace e a leitura inicial do site.',
  produto: 'Diz para quem você vende e por que compram.',
  persona: 'Diz com quem falar em cada Conta-alvo.',
  sinal: 'Mostra a hora de abordar uma Conta-alvo.',
}

/** Os campos do item 1, na ordem da tela. */
const CAMPOS_NA_TELA: readonly { campo: keyof MiniIcpEProduto; rotulo: string }[] = [
  { campo: 'oQueVende', rotulo: 'O que você vende' },
  { campo: 'miniIcp', rotulo: 'Mini-ICP' },
  { campo: 'porQueCompram', rotulo: 'Por que compram' },
]

const SEM_MINI_ICP_E_PRODUTO: MiniIcpEProduto = { miniIcp: '', oQueVende: '', porQueCompram: '' }

const AVISO_DA_PERSONA =
  'É uma base do onboarding para começar: não muda as definições de Personas da Memória do Workspace, que só mudam por uma revisão do Ethos aprovada por um Administrador. Não é a classificação de um Contato e não é a Memória do Agente.'

export function EtapaChecklist({ estado, fonte }: PropsDaEtapa) {
  const navegar = useNavigate()

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
      {criaOWorkspace(estado.ramo) && <LeituraDoSiteNoChecklist estado={estado} fonte={fonte} />}
      <p>A ordem do Norte: mini-ICP e produto, depois Persona, depois Sinal.</p>
      <PainelDoProgresso estado={estado} />
      <ol aria-label="Checklist do Norte" className="flex flex-col gap-4">
        <ItemProduto estado={estado} fonte={fonte} />
        <ItemPersona estado={estado} fonte={fonte} />
        <ItemSinal estado={estado} fonte={fonte} />
      </ol>
      <ProximosPassos />
    </Moldura>
  )
}

function LeituraDoSiteNoChecklist({ estado, fonte }: PropsDaEtapa) {
  const { situacao } = estado.leitura
  if (situacao === 'inativa') return null
  return (
    <section aria-label="Leitura do site" className="flex flex-col gap-2 border border-al-line p-4">
      <p className="rotulo">Leitura do site</p>
      <p aria-live="polite">
        {situacao === 'lendo' && `Lendo o site ${estado.dominio}. Você pode editar os campos enquanto isso.`}
        {situacao === 'pronta' &&
          `Base sugerida pela leitura de ${estado.dominio}. Revise, edite ou descarte: o que você escrever prevalece.`}
        {situacao === 'falhou' && `Não foi possível ler o site ${estado.dominio}. Preencha os campos ou tente de novo.`}
      </p>
      {situacao === 'falhou' && (
        <button
          type="button"
          className={cn(BOTAO_SECUNDARIO, 'self-start')}
          onClick={() => void fonte.lerSite(estado.dominio)}
        >
          Tentar de novo
        </button>
      )}
    </section>
  )
}

/**
 * Os campos ficam na tela e vão para a Fonte a cada edição, para a leitura do site nunca sobrescrever o que a
 * pessoa escreveu. Quando a leitura muda de situação, a tela adota o que a Fonte tem.
 */
function useCamposDoChecklist<T>(estado: EstadoDeOnboarding, daFonte: T) {
  const [campos, setCampos] = useState(daFonte)
  const [leituraVista, setLeituraVista] = useState(estado.leitura.situacao)
  if (leituraVista !== estado.leitura.situacao) {
    setLeituraVista(estado.leitura.situacao)
    setCampos(daFonte)
  }
  return [campos, setCampos] as const
}

function ItemProduto({ estado, fonte }: PropsDaEtapa) {
  const { miniIcp, oQueVende, porQueCompram } = estado.checklist
  const [campos, setCampos] = useCamposDoChecklist<MiniIcpEProduto>(estado, { miniIcp, oQueVende, porQueCompram })
  const vazio = CAMPOS_NA_TELA.some(({ campo }) => !campos[campo].trim())

  function editar(mudanca: Partial<MiniIcpEProduto>) {
    const novos = { ...campos, ...mudanca }
    setCampos(novos)
    void fonte.salvarProduto(novos)
  }

  async function concluir() {
    await fonte.salvarProduto(campos)
    await fonte.concluirProduto()
  }

  return (
    <Item
      item="produto"
      estado={estado}
      fonte={fonte}
      acoes={
        <>
          <button type="button" className={BOTAO_PRIMARIO} disabled={vazio} onClick={() => void concluir()}>
            Concluir mini-ICP
          </button>
          <DescartarSugestao estado={estado} aoDescartar={() => editar(SEM_MINI_ICP_E_PRODUTO)} />
        </>
      }
    >
      {CAMPOS_NA_TELA.map(({ campo, rotulo }) => (
        <Campo key={campo} rotulo={rotulo}>
          <textarea
            className="campo min-h-20"
            aria-label={rotulo}
            value={campos[campo]}
            onChange={(evento) => editar({ [campo]: evento.target.value })}
          />
        </Campo>
      ))}
    </Item>
  )
}

function ItemPersona({ estado, fonte }: PropsDaEtapa) {
  // Na tela, as Personas são um texto com uma por linha; na Fonte, uma lista.
  const [texto, setTexto] = useCamposDoChecklist(estado, estado.checklist.personas.join('\n'))

  function editar(novo: string) {
    setTexto(novo)
    void fonte.salvarPersonas(novo.split('\n'))
  }

  async function concluir() {
    await fonte.salvarPersonas(texto.split('\n'))
    await fonte.concluirPersona()
  }

  return (
    <Item
      item="persona"
      estado={estado}
      fonte={fonte}
      acoes={
        <>
          <button type="button" className={BOTAO_PRIMARIO} disabled={!texto.trim()} onClick={() => void concluir()}>
            Concluir Persona
          </button>
          <DescartarSugestao estado={estado} aoDescartar={() => editar('')} />
        </>
      }
    >
      <p>As Personas possíveis do Workspace, considerando para quem você vende. Uma por linha. {AVISO_DA_PERSONA}</p>
      <Campo rotulo="Personas possíveis">
        <textarea
          className="campo min-h-24"
          aria-label="Personas possíveis"
          value={texto}
          onChange={(evento) => editar(evento.target.value)}
        />
      </Campo>
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

/** Depois de uma leitura do site, a sugestão de um item pode ser descartada. */
function DescartarSugestao({ estado, aoDescartar }: { estado: EstadoDeOnboarding; aoDescartar: () => void }) {
  if (!estado.leitura.resultado) return null
  return (
    <button type="button" className={BOTAO_SECUNDARIO} onClick={aoDescartar}>
      Descartar sugestão
    </button>
  )
}

/**
 * Quanto do onboarding já está completo, com um segmento por marco na ordem do Norte e a chamada para o próximo que
 * falta. Um item pulado não conta. A 100%, comemora.
 */
function PainelDoProgresso({ estado }: { estado: EstadoDeOnboarding }) {
  const { marcos, percentual, proximo } = progressoDoOnboarding(estado)
  const completo = proximo === null
  return (
    <section
      aria-label="Onboarding completo"
      className={cn('flex flex-col gap-3 border p-4', completo ? 'border-al-ink' : 'border-al-line')}
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
            <span className="grid size-6 shrink-0 place-items-center bg-al-ink text-al-bg">
              <Check strokeWidth={2.5} className="size-4" aria-hidden />
            </span>
            Onboarding 100% completo: mini-ICP, Persona e Sinal concluídos.
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
        <li className="flex flex-col gap-1 border border-al-line p-4">
          <Link to="/sinais?vista=encontrados" className="font-medium underline underline-offset-4">
            Ver Contas-alvo com Sinal
          </Link>
          <p className="text-sm text-al-muted">As Contas-alvo com Sinal encontrado vêm primeiro.</p>
        </li>
        <li className="flex flex-col gap-1 border border-al-line p-4">
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

/** Um item do checklist, com a situação dele, as ações próprias e o pulo enquanto ele não está concluído. */
function Item({
  item,
  estado,
  fonte,
  acoes,
  children,
}: PropsDaEtapa & { item: ItemDoChecklist; acoes: ReactNode; children: ReactNode }) {
  const situacao = estado.checklist[item]
  const concluido = situacao === 'concluido'
  const nome = NOME_DO_ITEM[item]
  return (
    <li
      aria-label={nome}
      className={cn('flex flex-col gap-3 border bg-al-surface p-4', concluido ? 'border-al-ink' : 'border-al-line')}
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

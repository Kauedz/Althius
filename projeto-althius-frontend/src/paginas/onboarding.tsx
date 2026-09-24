import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoDoWorkspace } from '@/components/logos'
import { Carregando, Logo } from '@/components/marca'
import { useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import { dominioUtil, logoDoSite } from '@/fonte/dominio-do-site'
import {
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  etapasDoRamo,
  type EstadoDeOnboarding,
  type EtapaDeOnboarding,
  type FonteDeOnboarding,
  type OrigemHdyhau,
  type PapelNoDay0,
  type SituacaoDoItem,
} from '@/fonte/onboarding-tipos'
import { cn } from '@/lib/utils'

const BOTAO_PRIMARIO =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-accent bg-al-accent px-4 text-xs font-normal tracking-rotulo text-al-on-accent uppercase transition-colors hover:border-al-accent-2 hover:bg-al-accent-2 disabled:pointer-events-none disabled:opacity-50'
const BOTAO_SECUNDARIO =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-al-line bg-al-bg px-4 text-xs font-normal tracking-rotulo text-al-ink uppercase transition-colors hover:border-al-muted hover:bg-al-surface disabled:pointer-events-none disabled:opacity-50'

const ROTULO_DA_SITUACAO: Record<SituacaoDoItem, string> = {
  pendente: 'Pendente',
  concluido: 'Concluído',
  pulado: 'Pulado',
}

const ROTULO_DA_ETAPA: Record<EtapaDeOnboarding, string> = {
  papel: 'Papel',
  empresa: 'Empresa',
  dominio: 'Site',
  hdyhau: 'Como nos conheceu',
  convite: 'Convite',
  checklist: 'Checklist',
}

const AVISO_DA_PERSONA =
  'Esta definição fica na Memória do Workspace. Não é a classificação de um Contato e não é a Memória do Agente.'

/**
 * Onboarding fora da Casca. O estado vem só da Fonte de onboarding. Sem link de convite, a pessoa entra como
 * criadora; o parâmetro `convite` no endereço simula a chegada por um link de convite.
 */
export function PaginaOnboarding() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])
  const [parametros] = useSearchParams()
  const chegouPorConvite = parametros.has('convite')

  useEffect(() => {
    void fonte.dispensarRetorno()
  }, [fonte])

  const precisaIniciar = estado !== undefined && !estado.ramo
  useEffect(() => {
    if (precisaIniciar) void fonte.iniciar(chegouPorConvite ? 'convidado' : 'criador')
  }, [fonte, precisaIniciar, chegouPorConvite])

  if (!estado?.ramo) return <Carregando rotulo="Carregando onboarding" />

  switch (estado.etapa) {
    case 'papel':
      return <EtapaPapel estado={estado} fonte={fonte} />
    case 'empresa':
      return <EtapaEmpresa estado={estado} fonte={fonte} />
    case 'dominio':
      return <EtapaDominio estado={estado} fonte={fonte} />
    case 'hdyhau':
      return <EtapaHdyhau estado={estado} fonte={fonte} />
    case 'convite':
      return <EtapaConvite estado={estado} fonte={fonte} />
    case 'checklist':
      return <EtapaChecklist estado={estado} fonte={fonte} />
  }
}

/** Marca o item de Sinal quando a experiência de Sinais abre. Não cria Monitoramento. */
export function RegistrarAberturaDeSinais() {
  const fonte = useFonteDeOnboarding()
  useEffect(() => {
    void fonte.registrarVisitaASinais()
  }, [fonte])
  return null
}

/** Volta ao checklist ou à home depois de abrir Sinais a partir do item 3. */
export function RetornoDoChecklist() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])
  if (!estado?.retornoAoChecklist || estado.etapa !== 'checklist') return null

  return (
    <div
      role="region"
      aria-label="Retorno do checklist"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line px-10 py-3"
    >
      <p className="text-sm">Você abriu Sinais. Isso conclui o item de Sinal, sem criar um Monitoramento.</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/onboarding" className={BOTAO_SECUNDARIO} onClick={() => void fonte.dispensarRetorno()}>
          Voltar ao checklist
        </Link>
        <Link to="/" className={BOTAO_PRIMARIO} onClick={() => void fonte.dispensarRetorno()}>
          Ir para a home
        </Link>
      </div>
    </div>
  )
}

interface PropsDaEtapa {
  estado: EstadoDeOnboarding
  fonte: FonteDeOnboarding
}

function EtapaPapel({ estado, fonte }: PropsDaEtapa) {
  const [papel, setPapel] = useState<PapelNoDay0 | null>(estado.papel)
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é o seu papel?"
      continuar={{ disabled: !papel, aoContinuar: () => papel && void fonte.definirPapel(papel) }}
    >
      <EscolhaUnica
        rotulo="Papel"
        opcoes={PAPEIS_DO_DAY0.map((valor) => ({ valor, rotulo: valor }))}
        valor={papel}
        aoEscolher={setPapel}
      />
    </Moldura>
  )
}

function EtapaEmpresa({ estado, fonte }: PropsDaEtapa) {
  const [nome, setNome] = useState(estado.empresa)
  const sugerido = nome.trim()
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é a sua empresa?"
      continuar={{ disabled: !sugerido, aoContinuar: () => void fonte.definirEmpresa(sugerido) }}
    >
      <Campo rotulo="Empresa">
        <input
          className="campo"
          aria-label="Empresa"
          placeholder="Nome da empresa"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
        />
      </Campo>
      <p>Nome sugerido do Workspace e do Cliente: {sugerido || 'aguardando o nome'}.</p>
      <p>O Workspace é criado para você com esse nome. Nenhuma Conta-alvo nasce daqui.</p>
    </Moldura>
  )
}

function EtapaDominio({ estado, fonte }: PropsDaEtapa) {
  const [dominio, setDominio] = useState(estado.dominio)
  const host = dominioUtil(dominio)
  const nome = estado.workspace?.nomeSugerido || estado.empresa
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Qual é o site da empresa?"
      continuar={{ disabled: !host, aoContinuar: () => host && void fonte.definirDominio(host) }}
    >
      <Campo rotulo="Domínio do site">
        <input
          className="campo"
          aria-label="Domínio do site"
          inputMode="url"
          placeholder="empresa.com.br"
          value={dominio}
          onChange={(evento) => setDominio(evento.target.value)}
        />
      </Campo>
      <div className="flex items-center gap-3">
        <LogoDoWorkspace nome={nome} enderecos={host ? logoDoSite(host) : []} className="size-10" />
        <p>O logo do Workspace vem do site. Sem logo, fica a inicial de {nome}.</p>
      </div>
      <p>
        Ao continuar, a Althius lê o site para sugerir o que você vende, o ICP provável e as Personas possíveis. É só
        uma base: você revisa tudo no checklist, e pode seguir enquanto a leitura acontece.
      </p>
    </Moldura>
  )
}

function EtapaHdyhau({ estado, fonte }: PropsDaEtapa) {
  const [origem, setOrigem] = useState<OrigemHdyhau | null>(estado.comoConheceu)
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Como nos conheceu?"
      continuar={{ disabled: !origem, aoContinuar: () => origem && void fonte.definirComoConheceu(origem) }}
    >
      <EscolhaUnica
        rotulo="Como nos conheceu?"
        opcoes={ORIGENS_HDYHAU.map((valor) => ({ valor, rotulo: valor }))}
        valor={origem}
        aoEscolher={setOrigem}
      />
    </Moldura>
  )
}

function EtapaConvite({ estado, fonte }: PropsDaEtapa) {
  // Os e-mails ficam só na tela: nada é enviado nem guardado na Fonte.
  const [emails, setEmails] = useState('')
  return (
    <Moldura
      estado={estado}
      fonte={fonte}
      titulo="Convide colegas"
      continuar={{ disabled: !emails.trim(), aoContinuar: () => void fonte.confirmarConvite() }}
      pular={{ rotulo: 'Pular convite', aoPular: () => void fonte.pularConvite() }}
    >
      <p>Este passo é só demonstração. Nenhum e-mail é enviado e nenhuma Participação no Workspace é criada.</p>
      <Campo rotulo="E-mails">
        <input
          className="campo"
          aria-label="E-mails dos colegas"
          placeholder="colegas@empresa.com"
          value={emails}
          onChange={(evento) => setEmails(evento.target.value)}
        />
      </Campo>
    </Moldura>
  )
}

function EtapaChecklist({ estado, fonte }: PropsDaEtapa) {
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
          <LogoDoWorkspace nome={estado.workspace.nomeSugerido} enderecos={estado.logoDoSite} />
          <p>Workspace: {estado.workspace.nomeSugerido}. Criado para você, sem nenhuma Conta-alvo.</p>
        </div>
      ) : (
        <p>Você entra no Workspace para o qual foi convidado. A empresa do Cliente fica como está.</p>
      )}
      {estado.ramo === 'criador' && <LeituraDoSiteNoChecklist estado={estado} fonte={fonte} />}
      <p>A ordem do Norte: mini-ICP e produto, depois Persona, depois Sinal de compra.</p>
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
        <button type="button" className={cn(BOTAO_SECUNDARIO, 'self-start')} onClick={() => void fonte.lerSite()}>
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
  const { miniIcp, oQueVende, porQueCompram, produto } = estado.checklist
  const [campos, setCampos] = useCamposDoChecklist(estado, { miniIcp, oQueVende, porQueCompram })
  const vazio = !campos.miniIcp.trim() || !campos.oQueVende.trim() || !campos.porQueCompram.trim()

  function editar(mudanca: Partial<typeof campos>) {
    const novos = { ...campos, ...mudanca }
    setCampos(novos)
    void fonte.salvarProduto(novos)
  }

  async function concluir() {
    await fonte.salvarProduto(campos)
    await fonte.concluirProduto()
  }

  return (
    <Item nome="1. Mini-ICP e produto" situacao={produto}>
      <Campo rotulo="O que você vende">
        <textarea
          className="campo min-h-20"
          aria-label="O que você vende"
          value={campos.oQueVende}
          onChange={(evento) => editar({ oQueVende: evento.target.value })}
        />
      </Campo>
      <Campo rotulo="Mini-ICP">
        <textarea
          className="campo min-h-20"
          aria-label="Mini-ICP"
          value={campos.miniIcp}
          onChange={(evento) => editar({ miniIcp: evento.target.value })}
        />
      </Campo>
      <Campo rotulo="Por que compram">
        <textarea
          className="campo min-h-20"
          aria-label="Por que compram"
          value={campos.porQueCompram}
          onChange={(evento) => editar({ porQueCompram: evento.target.value })}
        />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTAO_PRIMARIO} disabled={vazio} onClick={() => void concluir()}>
          Concluir mini-ICP
        </button>
        {estado.leitura.resultado && (
          <button
            type="button"
            className={BOTAO_SECUNDARIO}
            onClick={() => editar({ miniIcp: '', oQueVende: '', porQueCompram: '' })}
          >
            Descartar sugestão
          </button>
        )}
        {produto !== 'concluido' && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('produto')}>
            Pular mini-ICP
          </button>
        )}
      </div>
    </Item>
  )
}

function ItemPersona({ estado, fonte }: PropsDaEtapa) {
  const { personas, persona } = estado.checklist
  const [texto, setTexto] = useCamposDoChecklist(estado, personas)

  function editar(novo: string) {
    setTexto(novo)
    void fonte.salvarPersonas(novo)
  }

  async function concluir() {
    await fonte.salvarPersonas(texto)
    await fonte.concluirPersona()
  }

  return (
    <Item nome="2. Persona" situacao={persona}>
      <p>As Personas possíveis do Workspace, considerando para quem você vende. Uma por linha. {AVISO_DA_PERSONA}</p>
      <Campo rotulo="Personas possíveis">
        <textarea
          className="campo min-h-24"
          aria-label="Personas possíveis"
          value={texto}
          onChange={(evento) => editar(evento.target.value)}
        />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTAO_PRIMARIO} disabled={!texto.trim()} onClick={() => void concluir()}>
          Concluir Persona
        </button>
        {estado.leitura.resultado && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => editar('')}>
            Descartar sugestão
          </button>
        )}
        {persona !== 'concluido' && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('persona')}>
            Pular Persona
          </button>
        )}
      </div>
    </Item>
  )
}

function ItemSinal({ estado, fonte }: PropsDaEtapa) {
  const navegar = useNavigate()
  const { sinal } = estado.checklist

  function abrirSinais() {
    void fonte.pedirRetornoAoChecklist()
    void fonte.registrarVisitaASinais()
    navegar('/sinais')
  }

  return (
    <Item nome="3. Sinal de compra" situacao={sinal}>
      <p>
        Abra Sinais para ver como um Sinal de compra indica a hora de abordar uma Conta-alvo. Abrir a página basta: não
        é preciso criar um Monitoramento.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTAO_PRIMARIO} onClick={abrirSinais}>
          Abrir Sinais
        </button>
        {sinal !== 'concluido' && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('sinal')}>
            Pular Sinal
          </button>
        )}
      </div>
    </Item>
  )
}

/** Depois do Sinal de compra, o caminho do Norte segue pelas experiências que já existem no App. */
function ProximosPassos() {
  return (
    <section aria-labelledby="proximos-passos" className="flex flex-col gap-3">
      <h2 id="proximos-passos" className="titulo-secao text-lg">
        Depois do checklist
      </h2>
      <ol aria-label="Próximos passos" className="flex flex-col gap-3">
        <li className="flex flex-col gap-1 border border-al-line p-4">
          <Link to="/sinais?vista=encontrados" className="font-medium underline underline-offset-4">
            Ver Contas-alvo indicadas
          </Link>
          <p className="text-sm text-al-muted">As Contas-alvo com Sinal de compra encontrado vêm primeiro.</p>
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

function Item({ nome, situacao, children }: { nome: string; situacao: SituacaoDoItem; children: ReactNode }) {
  return (
    <li aria-label={nome} className="flex flex-col gap-3 border border-al-line bg-al-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="titulo-secao text-lg">{nome}</h2>
        <span className="selo">{ROTULO_DA_SITUACAO[situacao]}</span>
      </div>
      {children}
    </li>
  )
}

/**
 * Todo passo tem o mesmo rodapé: Voltar à esquerda (desabilitado só no primeiro passo) e, à direita, o pulo
 * permitido e Continuar. Nenhum passo fica sem saída.
 */
function Moldura({
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
          <span className="selo">Demonstração</span>
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

function EscolhaUnica<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
}: {
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string }[]
  valor: T | null
  aoEscolher: (valor: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((opcao) => {
        const ativa = valor === opcao.valor
        return (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => aoEscolher(opcao.valor)}
            className={cn('border px-3 py-2 text-sm', ativa ? 'border-al-ink bg-al-ink text-al-bg' : 'border-al-line bg-al-surface')}
          >
            {opcao.rotulo}
          </button>
        )
      })}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="rotulo">{rotulo}</span>
      {children}
    </label>
  )
}

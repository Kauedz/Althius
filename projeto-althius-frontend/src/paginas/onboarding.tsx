import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Carregando, Logo } from '@/components/marca'
import { useDados, useFonteDeOnboarding } from '@/fonte/contexto'
import {
  ORIGENS_HDYHAU,
  PAPEIS_DO_DAY0,
  type EstadoDeOnboarding,
  type FonteDeOnboarding,
  type OrigemHdyhau,
  type PapelNoDay0,
  type RamoDeOnboarding,
  type SituacaoDoItem,
} from '@/fonte/onboarding-tipos'
import { dominioUtil, lerEmpresa } from '@/fonte/simulada-onboarding'
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

const RAMOS: readonly { valor: RamoDeOnboarding; rotulo: string }[] = [
  { valor: 'criador', rotulo: 'Criar um Workspace' },
  { valor: 'convidado', rotulo: 'Fui convidado para um Workspace' },
]

/** Onboarding fora da Casca. O estado vem só da Fonte de onboarding. */
export function PaginaOnboarding() {
  const fonte = useFonteDeOnboarding()
  const estado = useDados(fonte, (f) => f.ler(), [])

  useEffect(() => {
    void fonte.dispensarRetorno()
  }, [fonte])

  if (!estado) return <Carregando rotulo="Carregando onboarding" />

  switch (estado.etapa) {
    case 'ramo':
      return <EtapaRamo fonte={fonte} />
    case 'papel':
      return <EtapaPapel estado={estado} fonte={fonte} />
    case 'empresa':
      return <EtapaEmpresa estado={estado} fonte={fonte} />
    case 'hdyhau':
      return <EtapaHdyhau estado={estado} fonte={fonte} />
    case 'convite':
      return <EtapaConvite fonte={fonte} />
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

function EtapaRamo({ fonte }: { fonte: FonteDeOnboarding }) {
  const [ramo, setRamo] = useState<RamoDeOnboarding | null>(null)
  return (
    <Moldura
      titulo="Como você entra"
      acoes={<Continuar disabled={!ramo} aoContinuar={() => ramo && void fonte.escolherRamo(ramo)} />}
    >
      <EscolhaUnica rotulo="Como você entra" opcoes={RAMOS} valor={ramo} aoEscolher={setRamo} />
    </Moldura>
  )
}

function EtapaPapel({ estado, fonte }: { estado: EstadoDeOnboarding; fonte: FonteDeOnboarding }) {
  const [papel, setPapel] = useState<PapelNoDay0 | null>(estado.papel)
  return (
    <Moldura
      titulo="Qual é o seu papel?"
      acoes={<Continuar disabled={!papel} aoContinuar={() => papel && void fonte.definirPapel(papel)} />}
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

function EtapaEmpresa({ estado, fonte }: { estado: EstadoDeOnboarding; fonte: FonteDeOnboarding }) {
  const [dominio, setDominio] = useState(estado.dominio)
  const [nome, setNome] = useState(estado.empresa)
  const leitura = lerEmpresa(dominio, nome)
  const host = dominioUtil(dominio)
  return (
    <Moldura
      titulo="Qual é o domínio?"
      acoes={
        <Continuar
          disabled={!leitura}
          aoContinuar={() => leitura && void fonte.definirCliente({ dominio: leitura.dominio, nome })}
        />
      }
    >
      <Campo rotulo="Domínio">
        <input
          className="campo"
          aria-label="Domínio"
          inputMode="url"
          placeholder="empresa.com"
          value={dominio}
          onChange={(evento) => setDominio(evento.target.value)}
        />
      </Campo>
      <Campo rotulo="Nome">
        <input
          className="campo"
          aria-label="Nome"
          placeholder="Opcional. Sem ele, o nome sai do domínio."
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
        />
      </Campo>
      {leitura ? (
        <div className="flex items-center gap-3">
          <img src={leitura.logoUrl} alt={`Logo de ${leitura.nome}`} className="size-8 object-contain" />
          <p>Nome sugerido do Workspace e do Cliente: {leitura.nome}.</p>
        </div>
      ) : (
        <p>Nome sugerido do Workspace e do Cliente: {host ? 'lendo o domínio' : 'aguardando o domínio'}.</p>
      )}
      <p>
        O domínio tem prioridade. A leitura simulada usa o favicon como logo e preenche o checklist com o contexto do
        Cliente. Nenhuma Conta-alvo nasce daqui.
      </p>
    </Moldura>
  )
}

function EtapaHdyhau({ estado, fonte }: { estado: EstadoDeOnboarding; fonte: FonteDeOnboarding }) {
  const [origem, setOrigem] = useState<OrigemHdyhau | null>(estado.comoConheceu)
  return (
    <Moldura
      titulo="Como você conheceu a Althius?"
      acoes={<Continuar disabled={!origem} aoContinuar={() => origem && void fonte.definirComoConheceu(origem)} />}
    >
      <EscolhaUnica
        rotulo="Como você conheceu a Althius?"
        opcoes={ORIGENS_HDYHAU.map((valor) => ({ valor, rotulo: valor }))}
        valor={origem}
        aoEscolher={setOrigem}
      />
    </Moldura>
  )
}

function EtapaConvite({ fonte }: { fonte: FonteDeOnboarding }) {
  return (
    <Moldura
      titulo="Convide colegas"
      acoes={
        <button type="button" className={BOTAO_PRIMARIO} onClick={() => void fonte.pularConvite()}>
          Pular convite
        </button>
      }
    >
      <p>
        Este passo é só demonstração. Nenhum e-mail é enviado e nenhuma Participação no Workspace é criada.
      </p>
      <Campo rotulo="E-mails">
        <input className="campo" aria-label="E-mails dos colegas" placeholder="colegas@empresa.com" />
      </Campo>
    </Moldura>
  )
}

function EtapaChecklist({ estado, fonte }: { estado: EstadoDeOnboarding; fonte: FonteDeOnboarding }) {
  const navegar = useNavigate()
  const [campos, setCampos] = useState({
    miniIcp: estado.checklist.miniIcp,
    oQueVende: estado.checklist.oQueVende,
    porQueCompram: estado.checklist.porQueCompram,
  })
  const produtoVazio = !campos.miniIcp.trim() || !campos.oQueVende.trim() || !campos.porQueCompram.trim()

  async function concluirProduto() {
    await fonte.salvarProduto(campos)
    await fonte.concluirProduto()
  }

  function abrirSinais() {
    void fonte.pedirRetornoAoChecklist()
    void fonte.registrarVisitaASinais()
    navegar('/sinais')
  }

  return (
    <Moldura
      titulo="Checklist do Norte"
      acoes={
        <Link to="/" className={BOTAO_PRIMARIO}>
          Ir para a home
        </Link>
      }
    >
      {estado.workspace?.nomeSugerido ? (
        <div className="flex items-center gap-3">
          {estado.logoUrl && (
            <img src={estado.logoUrl} alt={`Logo de ${estado.workspace.nomeSugerido}`} className="size-8 object-contain" />
          )}
          <p>
            Workspace sugerido: {estado.workspace.nomeSugerido}
            {estado.dominio ? `, lido de ${estado.dominio}` : ''}. Nenhuma Conta-alvo foi criada.
          </p>
        </div>
      ) : (
        <p>Você entra no Workspace para o qual foi convidado. A empresa do Cliente fica como está.</p>
      )}
      {estado.contextoDaIa && (
        <section aria-label="Contexto para os Agentes" className="border border-al-line p-4">
          <p className="rotulo">Contexto para os Agentes</p>
          <p>{estado.contextoDaIa}</p>
        </section>
      )}
      <p>
        A ordem é mini-ICP e produto, depois Persona, depois Sinal. Em seguida vêm Conta-alvo com Sinal, Cadência e
        reunião. Cadência fica de fora deste checklist. Reunião no App segue só como status de demonstração.
      </p>
      <ol aria-label="Checklist do Norte" className="flex flex-col gap-4">
        <Item nome="1. Mini-ICP e produto" situacao={estado.checklist.produto}>
          <Campo rotulo="Mini-ICP">
            <textarea
              className="campo min-h-20"
              aria-label="Mini-ICP"
              value={campos.miniIcp}
              onChange={(evento) => setCampos({ ...campos, miniIcp: evento.target.value })}
            />
          </Campo>
          <Campo rotulo="O que você vende">
            <textarea
              className="campo min-h-20"
              aria-label="O que você vende"
              value={campos.oQueVende}
              onChange={(evento) => setCampos({ ...campos, oQueVende: evento.target.value })}
            />
          </Campo>
          <Campo rotulo="Por que compram">
            <textarea
              className="campo min-h-20"
              aria-label="Por que compram"
              value={campos.porQueCompram}
              onChange={(evento) => setCampos({ ...campos, porQueCompram: evento.target.value })}
            />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO_PRIMARIO} disabled={produtoVazio} onClick={() => void concluirProduto()}>
              Concluir mini-ICP
            </button>
            {estado.checklist.produto !== 'concluido' && (
              <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('produto')}>
                Pular mini-ICP
              </button>
            )}
          </div>
        </Item>
        <Item nome="2. Persona" situacao={estado.checklist.persona}>
          <p>{estado.checklist.personaTexto}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO_PRIMARIO} onClick={() => void fonte.concluirPersona()}>
              Concluir Persona
            </button>
            {estado.checklist.persona !== 'concluido' && (
              <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('persona')}>
                Pular Persona
              </button>
            )}
          </div>
        </Item>
        <Item nome="3. Sinal" situacao={estado.checklist.sinal}>
          <p>{estado.checklist.sinalTexto}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO_PRIMARIO} onClick={abrirSinais}>
              Abrir Sinais
            </button>
            {estado.checklist.sinal !== 'concluido' && (
              <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.pularItem('sinal')}>
                Pular Sinal
              </button>
            )}
          </div>
        </Item>
      </ol>
    </Moldura>
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

function Moldura({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-al-bg text-al-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <span className="selo">Demonstração</span>
        </header>
        <div className="flex flex-col gap-6">
          <h1 className="titulo-display text-3xl">{titulo}</h1>
          {children}
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
      </div>
    </div>
  )
}

function Continuar({ disabled, aoContinuar }: { disabled?: boolean; aoContinuar: () => void }) {
  return (
    <button type="button" className={BOTAO_PRIMARIO} disabled={disabled} onClick={aoContinuar}>
      Continuar
    </button>
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

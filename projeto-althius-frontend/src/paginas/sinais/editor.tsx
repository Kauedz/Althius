import { Plus, Sparkles, X } from 'lucide-react'
import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Carregando, Pulso } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Opcao } from '@/components/opcao'
import { textoDaAgenda } from '@/fonte/agenda-do-sinal'
import { useAmbiente, useDados, useDadosDeContas, useDadosDeSinais, useFonteDeSinais } from '@/fonte/contexto'
import { formatarDiaIsoPorExtenso } from '@/fonte/formatar-data'
import { CRITERIOS_DOS_SINAIS_INTERNOS, TIPOS_INTERNOS_REAIS } from '@/fonte/sinais-reais-mapa'
import { publicoRecomendado } from '@/fonte/regras-memoria'
import { cn } from '@/lib/utils'
import {
  CAMPOS,
  ROTULO_DA_ORIGEM,
  TIPO_PERSONALIZADO,
  criteriosIniciais,
  familiaDoTipo,
  formularioDoTipo,
  tipoPorId,
  type Campo,
  type Criterios,
  type Formulario,
  type Origem,
  type TipoDeSinal,
} from './catalogo'
import { SecaoDoFormulario, SeloDoEstado } from './componentes'
import { LISTAS, VALIDADE_EM_DIAS, publicoInicial, type ModoDePublico, type Monitoramento, type Publico } from './dados-mock'
import { ajudaDoCusto, cardPorId, cardQueConta, cargosDoNicho } from './catalogo-visivel'
import { sinalArquivado } from './arquivados'
import { useCatalogoFuncional } from './catalogo-funcional'
import { NICHOS } from './nichos'
import {
  MAX_CARGOS_CUSTOM,
  MAX_TEXTO_CUSTOM,
  NICHO_CUSTOM,
  adicionarCargosCustom,
  cargosCustom,
  limparTextoCustom,
  manterCargosCustom,
} from './criterios-custom'
import { podeMonitorar } from './disponibilidade'
import {
  ESTADOS_DO_BRASIL,
  PAISES_DO_MERCADO,
  comEstado,
  comPais,
  custoDoMercado,
  estadoDoMercado,
  noMercado,
  paisDoMercado,
  resumoDoMercado,
  trocarEscopo,
} from './mercado-enderecavel'
import { useSinaisDoMockup } from './estado'
import { PerfilPersonalizado } from './perfil-personalizado'
import { AgendaDoSinalNoMonitoramento } from './agenda'
import { AtivarSinal } from './ativar-sinal'
import { AvisoDePausaPorCreditos, AvisoDeRodadaPulada } from './aviso-de-pausa'
import { RodadasDoMonitoramento, RodarAgora } from './rodadas'
import { useRodadas } from './usar-rodadas'
import { ResumoDoPlano } from './resumo-do-plano'
import { criteriosFormatados, resumoDasContas, resumoDoPublico } from './resumos'

type Etapa = 'descrever' | 'preparando' | 'editar' | 'revisar'

/** Monitoramento ainda sem id: no operacional o uuid nasce no banco, e um `novo-…` iria em `p_id`. */
type MonitoramentoNoEditor = Omit<Monitoramento, 'id'> & { id?: string }

const ROTULO_DO_MODO: Record<ModoDePublico, string> = {
  listas: 'Acompanhar listas',
  descoberta: 'Descobrir por perfil',
  ambos: 'Listas e descoberta',
}

const DESCRICAO_DO_MODO: Record<ModoDePublico, string> = {
  listas: 'Só as Contas-alvo que você já importou.',
  descoberta: 'Novas empresas com o perfil escolhido, que entram como recomendadas.',
  ambos: 'As suas listas e novas empresas no mesmo Monitoramento.',
}

/** A preparação simulada de um personalizado: transforma a descrição em critérios editáveis por cenários simulados. */
function prepararCriterios(descricao: string, fonte?: string): string[] {
  const pedido = descricao.trim().replace(/\.$/, '')
  const d = pedido.toLowerCase()
  const fonteCriterio = fonte?.trim() ? `Observar em: ${fonte.trim()}` : undefined

  // Cenário simulado: Custo de nuvem ou infraestrutura
  if (d.includes('custo') || d.includes('nuvem') || d.includes('data warehouse') || d.includes('infraestrutura')) {
    return [
      'Liderança técnica ou financeira mencionando custo alto ou imprevisível de nuvem ou data warehouse',
      fonteCriterio ?? 'Observar em: publicações em redes profissionais, fóruns técnicos ou entrevistas',
      'Dispara na primeira observação; reencontrar o mesmo acontecimento não conta de novo',
      'Guardar como evidência o trecho da publicação com cargo e menção a custo',
    ]
  }

  // Cenário simulado: Entrega, frete, agendamento ou varejo
  if (d.includes('agendamento') || d.includes('entrega') || d.includes('frete') || d.includes('varejist')) {
    return [
      'Varejista ou rede que não disponibiliza agendamento ou estimativa de entrega no fluxo público',
      fonteCriterio ?? 'Observar em: site institucional, página de frete e etapas de checkout da empresa',
      'Dispara na primeira observação; reencontrar o mesmo acontecimento não conta de novo',
      'Guardar como evidência a captura da página ou etapa de entrega sem a funcionalidade',
    ]
  }

  // Cenário simulado: Verificações e testes deliberados (originados)
  if (d.includes('test') || d.includes('verific') || d.includes('lead oculto') || d.includes('indisponibilidade')) {
    return [
      `Verificação deliberada investigando: ${pedido.charAt(0).toLowerCase()}${pedido.slice(1)}`,
      fonteCriterio ?? 'Observar em: canais públicos de atendimento e páginas da empresa',
      'Dispara na primeira constatação do critério estipulado no prazo de tolerância',
      'Registrar como evidência a data, canal testado e retorno observado ou ausência de resposta',
    ]
  }

  // Cenário livre (fallback geral para qualquer descrição fora dos exemplos)
  return [
    `Empresa do público escolhido em que se observa: ${pedido.charAt(0).toLowerCase()}${pedido.slice(1)}`,
    fonteCriterio ?? 'Fontes públicas sugeridas pela Althius, a confirmar',
    'Dispara na primeira observação; reencontrar o mesmo acontecimento não conta de novo',
    'Guardar como evidência o trecho, a página ou a captura que mostra o acontecimento',
  ]
}

/**
 * O que cada Sinal interno real (CRM-10) observa nas Interações. O prazo é o único critério: a condição é o próprio tipo
 * e as etapas do formulário de exemplo não existem nas Interações.
 */
const COMO_O_INTERNO_DISPARA: Record<string, string> = {
  'sem-resposta':
    'Dispara quando o primeiro e-mail ou mensagem enviado depois da última conversa completa o prazo sem resposta, ligação ou reunião.',
  'negociacao-parada':
    'Dispara quando a última Interação da Conta-alvo foi uma conversa (resposta, ligação ou reunião) e mais nada acontece no prazo, nem do seu lado.',
}

/** Os critérios que a avaliação de um Sinal interno usa; o resto do formulário de exemplo fica de fora. */
function criteriosDoInterno(criterios: Criterios): Criterios {
  return Object.fromEntries(Object.entries(criterios).filter(([campo]) => CRITERIOS_DOS_SINAIS_INTERNOS.includes(campo)))
}

function novoMonitoramento(
  tipo: TipoDeSinal,
  aceitaDescoberta: boolean,
  descricao: string,
  operacional: boolean,
  interno: boolean,
): MonitoramentoNoEditor {
  const personalizado = tipo.id === TIPO_PERSONALIZADO.id
  return {
    // Na Demonstração o id local marca o rascunho. No operacional ele não existe até o banco devolver o uuid.
    ...(operacional ? {} : { id: `novo-${Math.random().toString(36).slice(2, 9)}` }),
    tipoId: tipo.id,
    nome: '',
    estado: 'rascunho',
    publico: operacional
      ? { modo: 'listas', listas: [], usaRecomendado: false }
      : publicoInicial(aceitaDescoberta),
    criterios: interno ? criteriosDoInterno(criteriosIniciais(tipo)) : criteriosIniciais(tipo),
    descricao: personalizado ? descricao : undefined,
    criteriosLivres: personalizado ? [] : undefined,
  }
}

/** Marca ou desmarca um item numa escolha múltipla. */
function alternar(lista: string[], item: string): string[] {
  return lista.includes(item) ? lista.filter((i) => i !== item) : [...lista, item]
}

/** A rota do editor: resolve o tipo e o Monitoramento, e recomeça o formulário ao trocar de um para outro. */
export function RotaDoEditor() {
  const { tipoId = '', monitoramentoId } = useParams<{ tipoId: string; monitoramentoId?: string }>()
  const { monitoramentos, carregando, erro, recarregar } = useSinaisDoMockup()
  const { dados: tipoDaFonte } = useDadosDeSinais((f) => f.tipo(tipoId), [tipoId])
  const visao = useCatalogoFuncional()
  if (tipoId === 'personalizado') return <Navigate to="/sinais/pedidos" replace />
  const unido = cardQueConta(tipoId)
  if (!monitoramentoId && unido && unido.id !== tipoId) return <Navigate to={`/sinais/tipos/${unido.id}/novo`} replace />
  if (!monitoramentoId && sinalArquivado(tipoId)) return <Navigate to="/sinais" replace />
  // Card do catálogo visível sempre abre o editor. Tipo fora do catálogo, em teste ou em breve, volta para a página.
  if (tipoDaFonte && !monitoramentoId && !cardPorId(tipoId) && !podeMonitorar(tipoDaFonte)) {
    return <Navigate to={`/sinais/tipos/${tipoId}`} replace />
  }
  // No operacional, card do catálogo que não roda de verdade não abre Monitoramento novo: volta para a página dele, que
  // decide se o card aparece. O Monitoramento que já existe continua abrindo.
  const card = cardPorId(tipoId)
  if (!monitoramentoId && card) {
    if (visao.carregando) return <Carregando />
    const disponibilidade = visao.erro ? 'em-breve' : visao.disponibilidadeDe(card)
    if (disponibilidade && !podeMonitorar({ disponibilidade })) return <Navigate to={`/sinais/tipos/${tipoId}`} replace />
  }
  const tipo = tipoPorId(tipoId)
  const existente = monitoramentos.find((m) => m.id === monitoramentoId && m.tipoId === tipoId)
  if (!tipo) return <Navigate to="/sinais" replace />
  if (monitoramentoId && !existente && carregando) return <Carregando />
  if (monitoramentoId && !existente && erro) return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6">
      <p>Não foi possível carregar os monitoramentos.</p>
      <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>Tentar de novo</button>
    </div>
  )
  if (monitoramentoId && !existente) return <Navigate to={`/sinais/tipos/${tipo.id}`} replace />
  return <EditorDeMonitoramento key={`${tipo.id}/${monitoramentoId ?? 'novo'}`} tipo={tipo} existente={existente} />
}

function EditorDeMonitoramento({ tipo, existente }: { tipo: TipoDeSinal; existente?: Monitoramento }) {
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const { salvar } = useSinaisDoMockup()
  const fonteDeSinais = useFonteDeSinais()
  const rodadas = useRodadas(existente?.id)
  const operacional = useAmbiente().modo === 'real'
  const familia = familiaDoTipo(tipo)
  const formulario = formularioDoTipo(tipo)
  const personalizado = tipo.id === TIPO_PERSONALIZADO.id
  // O Sinal interno real sai só das Interações do Workspace: sem fornecedor, sem crédito e só com o prazo.
  const interno = operacional && TIPOS_INTERNOS_REAIS.has(tipo.id)
  // Abertura de vagas no Workspace operacional escolhe onde procurar: nas Contas-alvo ou no mercado endereçável.
  const vagasReais = operacional && !interno && tipo.id === 'abertura-de-vagas'

  const [monitoramento, setMonitoramento] = useState<MonitoramentoNoEditor>(
    () => existente ?? novoMonitoramento(tipo, familia?.descoberta ?? true, parametros.get('descricao') ?? '', operacional, interno),
  )
  const [etapa, setEtapa] = useState<Etapa>(() => {
    if (!personalizado) return 'editar'
    if (!existente) return 'descrever'
    return existente.estado === 'em-preparacao' ? 'preparando' : 'editar'
  })

  const jaFunciona = existente?.estado === 'ativo' || existente?.estado === 'pausado'
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  // Ativar um Sinal com Agenda passa pela confirmação "Ativar Sinal": o Plano, a Agenda e a estimativa em créditos.
  const [confirmandoAtivacao, setConfirmandoAtivacao] = useState(false)
  const confirmaAtivacao = !!existente?.agenda && !!fonteDeSinais.estimarAgenda
  const mudar = (parcial: Partial<MonitoramentoNoEditor>) => setMonitoramento((atual) => ({ ...atual, ...parcial }))
  const voltarAoTipo = (aviso: string) => navegar(`/sinais/tipos/${tipo.id}`, { state: { aviso } })
  // No operacional a recusa do banco já vem em palavras do produto (ex.: falta escolher uma Conta-alvo para ativar).
  const motivoDaFalha = (erro: unknown, padrao: string) => (operacional && erro instanceof Error ? erro.message : padrao)
  const nomeValido = monitoramento.nome.trim().length > 0
  // Salva o que está na tela e ativa. Devolve a frase de erro, ou nada quando deu certo.
  const ativar = async (): Promise<string | null> => {
    try {
      setErroSalvar(null)
      await salvar({ ...monitoramento, estado: 'ativo' })
      voltarAoTipo(
        operacional
          ? `“${monitoramento.nome}” está ativo.`
          : `“${monitoramento.nome}” está ativo. Na demonstração, a coleta é simulada.`,
      )
      return null
    } catch (erro) {
      return motivoDaFalha(erro, 'Não foi possível ativar o monitoramento. Tente de novo.')
    }
  }

  const titulo = existente?.nome ?? (personalizado ? 'Novo sinal personalizado' : 'Novo monitoramento')

  return (
    <Pagina titulo={titulo} voltar={{ para: `/sinais/tipos/${tipo.id}`, rotulo: tipo.nome }}>
      <div className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-wrap items-center gap-2">
          <SeloDoEstado estado={etapa === 'preparando' ? 'em-preparacao' : monitoramento.estado} />
          {familia && <span className="selo">{ROTULO_DA_ORIGEM[familia.origem]} · {familia.nome}</span>}
          {!personalizado && <span className="text-sm text-al-muted">{tipo.descricao}</span>}
        </div>

        {existente?.pausadoPor === 'sem_creditos' && <AvisoDePausaPorCreditos monitoramento={existente} />}
        {existente && <AvisoDeRodadaPulada monitoramento={existente} />}

        {existente?.plano && <ResumoDoPlano monitoramento={existente} />}

        {existente && etapa === 'editar' && <RodarAgora monitoramento={existente} rodadas={rodadas} />}

        {existente && etapa === 'editar' && (existente.plano || existente.agenda) && <AgendaDoSinalNoMonitoramento monitoramento={existente} />}

        {erroSalvar && (
          <div role="alert" className="flex items-center justify-between rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
            <span>{erroSalvar}</span>
            <button
              type="button"
              onClick={() => setErroSalvar(null)}
              className="text-xs text-al-muted hover:text-al-ink underline underline-offset-4"
            >
              Fechar
            </button>
          </div>
        )}

        {etapa === 'descrever' && (
          <Descrever
            monitoramento={monitoramento}
            mudar={mudar}
            aoVoltarAosCriterios={
              monitoramento.criteriosLivres && monitoramento.criteriosLivres.length > 0
                ? () => setEtapa('editar')
                : undefined
            }
            aoPreparar={() => {
              mudar({ estado: 'em-preparacao' })
              setEtapa('preparando')
            }}
          />
        )}

        {etapa === 'preparando' && (
          <Preparando
            descricao={monitoramento.descricao ?? ''}
            aoEditarDescricao={() => setEtapa('descrever')}
            aoSairEVoltarDepois={async () => {
              try {
                setErroSalvar(null)
                await salvar({
                  ...monitoramento,
                  estado: 'em-preparacao',
                  nome: monitoramento.nome.trim() || resumir(monitoramento.descricao ?? ''),
                })
                voltarAoTipo('Sinal personalizado em preparação. Você revisa os critérios antes de ativar.')
              } catch {
                setErroSalvar('Não foi possível salvar o sinal em preparação. Tente de novo.')
              }
            }}
            aoConcluir={() => {
              mudar({
                estado: 'rascunho',
                nome: monitoramento.nome.trim() || resumir(monitoramento.descricao ?? ''),
                criteriosLivres: prepararCriterios(monitoramento.descricao ?? '', monitoramento.fonte),
              })
              setEtapa('editar')
            }}
          />
        )}

        {etapa === 'editar' && (
          <>
            <SecaoDoFormulario numero="01" titulo="Nome" descricao="Para reconhecer a finalidade entre vários Monitoramentos do mesmo tipo.">
              <Rotulado rotulo="Nome do monitoramento" ajuda={!nomeValido ? 'Dê um nome para salvar.' : undefined}>
                <input
                  value={monitoramento.nome}
                  onChange={(e) => mudar({ nome: e.target.value })}
                  placeholder={personalizado ? 'Ex.: Varejistas sem agendamento de entrega' : `Ex.: ${tipo.nome} no Brasil`}
                  className="campo h-10"
                />
              </Rotulado>
            </SecaoDoFormulario>

            {personalizado ? (
              <CriteriosLivres monitoramento={monitoramento} mudar={mudar} aoEditarDescricao={() => setEtapa('descrever')} />
            ) : (
              formulario && (
                <CriteriosProntos
                  formulario={formulario}
                  criterios={monitoramento.criterios}
                  aoMudar={(criterios) => mudar({ criterios })}
                  tipoInterno={interno ? tipo.id : undefined}
                  tipoId={tipo.id}
                  ocultar={vagasReais && noMercado(monitoramento.publico) ? ['localizacao'] : undefined}
                />
              )
            )}

            {operacional ? (
              <PublicoDeContasReais
                publico={monitoramento.publico}
                aoMudar={(publico) => mudar({ publico })}
                ajuda={
                  interno
                    ? 'O Monitoramento interno lê só as Interações destas Contas e não gasta crédito.'
                    : ajudaDoCusto(tipo.id)
                }
                mercado={
                  vagasReais
                    ? {
                        criterios: monitoramento.criterios,
                        aoMudar: (publico, criterios) => mudar({ publico, criterios }),
                      }
                    : undefined
                }
              />
            ) : (
              <SecaoPublico
                publico={monitoramento.publico}
                aceitaDescoberta={familia?.descoberta ?? true}
                aoMudar={(publico) => mudar({ publico })}
              />
            )}

            <BarraDeAcoes>
              {jaFunciona ? (
                <button
                  type="button"
                  disabled={!nomeValido}
                  onClick={async () => {
                    try {
                      setErroSalvar(null)
                      await salvar(monitoramento)
                      voltarAoTipo(`Alterações salvas em “${monitoramento.nome}”.`)
                    } catch (erro) {
                      setErroSalvar(motivoDaFalha(erro, 'Não foi possível salvar as alterações. Tente de novo.'))
                    }
                  }}
                  className={BOTAO_PRIMARIO}
                >
                  Salvar alterações
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!nomeValido}
                    onClick={async () => {
                      try {
                        setErroSalvar(null)
                        await salvar({ ...monitoramento, estado: 'rascunho' })
                        voltarAoTipo(`Rascunho “${monitoramento.nome}” salvo.`)
                      } catch (erro) {
                        setErroSalvar(motivoDaFalha(erro, 'Não foi possível salvar o rascunho. Tente de novo.'))
                      }
                    }}
                    className={BOTAO_SECUNDARIO}
                  >
                    Salvar rascunho
                  </button>
                  <button type="button" disabled={!nomeValido} onClick={() => setEtapa('revisar')} className={BOTAO_PRIMARIO}>
                    Revisar e ativar
                  </button>
                </>
              )}
            </BarraDeAcoes>

            {existente && <RodadasDoMonitoramento rodadas={rodadas} monitoramento={existente} />}
          </>
        )}

        {etapa === 'revisar' && (
          <Revisao
            monitoramento={existente?.agenda ? { ...monitoramento, agenda: existente.agenda } : monitoramento}
            operacional={operacional}
            interno={interno}
            aoVoltar={() => setEtapa('editar')}
            aoAtivar={() => (confirmaAtivacao ? setConfirmandoAtivacao(true) : void ativar().then((falha) => falha && setErroSalvar(falha)))}
          />
        )}

        {confirmaAtivacao && existente && (
          <AtivarSinal
            monitoramento={{ ...existente, nome: monitoramento.nome }}
            aberto={confirmandoAtivacao}
            aoCancelar={() => setConfirmandoAtivacao(false)}
            aoAtivar={ativar}
          />
        )}
      </div>
    </Pagina>
  )
}

function resumir(descricao: string): string {
  const texto = descricao.trim().replace(/\.$/, '')
  return texto.length > 60 ? `${texto.slice(0, 57).trimEnd()}…` : texto
}

/** Um campo com rótulo; a ajuda e o sufixo ficam fora do nome acessível, e a ajuda descreve o campo. */
export function Rotulado({
  rotulo,
  ajuda,
  sufixo,
  children,
}: {
  rotulo: string
  ajuda?: string
  sufixo?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>
}) {
  const id = useId()
  const idDaAjuda = `${id}-ajuda`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="rotulo text-al-ink">
        {rotulo}
      </label>
      <span className="flex items-center gap-3">
        {cloneElement(children, { id, 'aria-describedby': ajuda ? idDaAjuda : undefined })}
        {sufixo && <span className="shrink-0 text-sm text-al-muted">{sufixo}</span>}
      </span>
      {ajuda && (
        <span id={idDaAjuda} className="text-xs text-al-muted">
          {ajuda}
        </span>
      )}
    </div>
  )
}

export function Grupo({ rotulo, ajuda, papel, children }: { rotulo: string; ajuda?: string; papel: 'group' | 'radiogroup'; children: ReactNode }) {
  return (
    <div role={papel} aria-label={rotulo} className="flex flex-col gap-2">
      <span className="rotulo text-al-ink" aria-hidden>
        {rotulo}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
      {ajuda && <span className="text-xs text-al-muted">{ajuda}</span>}
    </div>
  )
}

export function BarraDeAcoes({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-1 flex flex-wrap justify-end gap-2 border-t border-al-line bg-al-bg py-4">{children}</div>
  )
}

export function CriteriosProntos({
  formulario,
  criterios,
  aoMudar,
  tipoInterno,
  tipoId,
  ocultar,
}: {
  formulario: Formulario
  criterios: Criterios
  aoMudar: (criterios: Criterios) => void
  /** O tipo, quando é um Sinal interno real: só os critérios que a avaliação usa e o que ele observa nas Interações. */
  tipoInterno?: string
  tipoId?: string
  /** Campos que outra seção cuida (a Localização, no público do mercado endereçável). */
  ocultar?: string[]
}) {
  const campos = (tipoInterno ? CAMPOS[formulario].filter((campo) => CRITERIOS_DOS_SINAIS_INTERNOS.includes(campo.id)) : CAMPOS[formulario])
    .filter((campo) => !ocultar?.includes(campo.id))
  const nichoDoCargo = tipoId === 'abertura-de-vagas' ? (typeof criterios.nicho === 'string' && criterios.nicho ? criterios.nicho : 'qualquer') : null
  const cargosDoFiltro = nichoDoCargo && nichoDoCargo !== 'qualquer' && nichoDoCargo !== NICHO_CUSTOM ? cargosDoNicho(nichoDoCargo) : null
  const funcoesMarcadas = Array.isArray(criterios.funcoes) ? criterios.funcoes : []
  // Trocar de nicho troca os cargos sugeridos; os cargos Custom ficam.
  const trocarNicho = (nicho: string) => {
    if (nicho === nichoDoCargo) return
    aoMudar({ ...criterios, nicho, funcoes: manterCargosCustom(funcoesMarcadas) })
  }
  return (
    <SecaoDoFormulario numero="02" titulo="Critérios" descricao="O que precisa acontecer para disparar um Sinal. Ajuste ao seu negócio.">
      {nichoDoCargo && (
        <div className="flex flex-col gap-3">
          <Grupo
            rotulo="Nicho do cargo"
            papel="radiogroup"
            ajuda="Qualquer mantém a lista geral. Um nicho troca os cargos sugeridos. Custom busca o nicho que você escrever."
          >
            <Opcao papel="radio" marcada={nichoDoCargo === 'qualquer'} aoClicar={() => trocarNicho('qualquer')}>
              Qualquer
            </Opcao>
            {NICHOS.map((nicho) => (
              <Opcao key={nicho.slug} papel="radio" marcada={nichoDoCargo === nicho.slug} aoClicar={() => trocarNicho(nicho.slug)}>
                {nicho.nome}
              </Opcao>
            ))}
            <Opcao papel="radio" marcada={nichoDoCargo === NICHO_CUSTOM} aoClicar={() => trocarNicho(NICHO_CUSTOM)}>
              Custom
            </Opcao>
          </Grupo>
          {nichoDoCargo === NICHO_CUSTOM && (
            <Rotulado
              rotulo="Nicho Custom"
              ajuda={`Até ${MAX_TEXTO_CUSTOM} caracteres. A IA usa este nicho para ficar só com as vagas dele.`}
            >
              <input
                value={typeof criterios.nichoCustom === 'string' ? criterios.nichoCustom : ''}
                maxLength={MAX_TEXTO_CUSTOM}
                onChange={(e) => aoMudar({ ...criterios, nichoCustom: e.target.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ') })}
                onBlur={(e) => aoMudar({ ...criterios, nichoCustom: limparTextoCustom(e.target.value) })}
                placeholder="Ex.: Naval, Óleo e gás"
                className="campo h-10"
              />
            </Rotulado>
          )}
        </div>
      )}
      {campos.map((campo) => {
        const campoEfetivo = campo.id === 'funcoes' && cargosDoFiltro ? { ...campo, opcoes: [...cargosDoFiltro] } : campo
        if (nichoDoCargo && campoEfetivo.id === 'funcoes' && campoEfetivo.tipo === 'opcoes') {
          return (
            <CargosComCustom
              key={campo.id}
              campo={campoEfetivo}
              marcadas={funcoesMarcadas}
              aoMudar={(funcoes) => aoMudar({ ...criterios, funcoes })}
            />
          )
        }
        return (
          <CampoDeCriterio
            key={campo.id}
            campo={campoEfetivo}
            valor={criterios[campo.id]}
            aoMudar={(valor) => aoMudar({ ...criterios, [campo.id]: valor })}
          />
        )
      })}
      {tipoInterno && (
        <p className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
          {COMO_O_INTERNO_DISPARA[tipoInterno]} O prazo é contado pelas Interações registradas na Conta-alvo: e-mails e
          mensagens enviados e recebidos, ligações e reuniões. O Sinal dispara no dia em que o prazo vence. Uma resposta
          comercial isolada continua sendo Interação e não gera Sinal.
        </p>
      )}
      {formulario === 'site' && (
        <p className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
          Na demonstração, as visitas e pessoas identificadas são simuladas. Não há identificação real de visitantes nem conexões externas.
        </p>
      )}
      {formulario === 'historico' && !tipoInterno && (
        <p className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
          O prazo define o tempo de inatividade no CRM para que a condição seja detectada. Uma vez disparado, o Sinal tem validade fixa de 30 dias para manter a Conta-alvo Quente. Uma resposta comercial isolada continua sendo Interação e não gera Sinal automaticamente.
        </p>
      )}
      {formulario === 'verificacao' && (
        <p className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
          Na demonstração, nenhuma verificação real é executada, nenhum site é varrido e nenhuma mensagem é enviada. Não é necessário configurar agentes executores, APIs ou credenciais.
        </p>
      )}
    </SecaoDoFormulario>
  )
}

/** "Cargos ou funções" de Abertura de vagas: as sugestões, os cargos Custom marcados (removíveis) e o campo para escrever. */
function CargosComCustom({
  campo,
  marcadas,
  aoMudar,
}: {
  campo: Extract<Campo, { tipo: 'opcoes' }>
  marcadas: string[]
  aoMudar: (funcoes: string[]) => void
}) {
  const [escrevendo, setEscrevendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const custom = cargosCustom(marcadas, campo.opcoes)
  const adicionar = () => {
    const { funcoes, erro: motivo } = adicionarCargosCustom(marcadas, texto, campo.opcoes)
    aoMudar(funcoes)
    setErro(motivo ?? null)
    if (!motivo) setTexto('')
  }
  return (
    <div className="flex flex-col gap-3">
      <Grupo
        rotulo={campo.rotulo}
        ajuda={campo.ajuda ?? `Custom adiciona cargos exatos, como SDR, LDR e BDR. Até ${MAX_CARGOS_CUSTOM}.`}
        papel="group"
      >
        {campo.opcoes.map((opcao) => (
          <Opcao key={opcao} marcada={marcadas.includes(opcao)} aoClicar={() => aoMudar(alternar(marcadas, opcao))}>
            {opcao}
          </Opcao>
        ))}
        {custom.map((cargo) => (
          <Opcao key={`custom-${cargo}`} marcada aoClicar={() => aoMudar(marcadas.filter((f) => f !== cargo))}>
            <span className="inline-flex items-center gap-1.5">
              {cargo}
              <X strokeWidth={1.8} className="size-3.5" aria-hidden />
            </span>
          </Opcao>
        ))}
        <Opcao marcada={escrevendo} aoClicar={() => setEscrevendo((v) => !v)}>
          Custom
        </Opcao>
      </Grupo>
      {escrevendo && (
        <div className="flex flex-col gap-2">
          <Rotulado rotulo="Cargo Custom" ajuda="Escreva o cargo exato. Para vários, separe por vírgulas.">
            <input
              value={texto}
              maxLength={MAX_TEXTO_CUSTOM}
              onChange={(e) => {
                setTexto(e.target.value)
                setErro(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  adicionar()
                }
              }}
              placeholder="Ex.: SDR, LDR, BDR"
              className="campo h-10"
            />
          </Rotulado>
          <button type="button" onClick={adicionar} disabled={!texto.trim()} className={cn(BOTAO_SECUNDARIO, 'self-start')}>
            <Plus strokeWidth={1.8} className="size-4" aria-hidden />
            Adicionar cargo
          </button>
          {erro && (
            <p role="alert" className="text-xs text-al-muted">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CampoDeCriterio({
  campo,
  valor,
  aoMudar,
}: {
  campo: Campo
  valor: string | string[] | undefined
  aoMudar: (valor: string | string[]) => void
}) {
  if (campo.tipo === 'opcoes') {
    const marcadas = Array.isArray(valor) ? valor : []
    return (
      <Grupo rotulo={campo.rotulo} ajuda={campo.ajuda} papel="group">
        {campo.opcoes.map((opcao) => (
          <Opcao
            key={opcao}
            marcada={marcadas.includes(opcao)}
            aoClicar={() => aoMudar(alternar(marcadas, opcao))}
          >
            {opcao}
          </Opcao>
        ))}
      </Grupo>
    )
  }
  if (campo.tipo === 'escolha') {
    return (
      <Grupo rotulo={campo.rotulo} ajuda={campo.ajuda} papel="radiogroup">
        {campo.opcoes.map((opcao) => (
          <Opcao key={opcao} papel="radio" marcada={valor === opcao} aoClicar={() => aoMudar(opcao)}>
            {opcao}
          </Opcao>
        ))}
      </Grupo>
    )
  }
  if (campo.tipo === 'numero') {
    return (
      <Rotulado rotulo={campo.rotulo} ajuda={campo.ajuda} sufixo={campo.sufixo}>
        <input
          type="number"
          min={1}
          value={typeof valor === 'string' ? valor : ''}
          onChange={(e) => aoMudar(e.target.value)}
          className="campo h-10 w-24"
        />
      </Rotulado>
    )
  }
  return (
    <Rotulado rotulo={campo.rotulo} ajuda={campo.ajuda}>
      <input
        value={typeof valor === 'string' ? valor : ''}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={`Ex.: ${campo.exemplo}`}
        className="campo h-10"
      />
    </Rotulado>
  )
}

/**
 * O público no Workspace operacional: as Contas-alvo do Workspace que o Monitoramento varre. A descoberta por perfil não
 * roda de verdade e não aparece; as listas de exemplo ficam só na Demonstração. Em Abertura de vagas (`mercado`), a pessoa
 * escolhe também o mercado endereçável: em vez das Contas-alvo, o país e o estado em que procurar empresas contratando.
 */
function PublicoDeContasReais({
  publico,
  aoMudar,
  ajuda,
  mercado,
}: {
  publico: Publico
  aoMudar: (publico: Publico) => void
  ajuda: string
  mercado?: { criterios: Criterios; aoMudar: (publico: Publico, criterios: Criterios) => void }
}) {
  const noMercadoAgora = !!mercado && noMercado(publico)
  const escolher = (escopo: 'contas' | 'mercado') => {
    if (!mercado || (escopo === 'mercado') === noMercadoAgora) return
    const novo = trocarEscopo(publico, mercado.criterios, escopo)
    mercado.aoMudar(novo.publico, novo.criterios)
  }

  return (
    <SecaoDoFormulario
      numero="03"
      titulo="Público"
      descricao={
        noMercadoAgora
          ? 'Empresas do mercado endereçável que estão contratando os cargos escolhidos.'
          : 'As Contas-alvo do Workspace em que procurar os Sinais.'
      }
    >
      {mercado && (
        <Grupo rotulo="Onde procurar" papel="radiogroup">
          <Opcao papel="radio" marcada={!noMercadoAgora} aoClicar={() => escolher('contas')}>
            Contas-alvo
          </Opcao>
          <Opcao papel="radio" marcada={noMercadoAgora} aoClicar={() => escolher('mercado')}>
            Mercado endereçável (ICP)
          </Opcao>
        </Grupo>
      )}
      {mercado && noMercadoAgora ? (
        <PublicoDoMercado criterios={mercado.criterios} aoMudar={(criterios) => mercado.aoMudar(publico, criterios)} />
      ) : (
        <ContasDoWorkspace publico={publico} aoMudar={aoMudar} ajuda={ajuda} />
      )}
    </SecaoDoFormulario>
  )
}

export function ContasDoWorkspace({ publico, aoMudar, ajuda }: { publico: Publico; aoMudar: (publico: Publico) => void; ajuda: string }) {
  const { dados: contas, erro, recarregar } = useDadosDeContas((f) => f.contas(), [])
  if (erro) {
    return (
      <div role="alert" className="rounded-xl flex flex-col items-start gap-3 border border-al-line bg-al-surface p-4">
        <p className="text-sm text-al-muted">Não foi possível carregar as Contas-alvo.</p>
        <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!contas) return <Carregando />
  if (contas.length === 0) {
    return (
      <p className="text-sm text-al-muted">
        Nenhuma Conta-alvo neste Workspace. Cadastre ou importe em{' '}
        <Link to="/contas" className="text-al-ink underline-offset-4 hover:underline">
          Contas
        </Link>{' '}
        para escolher o público.
      </p>
    )
  }
  return (
    <Grupo rotulo="Contas-alvo" ajuda={ajuda} papel="group">
      {contas.map((conta) => (
        <Opcao
          key={conta.id}
          marcada={publico.listas.includes(conta.id)}
          aoClicar={() => aoMudar({ ...publico, listas: alternar(publico.listas, conta.id) })}
        >
          {conta.nome} {conta.dominio && <span className="text-al-muted">· {conta.dominio}</span>}
        </Opcao>
      ))}
    </Grupo>
  )
}

/** O país (obrigatório para ativar) e o estado (opcional, só no Brasil) do mercado endereçável, e o custo da rodada. */
function PublicoDoMercado({ criterios, aoMudar }: { criterios: Criterios; aoMudar: (criterios: Criterios) => void }) {
  const pais = paisDoMercado(criterios)
  return (
    <div className="flex flex-col gap-6">
      <Grupo rotulo="País" papel="radiogroup">
        {PAISES_DO_MERCADO.map((opcao) => (
          <Opcao key={opcao} papel="radio" marcada={pais === opcao} aoClicar={() => aoMudar(comPais(criterios, opcao))}>
            {opcao}
          </Opcao>
        ))}
      </Grupo>
      {pais === 'Brasil' && (
        <Rotulado rotulo="Estado" ajuda="Opcional. Sem estado, a busca vale para o país todo.">
          <select
            value={estadoDoMercado(criterios)}
            onChange={(e) => aoMudar(comEstado(criterios, e.target.value))}
            className="campo h-10"
          >
            <option value="">Todos os estados</option>
            {ESTADOS_DO_BRASIL.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </Rotulado>
      )}
      <p className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
        {custoDoMercado()} As empresas que ainda não são Contas-alvo entram na Caixa de Descobertas para você aceitar ou
        descartar; nenhuma vira Conta nem recebe mensagem sozinha.
      </p>
    </div>
  )
}

function SecaoPublico({
  publico,
  aceitaDescoberta,
  aoMudar,
}: {
  publico: Publico
  aceitaDescoberta: boolean
  aoMudar: (publico: Publico) => void
}) {
  const modos: ModoDePublico[] = aceitaDescoberta ? ['listas', 'descoberta', 'ambos'] : ['listas']
  const comListas = publico.modo !== 'descoberta'
  const comDescoberta = publico.modo !== 'listas'
  // O público recomendado é lido do ICP vigente a cada abertura: aprovar uma revisão do ICP o atualiza aqui.
  const memoria = useDados((fonte) => fonte.memoriaDoWorkspace(), [])
  const recomendado = memoria && publicoRecomendado(memoria.icp.secoes)

  return (
    <SecaoDoFormulario numero="03" titulo="Público" descricao="Onde procurar os Sinais.">
      <aside aria-label="Público recomendado" className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-4">
        <span className="rotulo inline-flex items-center gap-2 text-al-accent">
          <Sparkles strokeWidth={1.8} className="size-3.5" aria-hidden />
          Recomendado pelas suas configurações
        </span>
        {memoria && recomendado ? (
          <>
            <p className="text-base">{recomendado.nome}</p>
            <p className="text-sm text-al-muted">
              {recomendado.resumo}. Vem do ICP vigente na{' '}
              <Link to="/configuracoes/memoria" className="text-al-ink underline-offset-4 hover:underline">
                Memória do Workspace
              </Link>
              , aprovado em {formatarDiaIsoPorExtenso(memoria.icp.aprovadoEm)}.
            </p>
          </>
        ) : (
          <Carregando />
        )}
        {aceitaDescoberta && !comDescoberta && (
          <button type="button" onClick={() => aoMudar({ ...publico, modo: 'ambos', usaRecomendado: true })} className={cn(BOTAO_SECUNDARIO, 'self-start')}>
            Incluir descoberta com este público
          </button>
        )}
        {!aceitaDescoberta && (
          <p className="text-sm text-al-muted">
            Sinais do histórico comercial acompanham as Contas-alvo que já estão no seu CRM; o público recomendado prioriza as
            listas.
          </p>
        )}
      </aside>

      <Grupo rotulo="Como encontrar as empresas" papel="radiogroup">
        {modos.map((modo) => (
          <Opcao key={modo} papel="radio" marcada={publico.modo === modo} aoClicar={() => aoMudar({ ...publico, modo })}>
            {ROTULO_DO_MODO[modo]}
          </Opcao>
        ))}
      </Grupo>
      <p className="-mt-3 text-xs text-al-muted">{DESCRICAO_DO_MODO[publico.modo]}</p>

      {comListas && (
        <Grupo rotulo="Listas de Contas-alvo" papel="group">
          {LISTAS.map((lista) => (
            <Opcao
              key={lista.id}
              marcada={publico.listas.includes(lista.id)}
              aoClicar={() =>
                aoMudar({ ...publico, listas: alternar(publico.listas, lista.id) })
              }
            >
              {lista.nome} <span className="text-al-muted">· {lista.contas}</span>
            </Opcao>
          ))}
        </Grupo>
      )}

      {comDescoberta && (
        <Grupo rotulo="Perfil da descoberta" papel="radiogroup">
          <Opcao papel="radio" marcada={publico.usaRecomendado} aoClicar={() => aoMudar({ ...publico, usaRecomendado: true })}>
            Usar o público recomendado
          </Opcao>
          <Opcao papel="radio" marcada={!publico.usaRecomendado} aoClicar={() => aoMudar({ ...publico, usaRecomendado: false })}>
            Público personalizado
          </Opcao>
        </Grupo>
      )}
      {comDescoberta && !publico.usaRecomendado && (
        <PerfilPersonalizado perfil={publico.perfil ?? {}} aoMudar={(perfil) => aoMudar({ ...publico, perfil })} />
      )}
    </SecaoDoFormulario>
  )
}

function Descrever({
  monitoramento,
  mudar,
  aoPreparar,
  aoVoltarAosCriterios,
}: {
  monitoramento: MonitoramentoNoEditor
  mudar: (parcial: Partial<MonitoramentoNoEditor>) => void
  aoPreparar: () => void
  aoVoltarAosCriterios?: () => void
}) {
  const origens: (Origem | undefined)[] = ['externo', 'interno', 'originado', undefined]
  const podePreparar = (monitoramento.descricao ?? '').trim().length > 0
  return (
    <>
      <SecaoDoFormulario
        numero="01"
        titulo="Descreva o sinal"
        descricao="Em linguagem livre, como explicaria a alguém do time. Sem código nem API: a Althius prepara os critérios e você revisa antes de ativar."
      >
        <Rotulado rotulo="O que você quer acompanhar?">
          <textarea
            rows={4}
            value={monitoramento.descricao ?? ''}
            onChange={(e) => mudar({ descricao: e.target.value })}
            placeholder="Ex.: varejistas com mais de 50 lojas que não oferecem agendamento de entrega no site"
            className="campo resize-y py-3"
          />
        </Rotulado>
        <Rotulado rotulo="Fonte, se você souber" ajuda="Opcional. Um site, uma base pública ou um tipo de publicação.">
          <input
            value={monitoramento.fonte ?? ''}
            onChange={(e) => mudar({ fonte: e.target.value })}
            placeholder="Ex.: sites das empresas, diário oficial do município"
            className="campo h-10"
          />
        </Rotulado>
        <Grupo
          rotulo="Origem"
          ajuda="Opcional. Externo: mercado (vagas, notícias, ferramentas). Interno: seu site ou CRM. Originado: verificação deliberada investigando necessidades."
          papel="radiogroup"
        >
          {origens.map((origem) => (
            <Opcao key={origem ?? 'nao-sei'} papel="radio" marcada={monitoramento.origem === origem} aoClicar={() => mudar({ origem })}>
              {origem ? ROTULO_DA_ORIGEM[origem] : 'Não sei'}
            </Opcao>
          ))}
        </Grupo>
      </SecaoDoFormulario>
      <BarraDeAcoes>
        {aoVoltarAosCriterios && (
          <button type="button" onClick={aoVoltarAosCriterios} className={BOTAO_SECUNDARIO}>
            Voltar aos critérios
          </button>
        )}
        <button type="button" disabled={!podePreparar} onClick={aoPreparar} className={BOTAO_PRIMARIO}>
          <Sparkles strokeWidth={1.8} className="size-4" aria-hidden />
          Preparar critérios
        </button>
      </BarraDeAcoes>
    </>
  )
}

function Preparando({
  descricao,
  aoEditarDescricao,
  aoSairEVoltarDepois,
  aoConcluir,
}: {
  descricao: string
  aoEditarDescricao?: () => void
  aoSairEVoltarDepois: () => void
  aoConcluir: () => void
}) {
  return (
    <section aria-label="Em preparação" className="rounded-2xl flex flex-col gap-6 border border-al-line bg-al-surface p-8">
      <div className="flex items-center gap-4">
        <span className="relative size-8">
          <Pulso className="absolute inset-0" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-xl">Em preparação</h2>
          <p className="text-sm text-al-muted">A Althius está transformando a sua descrição em critérios. Você pode sair e voltar depois.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <blockquote className="border-l-2 border-al-accent pl-4 text-base">{descricao}</blockquote>
        {aoEditarDescricao && (
          <button
            type="button"
            onClick={aoEditarDescricao}
            className="self-start text-xs text-al-muted underline underline-offset-4 hover:text-al-ink"
          >
            Corrigir descrição
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-2 text-sm text-al-muted">
        <li>✓ Descrição recebida</li>
        <li>… Identificando o acontecimento, as fontes possíveis e a evidência</li>
        <li className="opacity-60">Critérios prontos para a sua revisão</li>
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-al-line pt-5">
        <span className="anotacao text-base">simulação: a preparação termina quando você pedir</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={aoSairEVoltarDepois} className={BOTAO_SECUNDARIO}>
            Salvar e voltar depois
          </button>
          <button type="button" onClick={aoConcluir} className={BOTAO_PRIMARIO}>
            Ver critérios preparados
          </button>
        </div>
      </div>
    </section>
  )
}

function CriteriosLivres({
  monitoramento,
  mudar,
  aoEditarDescricao,
}: {
  monitoramento: MonitoramentoNoEditor
  mudar: (parcial: Partial<MonitoramentoNoEditor>) => void
  aoEditarDescricao: () => void
}) {
  const criterios = monitoramento.criteriosLivres ?? []
  const trocar = (indice: number, texto: string) => mudar({ criteriosLivres: criterios.map((c, i) => (i === indice ? texto : c)) })
  return (
    <SecaoDoFormulario
      numero="02"
      titulo="Critérios preparados"
      descricao="Preparados a partir da sua descrição. Corrija o entendimento antes de ativar."
    >
      <div className="flex flex-col gap-2 border-l-2 border-al-line pl-4">
        <span className="rotulo">Sua descrição</span>
        <p className="text-sm">{monitoramento.descricao}</p>
        {monitoramento.fonte && <p className="text-xs text-al-muted">Fonte indicada: {monitoramento.fonte}</p>}
        {monitoramento.origem ? (
          <p className="text-xs text-al-muted">
            Origem: <span className="text-al-ink font-medium">{ROTULO_DA_ORIGEM[monitoramento.origem]}</span>
          </p>
        ) : (
          <p className="text-xs text-al-muted">
            Origem: <span className="text-al-ink font-medium">A definir pela Althius</span>
          </p>
        )}
        <button type="button" onClick={aoEditarDescricao} className="self-start text-xs text-al-muted underline underline-offset-4 hover:text-al-ink">
          Editar descrição
        </button>
      </div>
      <ol aria-label="Critérios editáveis" className="flex flex-col gap-2">
        {criterios.map((criterio, indice) => (
          <li key={indice} className="flex items-center gap-2">
            <span className="rotulo w-6 text-al-accent" aria-hidden>
              {String(indice + 1).padStart(2, '0')}
            </span>
            <input
              aria-label={`Critério ${indice + 1}`}
              value={criterio}
              onChange={(e) => trocar(indice, e.target.value)}
              className="campo h-10"
            />
            <button
              type="button"
              aria-label={`Remover critério ${indice + 1}`}
              onClick={() => mudar({ criteriosLivres: criterios.filter((_, i) => i !== indice) })}
              className="rounded-lg grid size-10 shrink-0 place-items-center border border-al-line text-al-muted hover:text-al-ink"
            >
              <X strokeWidth={1.8} className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => mudar({ criteriosLivres: [...criterios, ''] })}
        className={cn(BOTAO_SECUNDARIO, 'self-start')}
      >
        <Plus strokeWidth={1.8} className="size-4" aria-hidden />
        Adicionar critério
      </button>
    </SecaoDoFormulario>
  )
}

/** Os nomes das Contas-alvo do público, na revisão do Workspace operacional. */
function ContasDoPublico({ ids }: { ids: string[] }) {
  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const nomes = ids.map((id) => contas?.find((conta) => conta.id === id)?.nome).filter((nome): nome is string => !!nome)
  return <>{nomes.length > 0 ? nomes.join(', ') : resumoDasContas(ids.length)}</>
}

function Revisao({
  monitoramento,
  operacional,
  interno,
  aoVoltar,
  aoAtivar,
}: {
  monitoramento: MonitoramentoNoEditor
  operacional: boolean
  interno: boolean
  aoVoltar: () => void
  aoAtivar: () => void
}) {
  const linhas: [string, ReactNode][] = [['Nome', monitoramento.nome]]
  if (monitoramento.tipoId === TIPO_PERSONALIZADO.id) {
    linhas.push(['Descrição', monitoramento.descricao])
    if (monitoramento.fonte) linhas.push(['Fonte indicada', monitoramento.fonte])
    linhas.push(['Origem', monitoramento.origem ? ROTULO_DA_ORIGEM[monitoramento.origem] : 'A definir pela Althius'])
    linhas.push([
      'Critérios',
      <ol key="criterios" className="flex list-decimal flex-col gap-1 pl-4">
        {(monitoramento.criteriosLivres ?? []).filter(Boolean).map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ol>,
    ])
  } else {
    for (const { rotulo, texto } of criteriosFormatados(monitoramento)) linhas.push([rotulo, texto])
  }
  const mercado = operacional && noMercado(monitoramento.publico)
  linhas.push([
    'Público',
    mercado
      ? resumoDoMercado(monitoramento.criterios)
      : operacional
        ? <ContasDoPublico key="publico" ids={monitoramento.publico.listas} />
        : resumoDoPublico(monitoramento.publico),
  ])
  if (monitoramento.agenda) linhas.push(['Agenda', textoDaAgenda(monitoramento.agenda)])
  linhas.push(['Validade', `Cada Sinal deixa a Conta-alvo Quente por ${VALIDADE_EM_DIAS} dias a partir do disparo`])

  return (
    <section aria-label="Revisão antes de ativar" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="titulo-secao text-xl">Revise antes de ativar</h2>
        <p className="text-sm text-al-muted">Confira os critérios e o público. Depois de ativo, você pode editar ou pausar a qualquer momento.</p>
      </div>
      <dl className="grid grid-cols-[12rem_1fr] border-t border-al-line text-sm">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="rotulo border-b border-al-line py-3 pr-4">{rotulo}</dt>
            <dd className="border-b border-al-line py-3">{valor}</dd>
          </div>
        ))}
      </dl>
      {interno ? (
        <p className="text-sm text-al-muted">
          Os Sinais internos usam só as Interações registradas na Althius e não gastam crédito. A avaliação roda ao ativar
          e, depois, a cada 24 horas.
        </p>
      ) : operacional ? (
        <p className="text-sm text-al-muted">
          {mercado ? custoDoMercado() : ajudaDoCusto(monitoramento.tipoId)} A varredura automática só roda dentro do teto aprovado em{' '}
          <Link to="/configuracoes/automacao" className="text-al-ink underline-offset-4 hover:underline">
            Automação e tetos
          </Link>
          .
        </p>
      ) : (
        <p className="anotacao text-base">na demonstração, a coleta é simulada: nenhum dado externo é consultado</p>
      )}
      <BarraDeAcoes>
        <button type="button" onClick={aoVoltar} className={BOTAO_SECUNDARIO}>
          Voltar à edição
        </button>
        <button type="button" onClick={aoAtivar} className={BOTAO_PRIMARIO}>
          Ativar monitoramento
        </button>
      </BarraDeAcoes>
    </section>
  )
}

import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useAmbiente, useDadosDeSinais, useFonteDeSinais } from '@/fonte/contexto'
import {
  ErroDoPlano,
  LIMITES_DO_PLANO,
  MENSAGEM_DA_FALHA_DO_PLANO,
  type OrigemDoPlano,
  type PlanoDoSinal,
} from '@/fonte/plano-do-sinal'
import type { Monitoramento, Publico } from '@/fonte/sinais-tipos'
import { CAMPOS } from './catalogo'
import { TIPOS_DO_PLANO, criteriosPadraoDoTipo, criteriosParaSalvar } from './campos-do-plano'
import { SecaoDoFormulario } from './componentes'
import { BarraDeAcoes, ContasDoWorkspace, CriteriosProntos, Rotulado } from './editor'
import { useSinaisDoMockup } from './estado'

/** Exemplos curtos de Briefing, em texto cinza: a pessoa vê o tom, não escolhe um. */
const EXEMPLOS_DE_BRIEFING = [
  'Avise quando essas empresas abrirem vaga de RevOps ou de SDR.',
  'Quero saber quando chegar um novo diretor financeiro.',
  'Mostre quem começou a anunciar no Instagram.',
]

const NOME_MAXIMO = 120

/** O Plano em edição: o que a pessoa ajusta no passo 2 antes de salvar. */
interface PlanoEmEdicao {
  tipo: string
  criterios: Record<string, unknown>
  explicacao: string
  origem: OrigemDoPlano
  maxEmpresasPorRodada: number
  modeloId?: string
  avisos: string[]
}

function emEdicao(plano: PlanoDoSinal, avisos: string[]): PlanoEmEdicao {
  const sinal = plano.sinais[0]
  return {
    tipo: sinal.tipo,
    criterios: { ...sinal.criterios },
    explicacao: plano.explicacao,
    origem: plano.origem,
    maxEmpresasPorRodada: plano.maxEmpresasPorRodada,
    ...(plano.modeloId ? { modeloId: plano.modeloId } : {}),
    avisos,
  }
}

function resumirNome(briefing: string, rotulo: string): string {
  const texto = briefing.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  if (!texto) return rotulo
  return texto.length > 60 ? `${texto.slice(0, 57).trimEnd()}…` : texto
}

/** Os tipos que o Plano aceita nesta tela: os que a tela sabe preencher e que o banco diz estar disponíveis. */
function useTiposAceitos(): string[] | undefined {
  const operacional = useAmbiente().modo === 'real'
  const { dados: estados } = useDadosDeSinais(
    (f) => (operacional && f.estadosDosColetores ? f.estadosDosColetores() : Promise.resolve(null)),
    [operacional],
  )
  if (estados === undefined) return undefined
  return Object.keys(TIPOS_DO_PLANO).filter((tipo) => !estados || estados.get(tipo) === 'available')
}

/** A rota `/sinais/novo`: descrever um Sinal. Com `?monitor=<id>`, edita o Plano de um Monitoramento que já tem um. */
export function PaginaDoBriefing() {
  const [parametros] = useSearchParams()
  const monitorId = parametros.get('monitor')
  const { monitoramentos, carregando, erro, recarregar } = useSinaisDoMockup()
  const existente = monitorId ? monitoramentos.find((m) => m.id === monitorId) : undefined

  if (monitorId && !existente) {
    if (carregando) return <Carregando />
    if (erro) {
      return (
        <Pagina titulo="Descrever um Sinal" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p>Não foi possível carregar os monitoramentos.</p>
            <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
              Tentar de novo
            </button>
          </div>
        </Pagina>
      )
    }
    return <Navigate to="/sinais/novo" replace />
  }
  // Um Monitoramento sem Plano (ou que o editor mudou depois) se edita no editor de sempre.
  if (existente && !existente.plano) return <Navigate to={`/sinais/tipos/${existente.tipoId}/${existente.id}`} replace />
  return <DescreverUmSinal key={existente?.id ?? 'novo'} existente={existente} />
}

function DescreverUmSinal({ existente }: { existente?: Monitoramento }) {
  const fonte = useFonteDeSinais()
  const { salvarPlano } = useSinaisDoMockup()
  const navegar = useNavigate()
  const tiposAceitos = useTiposAceitos()

  const [passo, setPasso] = useState<'briefing' | 'plano'>(existente ? 'plano' : 'briefing')
  const [briefing, setBriefing] = useState(existente?.briefing ?? '')
  const [contas, setContas] = useState<string[]>(() =>
    existente?.plano?.escopo.tipo === 'contas' ? [...existente.plano.escopo.contaIds] : [],
  )
  const [plano, setPlano] = useState<PlanoEmEdicao | null>(() => (existente?.plano ? emEdicao(existente.plano, []) : null))
  const [nome, setNome] = useState(existente?.nome ?? '')
  const [montando, setMontando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroDoBriefing, setErroDoBriefing] = useState<string | null>(null)
  const [avisoDasContas, setAvisoDasContas] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  const publico: Publico = { modo: 'listas', listas: contas, usaRecomendado: false }
  const escolherContas = (novo: Publico) => {
    if (novo.listas.length > LIMITES_DO_PLANO.contasEscolhidasMax) {
      setAvisoDasContas(`Escolha até ${LIMITES_DO_PLANO.contasEscolhidasMax} Contas por Sinal.`)
      return
    }
    setAvisoDasContas(null)
    setContas(novo.listas)
  }

  const briefingPronto = briefing.trim().length > 0
  const podeMontar = briefingPronto && contas.length > 0 && !montando

  async function montar() {
    if (!podeMontar || !fonte.montarPlano) return
    setMontando(true)
    setErroDoBriefing(null)
    try {
      const { plano: montado, avisos } = await fonte.montarPlano({ briefing: briefing.trim(), contaIds: contas })
      const novo = emEdicao(montado, avisos)
      setPlano(novo)
      setNome((atual) => atual.trim() || resumirNome(briefing, TIPOS_DO_PLANO[novo.tipo]?.rotulo ?? 'Sinal'))
      setPasso('plano')
    } catch (erro) {
      // O limite do dia tem mensagem própria; qualquer outra falha é recuperável e fica sem detalhe técnico.
      setErroDoBriefing(erro instanceof ErroDoPlano && erro.codigo !== 'falha' ? erro.message : MENSAGEM_DA_FALHA_DO_PLANO)
    } finally {
      setMontando(false)
    }
  }

  async function salvar() {
    if (!plano || !nome.trim()) return
    setSalvando(true)
    setErroSalvar(null)
    try {
      const criterios = criteriosParaSalvar(plano.tipo, plano.criterios)
      const paraSalvar: PlanoDoSinal = {
        versao: 1,
        origem: plano.origem,
        escopo: { tipo: 'contas', contaIds: contas },
        sinais: [{ tipo: plano.tipo, criterios }],
        explicacao: plano.explicacao,
        maxEmpresasPorRodada: plano.maxEmpresasPorRodada,
        ...(plano.modeloId ? { modeloId: plano.modeloId } : {}),
      }
      const salvo = await salvarPlano({ id: existente?.id, nome: nome.trim(), briefing: briefing.trim(), plano: paraSalvar })
      navegar(`/sinais/tipos/${salvo.tipoId}/${salvo.id}`)
    } catch (erro) {
      setErroSalvar(erro instanceof Error && erro.message ? erro.message : 'Não foi possível salvar o rascunho. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Pagina
      titulo={existente ? 'Editar plano' : 'Descrever um Sinal'}
      voltar={existente ? { para: `/sinais/tipos/${existente.tipoId}/${existente.id}`, rotulo: existente.nome } : { para: '/sinais', rotulo: 'Sinais' }}
    >
      <div className="flex max-w-3xl flex-col gap-8">
        {passo === 'briefing' && (
          <>
            <SecaoDoFormulario
              numero="01"
              titulo="Briefing"
              descricao="Conte, com as suas palavras, o que você quer acompanhar. A Althius monta um plano para você revisar. Nada roda nem é cobrado agora."
            >
              <Rotulado rotulo="O que você quer acompanhar" ajuda={`${briefing.length} de ${LIMITES_DO_PLANO.briefingMax} caracteres`}>
                <textarea
                  value={briefing}
                  maxLength={LIMITES_DO_PLANO.briefingMax}
                  onChange={(e) => setBriefing(e.target.value)}
                  className="campo min-h-28 py-2"
                />
              </Rotulado>
              <ul aria-label="Exemplos de briefing" className="flex flex-col gap-1 text-sm text-al-muted">
                {EXEMPLOS_DE_BRIEFING.map((exemplo) => (
                  <li key={exemplo}>{exemplo}</li>
                ))}
              </ul>
            </SecaoDoFormulario>

            <SecaoDoFormulario
              numero="02"
              titulo="Contas"
              descricao={`As Contas-alvo em que procurar o Sinal: de 1 a ${LIMITES_DO_PLANO.contasEscolhidasMax}.`}
            >
              <ContasDoWorkspace publico={publico} aoMudar={escolherContas} ajuda={`${contas.length} de ${LIMITES_DO_PLANO.contasEscolhidasMax} escolhidas`} />
              {avisoDasContas && (
                <p role="status" className="text-xs text-al-muted">
                  {avisoDasContas}
                </p>
              )}
            </SecaoDoFormulario>

            {montando && <Carregando rotulo="Montando o plano" />}

            {erroDoBriefing && (
              <div role="alert" className="rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
                {erroDoBriefing}
              </div>
            )}

            <BarraDeAcoes>
              <button type="button" disabled={!podeMontar} onClick={montar} className={BOTAO_PRIMARIO}>
                <Sparkles strokeWidth={1.8} className="size-4" aria-hidden />
                Montar plano
              </button>
            </BarraDeAcoes>
          </>
        )}

        {passo === 'plano' && plano && (
          <PassoDoPlano
            plano={plano}
            aoMudarPlano={(parcial) => setPlano({ ...plano, ...parcial })}
            tiposAceitos={tiposAceitos}
            nome={nome}
            aoMudarNome={setNome}
            publico={publico}
            aoMudarContas={escolherContas}
            avisoDasContas={avisoDasContas}
            erroSalvar={erroSalvar}
            aoFecharErro={() => setErroSalvar(null)}
            salvando={salvando}
            aoVoltar={() => setPasso('briefing')}
            aoSalvar={salvar}
          />
        )}
      </div>
    </Pagina>
  )
}

function PassoDoPlano({
  plano,
  aoMudarPlano,
  tiposAceitos,
  nome,
  aoMudarNome,
  publico,
  aoMudarContas,
  avisoDasContas,
  erroSalvar,
  aoFecharErro,
  salvando,
  aoVoltar,
  aoSalvar,
}: {
  plano: PlanoEmEdicao
  aoMudarPlano: (parcial: Partial<PlanoEmEdicao>) => void
  tiposAceitos: string[] | undefined
  nome: string
  aoMudarNome: (nome: string) => void
  publico: Publico
  aoMudarContas: (publico: Publico) => void
  avisoDasContas: string | null
  erroSalvar: string | null
  aoFecharErro: () => void
  salvando: boolean
  aoVoltar: () => void
  aoSalvar: () => void
}) {
  const tipo = TIPOS_DO_PLANO[plano.tipo]
  // O tipo do Plano sempre aparece na lista, mesmo que o estado dele tenha mudado depois.
  const opcoes = [...new Set([plano.tipo, ...(tiposAceitos ?? [])])].filter((t) => TIPOS_DO_PLANO[t])
  const escondidos = tipo ? CAMPOS[tipo.formulario].map((c) => c.id).filter((id) => !tipo.campos.includes(id)) : []
  const temCriterios = tipo ? CAMPOS[tipo.formulario].some((c) => tipo.campos.includes(c.id)) : false
  const nomeValido = nome.trim().length > 0 && nome.trim().length <= NOME_MAXIMO

  return (
    <>
      {plano.avisos.map((aviso) => (
        <p key={aviso} role="status" className="rounded-xl bg-al-atencao-suave px-4 py-3 text-sm text-al-ink">
          {aviso}
        </p>
      ))}

      <div className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-4">
        <span className="rotulo inline-flex items-center gap-2 text-al-accent">
          <Sparkles strokeWidth={1.8} className="size-3.5" aria-hidden />
          Como a Althius entendeu o seu pedido
        </span>
        <p className="text-sm">{plano.explicacao}</p>
      </div>

      <SecaoDoFormulario numero="01" titulo="Sinal" descricao="O tipo de Sinal e o nome para reconhecê-lo entre os seus Monitoramentos.">
        <Rotulado rotulo="Tipo de Sinal">
          <select
            value={plano.tipo}
            onChange={(e) => aoMudarPlano({ tipo: e.target.value, criterios: criteriosPadraoDoTipo(e.target.value) })}
            className="campo h-10"
          >
            {opcoes.map((t) => (
              <option key={t} value={t}>
                {TIPOS_DO_PLANO[t].rotulo}
              </option>
            ))}
          </select>
        </Rotulado>
        <Rotulado rotulo="Nome do monitoramento" ajuda={!nomeValido ? 'Dê um nome para salvar.' : undefined}>
          <input value={nome} maxLength={NOME_MAXIMO} onChange={(e) => aoMudarNome(e.target.value)} className="campo h-10" />
        </Rotulado>
      </SecaoDoFormulario>

      {tipo && temCriterios ? (
        <CriteriosProntos
          formulario={tipo.formulario}
          criterios={plano.criterios}
          aoMudar={(criterios) => aoMudarPlano({ criterios })}
          tipoId={plano.tipo === 'vaga_linkedin' ? 'abertura-de-vagas' : undefined}
          ocultar={escondidos}
        />
      ) : (
        <SecaoDoFormulario numero="02" titulo="Critérios">
          <p className="text-sm text-al-muted">Este Sinal não tem critérios para ajustar.</p>
        </SecaoDoFormulario>
      )}

      <SecaoDoFormulario numero="03" titulo="Contas" descricao="As Contas-alvo em que procurar o Sinal.">
        <ContasDoWorkspace publico={publico} aoMudar={aoMudarContas} ajuda={`${publico.listas.length} de ${LIMITES_DO_PLANO.contasEscolhidasMax} escolhidas`} />
        {avisoDasContas && (
          <p role="status" className="text-xs text-al-muted">
            {avisoDasContas}
          </p>
        )}
      </SecaoDoFormulario>

      {erroSalvar && (
        <div role="alert" className="flex items-center justify-between rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
          <span>{erroSalvar}</span>
          <button type="button" onClick={aoFecharErro} className="text-xs text-al-muted hover:text-al-ink underline underline-offset-4">
            Fechar
          </button>
        </div>
      )}

      <BarraDeAcoes>
        <button type="button" onClick={aoVoltar} disabled={salvando} className={BOTAO_SECUNDARIO}>
          Voltar ao briefing
        </button>
        <button
          type="button"
          disabled={!nomeValido || salvando || publico.listas.length === 0}
          onClick={aoSalvar}
          className={BOTAO_PRIMARIO}
        >
          Salvar rascunho
        </button>
      </BarraDeAcoes>
    </>
  )
}

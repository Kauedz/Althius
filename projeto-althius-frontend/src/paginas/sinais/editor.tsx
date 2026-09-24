import { Plus, Sparkles, X } from 'lucide-react'
import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Pulso } from '@/components/marca'
import { Pagina } from '@/components/pagina'
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
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Opcao, SecaoDoFormulario, SeloDoEstado } from './componentes'
import { LISTAS, PUBLICO_RECOMENDADO, VALIDADE_EM_DIAS, publicoInicial, type ModoDePublico, type Monitoramento, type Publico } from './dados-mock'
import { useSinaisDoMockup } from './estado'
import { PerfilPersonalizado } from './perfil-personalizado'
import { criteriosFormatados, resumoDoPublico } from './resumos'

type Etapa = 'descrever' | 'preparando' | 'editar' | 'revisar'

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

/** A preparação simulada de um personalizado: transforma a descrição em critérios editáveis. */
function prepararCriterios(descricao: string, fonte?: string): string[] {
  const pedido = descricao.trim().replace(/\.$/, '')
  return [
    `Empresa do público escolhido em que se observa: ${pedido.charAt(0).toLowerCase()}${pedido.slice(1)}`,
    fonte?.trim() ? `Observar em: ${fonte.trim()}` : 'Fontes públicas sugeridas pela Althius, a confirmar',
    'Dispara na primeira observação; reencontrar o mesmo acontecimento não conta de novo',
    'Guardar como evidência o trecho, a página ou a captura que mostra o acontecimento',
  ]
}

function novoMonitoramento(tipo: TipoDeSinal, aceitaDescoberta: boolean, descricao: string): Monitoramento {
  const personalizado = tipo.id === TIPO_PERSONALIZADO.id
  return {
    id: `novo-${Math.random().toString(36).slice(2, 9)}`,
    tipoId: tipo.id,
    nome: '',
    estado: 'rascunho',
    publico: publicoInicial(aceitaDescoberta),
    criterios: criteriosIniciais(tipo),
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
  const { monitoramentos } = useSinaisDoMockup()
  const tipo = tipoPorId(tipoId)
  const existente = monitoramentos.find((m) => m.id === monitoramentoId && m.tipoId === tipoId)
  if (!tipo) return <Navigate to="/sinais" replace />
  if (monitoramentoId && !existente) return <Navigate to={`/sinais/tipos/${tipo.id}`} replace />
  return <EditorDeMonitoramento key={`${tipo.id}/${monitoramentoId ?? 'novo'}`} tipo={tipo} existente={existente} />
}

function EditorDeMonitoramento({ tipo, existente }: { tipo: TipoDeSinal; existente?: Monitoramento }) {
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const { salvar } = useSinaisDoMockup()
  const familia = familiaDoTipo(tipo)
  const formulario = formularioDoTipo(tipo)
  const personalizado = tipo.id === TIPO_PERSONALIZADO.id

  const [monitoramento, setMonitoramento] = useState<Monitoramento>(
    () => existente ?? novoMonitoramento(tipo, familia?.descoberta ?? true, parametros.get('descricao') ?? ''),
  )
  const [etapa, setEtapa] = useState<Etapa>(() => {
    if (!personalizado) return 'editar'
    if (!existente) return 'descrever'
    return existente.estado === 'em-preparacao' ? 'preparando' : 'editar'
  })

  const jaFunciona = existente?.estado === 'ativo' || existente?.estado === 'pausado'
  const mudar = (parcial: Partial<Monitoramento>) => setMonitoramento((atual) => ({ ...atual, ...parcial }))
  const voltarAoTipo = (aviso: string) => navegar(`/sinais/tipos/${tipo.id}`, { state: { aviso } })
  const nomeValido = monitoramento.nome.trim().length > 0

  const titulo = existente?.nome ?? (personalizado ? 'Novo sinal personalizado' : 'Novo monitoramento')

  return (
    <Pagina titulo={titulo} voltar={{ para: `/sinais/tipos/${tipo.id}`, rotulo: tipo.nome }}>
      <div className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-wrap items-center gap-2">
          <SeloDoEstado estado={etapa === 'preparando' ? 'em-preparacao' : monitoramento.estado} />
          {familia && <span className="selo">{ROTULO_DA_ORIGEM[familia.origem]} · {familia.nome}</span>}
          {!personalizado && <span className="text-sm text-al-muted">{tipo.descricao}</span>}
        </div>

        {etapa === 'descrever' && (
          <Descrever
            monitoramento={monitoramento}
            mudar={mudar}
            aoPreparar={() => {
              mudar({ estado: 'em-preparacao' })
              setEtapa('preparando')
            }}
          />
        )}

        {etapa === 'preparando' && (
          <Preparando
            descricao={monitoramento.descricao ?? ''}
            aoSairEVoltarDepois={() => {
              salvar({
                ...monitoramento,
                estado: 'em-preparacao',
                nome: monitoramento.nome.trim() || resumir(monitoramento.descricao ?? ''),
              })
              voltarAoTipo('Sinal personalizado em preparação. Você revisa os critérios antes de ativar.')
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
                />
              )
            )}

            <SecaoPublico
              publico={monitoramento.publico}
              aceitaDescoberta={familia?.descoberta ?? true}
              aoMudar={(publico) => mudar({ publico })}
            />

            <BarraDeAcoes>
              {jaFunciona ? (
                <button
                  type="button"
                  disabled={!nomeValido}
                  onClick={() => {
                    salvar(monitoramento)
                    voltarAoTipo(`Alterações salvas em “${monitoramento.nome}”.`)
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
                    onClick={() => {
                      salvar({ ...monitoramento, estado: 'rascunho' })
                      voltarAoTipo(`Rascunho “${monitoramento.nome}” salvo.`)
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
          </>
        )}

        {etapa === 'revisar' && (
          <Revisao
            monitoramento={monitoramento}
            aoVoltar={() => setEtapa('editar')}
            aoAtivar={() => {
              salvar({ ...monitoramento, estado: 'ativo' })
              voltarAoTipo(`“${monitoramento.nome}” está ativo. Na demonstração, a coleta é simulada.`)
            }}
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
function Rotulado({
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

function Grupo({ rotulo, ajuda, papel, children }: { rotulo: string; ajuda?: string; papel: 'group' | 'radiogroup'; children: ReactNode }) {
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

function BarraDeAcoes({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-1 flex flex-wrap justify-end gap-2 border-t border-al-line bg-al-bg py-4">{children}</div>
  )
}

function CriteriosProntos({
  formulario,
  criterios,
  aoMudar,
}: {
  formulario: Formulario
  criterios: Criterios
  aoMudar: (criterios: Criterios) => void
}) {
  return (
    <SecaoDoFormulario numero="02" titulo="Critérios" descricao="O que precisa acontecer para disparar um Sinal. Ajuste ao seu negócio.">
      {CAMPOS[formulario].map((campo) => (
        <CampoDeCriterio key={campo.id} campo={campo} valor={criterios[campo.id]} aoMudar={(valor) => aoMudar({ ...criterios, [campo.id]: valor })} />
      ))}
      {formulario === 'verificacao' && (
        <p className="border-l-2 border-al-atencao px-4 text-sm text-al-muted">
          Na demonstração, nenhuma verificação é executada e nenhuma mensagem é enviada.
        </p>
      )}
    </SecaoDoFormulario>
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

  return (
    <SecaoDoFormulario numero="03" titulo="Público" descricao="Onde procurar os Sinais.">
      <aside aria-label="Público recomendado" className="flex flex-col gap-2 border border-al-line bg-al-surface p-4">
        <span className="rotulo inline-flex items-center gap-2 text-al-accent">
          <Sparkles strokeWidth={1.8} className="size-3.5" aria-hidden />
          Recomendado pelas suas configurações
        </span>
        <p className="text-base">{PUBLICO_RECOMENDADO.nome}</p>
        <p className="text-sm text-al-muted">
          {PUBLICO_RECOMENDADO.resumo}. Vem de {PUBLICO_RECOMENDADO.origem} (simulado).
        </p>
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
}: {
  monitoramento: Monitoramento
  mudar: (parcial: Partial<Monitoramento>) => void
  aoPreparar: () => void
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
        <Grupo rotulo="Origem" ajuda="Opcional. Um personalizado pode ser de qualquer origem." papel="radiogroup">
          {origens.map((origem) => (
            <Opcao key={origem ?? 'nao-sei'} papel="radio" marcada={monitoramento.origem === origem} aoClicar={() => mudar({ origem })}>
              {origem ? ROTULO_DA_ORIGEM[origem] : 'Não sei'}
            </Opcao>
          ))}
        </Grupo>
      </SecaoDoFormulario>
      <BarraDeAcoes>
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
  aoSairEVoltarDepois,
  aoConcluir,
}: {
  descricao: string
  aoSairEVoltarDepois: () => void
  aoConcluir: () => void
}) {
  return (
    <section aria-label="Em preparação" className="flex flex-col gap-6 border border-al-line bg-al-surface p-8">
      <div className="flex items-center gap-4">
        <span className="relative size-8">
          <Pulso className="absolute inset-0" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-xl">Em preparação</h2>
          <p className="text-sm text-al-muted">A Althius está transformando a sua descrição em critérios. Você pode sair e voltar depois.</p>
        </div>
      </div>
      <blockquote className="border-l-2 border-al-accent pl-4 text-base">{descricao}</blockquote>
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
  monitoramento: Monitoramento
  mudar: (parcial: Partial<Monitoramento>) => void
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
              className="grid size-10 shrink-0 place-items-center border border-al-line text-al-muted hover:text-al-ink"
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

function Revisao({
  monitoramento,
  aoVoltar,
  aoAtivar,
}: {
  monitoramento: Monitoramento
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
  linhas.push(['Público', resumoDoPublico(monitoramento.publico)])
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
      <p className="anotacao text-base">na demonstração, a coleta é simulada: nenhum dado externo é consultado</p>
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

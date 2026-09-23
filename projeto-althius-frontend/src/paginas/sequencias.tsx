import { useState } from 'react'
import { Calendar, Pause, Plus, Route, Search } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useDadosDeSequencias } from '@/fonte/contexto'
import type { StatusSequencia } from '@/fonte/sequencias-tipos'
import { DetalheSequencia, IconeCanal, SeloStatus } from './detalhe-sequencia'
import { DialogoNovaSequencia } from './nova-sequencia'

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function PaginaSequencias() {
  const { sequenciaId } = useParams<{ sequenciaId?: string }>()

  if (sequenciaId) {
    return (
      <Pagina titulo="Sequências" icone={Route}>
        <DetalheSequencia sequenciaId={sequenciaId} />
      </Pagina>
    )
  }

  return <ListaGlobalSequencias />
}

function ListaGlobalSequencias() {
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusSequencia | 'todos'>('todos')
  const [dialogoNovaAberto, setDialogoNovaAberto] = useState(false)

  const {
    dados: sequencias,
    carregando,
    erro,
    recarregar,
  } = useDadosDeSequencias((f) => f.sequencias(), [])

  const { dados: contas } = useDadosDeContas((f) => f.contas(), [])
  const { dados: contatos } = useDadosDeContas((f) => f.contatos(), [])

  const contasMap = new Map(contas?.map((c) => [c.id, c]) ?? [])
  const contatosMap = new Map(contatos?.map((c) => [c.id, c]) ?? [])

  const termoBuscaNormalizado = normalizar(busca)

  const sequenciasFiltradas = (sequencias ?? []).filter((seq) => {
    // Filtro por status
    if (filtroStatus !== 'todos' && seq.status !== filtroStatus) {
      return false
    }

    // Busca por Conta-alvo (nome da empresa ou id)
    if (termoBuscaNormalizado) {
      const conta = contasMap.get(seq.contaId)
      const nomeConta = normalizar(conta?.nome ?? seq.contaId)
      const idConta = normalizar(seq.contaId)
      if (!nomeConta.includes(termoBuscaNormalizado) && !idConta.includes(termoBuscaNormalizado)) {
        return false
      }
    }

    return true
  })

  // Contagens por status para o select
  const contagens = {
    ativa: (sequencias ?? []).filter((s) => s.status === 'ativa').length,
    pausada: (sequencias ?? []).filter((s) => s.status === 'pausada').length,
    reuniao: (sequencias ?? []).filter((s) => s.status === 'reuniao').length,
    esgotada: (sequencias ?? []).filter((s) => s.status === 'esgotada').length,
  }

  const totalSequencias = sequencias?.length ?? 0
  const totalFiltradas = sequenciasFiltradas.length

  const textoContagem =
    totalFiltradas === totalSequencias
      ? `${totalSequencias} ${totalSequencias === 1 ? 'sequência' : 'sequências'}`
      : `Exibindo ${totalFiltradas} de ${totalSequencias} ${totalSequencias === 1 ? 'sequência' : 'sequências'}`

  return (
    <Pagina titulo="Sequências" icone={Route}>
      <div className="flex flex-col gap-1">
        <h2 className="sr-only">Planos de Sequência</h2>
        <p className="text-sm text-al-muted">
          Planos de abordagem por Conta-alvo. Uma sequência por Conta; qualquer resposta pausa a Conta inteira.
        </p>
        {sequencias && (
          <span className="rotulo text-xs text-al-muted">
            {textoContagem}
          </span>
        )}
      </div>

      {carregando && <Carregando />}

      {erro && (
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-al-muted">Não foi possível carregar as sequências.</p>
          <Button
            type="button"
            variant="outline"
            onClick={recarregar}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!carregando && !erro && sequencias && sequencias.length === 0 && (
        <div className="flex flex-col items-start gap-4 py-12">
          <p className="text-sm text-al-muted">
            Nenhuma sequência ainda. Crie uma nova sequência para uma Conta-alvo ou solicite ao Rhetor na Conversa.
          </p>
          <Button
            type="button"
            onClick={() => setDialogoNovaAberto(true)}
            className="h-9 border border-al-line bg-al-surface px-4 text-xs font-medium tracking-rotulo text-al-ink uppercase hover:bg-al-bg"
          >
            <Plus className="size-4 mr-1.5" /> Nova sequência
          </Button>
        </div>
      )}

      {!carregando && !erro && sequencias && sequencias.length > 0 && (
        <div className="flex flex-col gap-4 py-2">
          {/* Barra de Ferramentas: Busca, Filtro e Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[220px] max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-al-muted" />
                <input
                  type="search"
                  placeholder="Buscar por Conta-alvo"
                  aria-label="Buscar por Conta-alvo"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="campo pl-9 h-9 text-xs text-al-ink placeholder:text-al-muted"
                />
              </div>

              <select
                aria-label="Filtrar por status"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as StatusSequencia | 'todos')}
                className="campo h-9 w-auto text-xs text-al-ink bg-al-bg"
              >
                <option value="todos">Todos os status</option>
                <option value="ativa">Ativa ({contagens.ativa})</option>
                <option value="pausada">Pausada ({contagens.pausada})</option>
                <option value="reuniao">Reunião ({contagens.reuniao})</option>
                <option value="esgotada">Esgotada ({contagens.esgotada})</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={() => setDialogoNovaAberto(true)}
              className="h-9 border border-al-accent bg-al-accent px-4 text-xs font-medium tracking-rotulo text-al-on-accent uppercase hover:bg-al-accent-2"
            >
              <Plus className="size-4 mr-1.5" /> Nova sequência
            </Button>
          </div>

          {/* Estado sem resultados no filtro */}
          {sequenciasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 border border-al-line bg-al-surface py-12 text-center">
              <strong className="text-sm font-medium text-al-ink">Nenhuma sequência encontrada</strong>
              <p className="text-xs text-al-muted">Ajuste a busca ou o filtro de status.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label="Tabela de Sequências"
                className="w-full border-collapse text-left text-sm"
              >
                <thead>
                  <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
                    <th scope="col" className="py-3 pr-4 font-normal">
                      Conta-alvo
                    </th>
                    <th scope="col" className="py-3 px-4 font-normal">
                      Status
                    </th>
                    <th scope="col" className="py-3 px-4 font-normal">
                      Cobertura
                    </th>
                    <th scope="col" className="py-3 px-4 font-normal">
                      Próximo step
                    </th>
                    <th scope="col" className="py-3 pl-4 font-normal">
                      Progresso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-al-line">
                  {sequenciasFiltradas.map((seq) => {
                    const conta = contasMap.get(seq.contaId)
                    const nomeConta = conta?.nome ?? seq.contaId
                    const totalConta = conta?.totalContatos
                    const stepAtual = seq.steps[seq.passoAtual]
                    const contatoDoStep = stepAtual ? contatosMap.get(stepAtual.contatoId) : null
                    const percentualProgresso =
                      seq.steps.length > 0
                        ? Math.round((seq.passoAtual / seq.steps.length) * 100)
                        : 0

                    return (
                      <tr
                        key={seq.id}
                        onClick={() => navegar(`/sequencias/${seq.id}`)}
                        className="h-12 cursor-pointer hover:bg-al-surface/60 transition-colors"
                      >
                        <td className="py-3 pr-4 font-medium text-al-ink">
                          <div className="flex flex-col">
                            <Link
                              to={`/sequencias/${seq.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-al-ink hover:underline hover:text-al-accent"
                            >
                              {nomeConta}
                            </Link>
                            {conta?.dominio && (
                              <span className="text-xs text-al-muted">{conta.dominio}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <SeloStatus status={seq.status} />
                        </td>

                        <td className="py-3 px-4 text-al-muted text-xs">
                          <span>
                            {seq.totalParticipantes}{' '}
                            {seq.totalParticipantes === 1 ? 'contato' : 'contatos'}
                            {totalConta ? ` de ${totalConta}` : ''}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-xs text-al-muted">
                          {seq.status === 'pausada' ? (
                            <span className="inline-flex items-center gap-1.5 text-al-atencao">
                              <Pause className="size-3.5 shrink-0" />
                              <span className="truncate">
                                {seq.motivoPause
                                  ? (seq.motivoPause.toLowerCase().startsWith('pausada')
                                      ? seq.motivoPause
                                      : `Pausada · ${seq.motivoPause}`)
                                  : 'Pausada · aguardando análise humana'}
                              </span>
                            </span>
                          ) : seq.status === 'reuniao' ? (
                            <span className="inline-flex items-center gap-1.5 text-al-accent">
                              <Calendar className="size-3.5 shrink-0" />
                              <span>Reunião marcada</span>
                            </span>
                          ) : seq.status === 'esgotada' ? (
                            <span>Todos os steps concluídos</span>
                          ) : stepAtual ? (
                            <span className="inline-flex items-center gap-2 text-al-ink">
                              <IconeCanal canal={stepAtual.canal} />
                              <span className="truncate">
                                Step {seq.passoAtual + 1} · {stepAtual.titulo}
                                {contatoDoStep ? ` para ${contatoDoStep.nome}` : ''}
                              </span>
                            </span>
                          ) : (
                            <span>Todos os steps concluídos</span>
                          )}
                        </td>

                        <td className="py-3 pl-4 text-xs text-al-muted">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-al-line overflow-hidden">
                              <div
                                className="h-full bg-al-ink transition-all"
                                style={{ width: `${percentualProgresso}%` }}
                              />
                            </div>
                            <span>
                              {seq.passoAtual}/{seq.steps.length} steps
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Diálogo Nova Sequência */}
      <DialogoNovaSequencia
        aberto={dialogoNovaAberto}
        aoMudar={setDialogoNovaAberto}
      />
    </Pagina>
  )
}

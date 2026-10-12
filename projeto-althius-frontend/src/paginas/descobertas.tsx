import { Building2, ExternalLink, Check, Trash2, RotateCcw, Sparkles, RefreshCw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { Carregando } from '@/components/marca'
import { useDadosDeDescobertas, useFonteDeDescobertas } from '@/fonte/contexto'
import type { ContaDescoberta, EstadoContaDescoberta } from '@/fonte/descobertas-tipos'
import { cn } from '@/lib/utils'
import { AbasDoModulo, CampoDeBusca, Contagem } from './modulo-contas-e-contatos'

const INTERVALO_POLLING_MS = 5_000

const rotuloCreditos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'crédito' : 'créditos'}`

export function PaginaDescobertas() {
  const fonte = useFonteDeDescobertas()
  const [estadoAba, setEstadoAba] = useState<EstadoContaDescoberta>('nova')
  const [busca, setBusca] = useState('')
  const [pedindoBusca, setPedindoBusca] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [modalUrl, setModalUrl] = useState<{ id: string; nome: string } | null>(null)
  const [urlInformada, setUrlInformada] = useState('')
  const [motivoDescarte, setMotivoDescarte] = useState<{ id: string; nome: string } | null>(null)
  const [textoDescarte, setTextoDescarte] = useState('')

  const { dados: cotacao, recarregar: recarregarCotacao } = useDadosDeDescobertas(
    (f) => f.cotarBusca(),
    [],
  )

  const {
    dados: candidatas,
    carregando,
    recarregar: recarregarLista,
  } = useDadosDeDescobertas(
    (f) => f.listarDescobertas(estadoAba),
    [estadoAba],
  )

  const emAndamento = cotacao?.emAndamento ?? false
  const custoId = useId()

  // Polling enquanto a busca em segundo plano está ativa
  useEffect(() => {
    if (!emAndamento) return
    const timer = setInterval(() => {
      recarregarCotacao()
      recarregarLista()
    }, INTERVALO_POLLING_MS)
    return () => clearInterval(timer)
  }, [emAndamento, recarregarCotacao, recarregarLista])

  if (!fonte) {
    return (
      <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
        <AbasDoModulo />
        <div className="py-12 text-sm text-al-muted">
          A Caixa de Descobertas não está disponível neste ambiente.
        </div>
      </Pagina>
    )
  }

  const semSaldo = cotacao ? cotacao.saldoDisponivel < cotacao.creditos : false
  const botaoDesabilitado = pedindoBusca || emAndamento || semSaldo

  async function dispararBusca() {
    if (!fonte) return
    setPedindoBusca(true)
    setErroAcao(null)
    try {
      await fonte.buscarContas()
      recarregarCotacao()
      recarregarLista()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Erro ao iniciar busca de contas.')
    } finally {
      setPedindoBusca(false)
    }
  }

  async function aceitar(candidata: ContaDescoberta, url?: string) {
    setErroAcao(null)
    const site = url ?? candidata.website
    if (!site) {
      setModalUrl({ id: candidata.id, nome: candidata.nome })
      setUrlInformada('')
      return
    }
    try {
      await fonte.aceitarDescoberta(candidata.id, site)
      setModalUrl(null)
      recarregarLista()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível aceitar a candidata.')
    }
  }

  async function confirmarDescarte() {
    if (!motivoDescarte || !fonte) return
    setErroAcao(null)
    try {
      await fonte.descartarDescoberta(motivoDescarte.id, textoDescarte.trim() || undefined)
      setMotivoDescarte(null)
      setTextoDescarte('')
      recarregarLista()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível descartar a candidata.')
    }
  }

  async function restaurar(id: string) {
    if (!fonte) return
    setErroAcao(null)
    try {
      await fonte.restaurarDescoberta(id)
      recarregarLista()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível restaurar a candidata.')
    }
  }

  const listaFiltrada = (candidatas ?? []).filter((c) => {
    if (!busca.trim()) return true
    const termo = busca.toLowerCase()
    return (
      c.nome.toLowerCase().includes(termo) ||
      (c.dominio && c.dominio.toLowerCase().includes(termo)) ||
      (c.setor && c.setor.toLowerCase().includes(termo)) ||
      (c.cnpj && c.cnpj.includes(termo))
    )
  })

  return (
    <Pagina titulo="Contas" icone={Building2} ocupaAJanela>
      <AbasDoModulo />

      <div className="flex flex-col gap-4 border-b border-al-line pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-al-ink">Descobertas por ICP</h2>
            <p className="text-sm text-al-muted">
              Empresas candidatas encontradas pelo seu Perfil de Cliente Ideal aguardando aprovação
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={botaoDesabilitado}
              onClick={dispararBusca}
              aria-describedby={custoId}
              className="h-9 border-al-accent bg-al-accent/5 text-xs font-medium tracking-rotulo text-al-accent uppercase hover:bg-al-accent/10"
            >
              {emAndamento ? (
                <RefreshCw className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" aria-hidden />
              )}
              {emAndamento ? 'Buscando contas pelo ICP…' : 'Buscar contas pelo ICP'}
            </Button>
            {cotacao && !emAndamento && (
              <span id={custoId} className="text-xs text-al-muted">
                {rotuloCreditos(cotacao.creditos)}
              </span>
            )}
          </div>
        </div>

        {semSaldo && !emAndamento && cotacao && (
          <p className="text-xs text-al-atencao">
            Sem créditos suficientes: o saldo disponível é {rotuloCreditos(cotacao.saldoDisponivel)}.
          </p>
        )}

        {erroAcao && (
          <p role="alert" className="text-xs text-al-atencao">
            {erroAcao}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Abas de estado: Novas / Aceitas / Descartadas */}
          <div className="flex h-9 border border-al-line" role="tablist">
            {(['nova', 'aceita', 'descartada'] as const).map((aba) => (
              <button
                key={aba}
                type="button"
                role="tab"
                aria-selected={estadoAba === aba}
                onClick={() => setEstadoAba(aba)}
                className={cn(
                  'px-4 text-xs font-medium tracking-rotulo uppercase transition-colors',
                  estadoAba === aba
                    ? 'bg-al-surface text-al-ink font-semibold'
                    : 'text-al-muted hover:text-al-ink hover:bg-al-bg',
                )}
              >
                {aba === 'nova' ? 'Novas' : aba === 'aceita' ? 'Aceitas' : 'Descartadas'}
              </button>
            ))}
          </div>

          <div className="flex flex-1 max-w-sm items-center gap-2">
            <CampoDeBusca
              rotulo="Buscar candidatas"
              placeholder="Buscar por empresa, domínio ou CNPJ"
              valor={busca}
              buscar={setBusca}
            />
          </div>

          {candidatas && (
            <Contagem
              exibidos={listaFiltrada.length}
              total={candidatas.length}
              recortada={listaFiltrada.length !== candidatas.length}
              singular="candidata"
              plural="candidatas"
            />
          )}
        </div>
      </div>

      {carregando && <Carregando />}

      {!carregando && candidatas && candidatas.length === 0 && (
        <div className="py-16 text-center text-sm text-al-muted">
          {estadoAba === 'nova'
            ? 'Nenhuma candidata pendente na Caixa. Clique em "Buscar contas pelo ICP" para encontrar novos leads.'
            : estadoAba === 'aceita'
            ? 'Nenhuma conta foi aceita ainda.'
            : 'Nenhuma conta descartada.'}
        </div>
      )}

      {!carregando && candidatas && candidatas.length > 0 && listaFiltrada.length === 0 && (
        <div className="py-12 text-center text-sm text-al-muted">
          Nenhuma candidata encontrada para “{busca.trim()}”.
        </div>
      )}

      {!carregando && listaFiltrada.length > 0 && (
        <div className="min-h-0 overflow-auto">
          <table
            aria-label="Tabela de Descobertas"
            className="w-full min-w-[56rem] table-fixed border-separate border-spacing-0 text-left text-sm"
          >
            <thead>
              <tr className="border-b border-al-line text-xs tracking-rotulo uppercase text-al-muted">
                <th scope="col" className="p-3 font-medium">Empresa</th>
                <th scope="col" className="p-3 font-medium w-36">Encaixe ICP</th>
                <th scope="col" className="p-3 font-medium w-40">Localização</th>
                <th scope="col" className="p-3 font-medium w-48">Setor / Porte</th>
                <th scope="col" className="p-3 font-medium">Motivos / Sinais</th>
                <th scope="col" className="p-3 font-medium w-36 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-al-line">
              {listaFiltrada.map((c) => (
                <tr key={c.id} className="hover:bg-al-surface/40 transition-colors">
                  <td className="p-3 align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-al-ink">{c.nome}</span>
                      <div className="flex items-center gap-2 text-xs text-al-muted">
                        {c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-al-accent hover:underline"
                          >
                            {c.dominio || 'Site'}
                            <ExternalLink className="size-2.5" aria-hidden />
                          </a>
                        ) : (
                          <span className="italic">Sem site</span>
                        )}
                        {c.linkedinUrl && (
                          <>
                            <span>·</span>
                            <a
                              href={c.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:text-al-accent hover:underline"
                            >
                              LinkedIn
                              <ExternalLink className="size-2.5" aria-hidden />
                            </a>
                          </>
                        )}
                      </div>
                      {c.cnpj && <span className="text-[0.75rem] text-al-muted">CNPJ: {c.cnpj}</span>}
                    </div>
                  </td>

                  <td className="p-3 align-top">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded',
                        c.fitLevel === 'alto' && 'bg-al-sucesso-suave text-al-sucesso',
                        c.fitLevel === 'medio' && 'bg-al-atencao-suave text-al-atencao',
                        c.fitLevel === 'baixo' && 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
                      )}
                    >
                      Encaixe {c.fitLevel}
                    </span>
                  </td>

                  <td className="p-3 align-top text-xs text-al-ink">
                    {c.localizacao || c.uf || '—'}
                  </td>

                  <td className="p-3 align-top text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-al-ink truncate">{c.setor || '—'}</span>
                      {c.tamanho && <span className="text-al-muted">{c.tamanho}</span>}
                    </div>
                  </td>

                  <td className="p-3 align-top">
                    <div className="flex flex-col gap-1 text-xs">
                      {c.motivos.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.motivos.map((m, i) => (
                            <span key={i} className="inline-block bg-al-surface px-1.5 py-0.5 text-[0.75rem] text-al-ink border border-al-line">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.sinais.length > 0 && (
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          {c.sinais.slice(0, 2).map((s, i) => (
                            <span key={i} className="text-[0.75rem] text-al-muted truncate">
                              • {s.frase}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="p-3 align-top text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {estadoAba === 'nova' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => aceitar(c)}
                            title="Aceitar candidata e criar Conta-alvo"
                            className="h-8 border border-al-sucesso bg-al-sucesso px-2.5 text-xs text-al-on-accent hover:opacity-90"
                          >
                            <Check className="mr-1 size-3.5" aria-hidden />
                            Aceitar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMotivoDescarte({ id: c.id, nome: c.nome })
                              setTextoDescarte('')
                            }}
                            title="Descartar da Caixa de Descobertas"
                            className="h-8 px-2 text-xs text-al-muted hover:text-al-atencao"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </>
                      )}

                      {estadoAba === 'aceita' && (
                        <span className="inline-flex items-center gap-1 text-xs text-al-sucesso font-medium">
                          <Check className="size-3.5" aria-hidden />
                          {c.targetAccountId ? (
                            <Link to={`/contas/${c.targetAccountId}`} className="hover:underline">
                              Ver conta
                            </Link>
                          ) : (
                            'Aceita'
                          )}
                        </span>
                      )}

                      {estadoAba === 'descartada' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => restaurar(c.id)}
                          className="h-8 px-2.5 text-xs text-al-ink hover:bg-al-surface"
                        >
                          <RotateCcw className="mr-1 size-3" aria-hidden />
                          Restaurar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal para informar o site da empresa quando faltar */}
      {modalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md border border-al-line bg-al-surface p-6 shadow-xl">
            <h3 className="text-base font-semibold text-al-ink">Informar site de {modalUrl.nome}</h3>
            <p className="mt-1 text-xs text-al-muted">
              Uma Conta-alvo requer o endereço do site da empresa como identidade para evitar duplicidades.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-al-ink uppercase tracking-rotulo">
                Endereço do site (URL)
              </label>
              <input
                type="url"
                required
                placeholder="https://empresa.com.br"
                value={urlInformada}
                onChange={(e) => setUrlInformada(e.target.value)}
                className="mt-1 w-full border border-al-line bg-al-bg px-3 py-2 text-sm text-al-ink outline-none focus:border-al-accent"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setModalUrl(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!urlInformada.trim()}
                onClick={() => {
                  const candidata = candidatas?.find((c) => c.id === modalUrl.id)
                  if (candidata) aceitar(candidata, urlInformada)
                }}
                className="bg-al-accent text-al-on-accent hover:bg-al-accent-2"
              >
                Confirmar e Aceitar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de descarte com motivo */}
      {motivoDescarte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md border border-al-line bg-al-surface p-6 shadow-xl">
            <h3 className="text-base font-semibold text-al-ink">Descartar {motivoDescarte.nome}?</h3>
            <p className="mt-1 text-xs text-al-muted">
              A empresa sairá da lista e a Caixa lembrará dela para não voltar em buscas futuras.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-al-ink uppercase tracking-rotulo">
                Motivo do descarte (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex.: Fora do ICP, porte menor que o mínimo, etc."
                value={textoDescarte}
                onChange={(e) => setTextoDescarte(e.target.value)}
                maxLength={300}
                className="mt-1 w-full border border-al-line bg-al-bg px-3 py-2 text-sm text-al-ink outline-none focus:border-al-accent"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMotivoDescarte(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmarDescarte}
                className="bg-al-atencao text-white hover:bg-al-atencao/90"
              >
                Descartar
              </Button>
            </div>
          </div>
        </div>
      )}
    </Pagina>
  )
}

import { Building2, ExternalLink, Check, ChevronDown, ChevronUp, Trash2, RotateCcw, Sparkles, RefreshCw } from 'lucide-react'
import { Fragment, useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pagina } from '@/components/pagina'
import { PorQueEssaAderencia } from '@/components/por-que-essa-aderencia'
import type { ExplicacaoDeAderencia } from '@/fonte/aderencia-explicada'
import { Button } from '@/components/ui/button'
import { Carregando } from '@/components/marca'
import { useDados, useDadosDeDescobertas, useFonteDeContas, useFonteDeDescobertas } from '@/fonte/contexto'
import type { ContaDescoberta, CriteriosDaBusca, EstadoContaDescoberta, OrigemDaDescoberta, ResultadoDoAceite, SinalDoMotivo } from '@/fonte/descobertas-tipos'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import {
  ajustesDaCandidata,
  fraseDoAjuste,
  MOTIVOS_DO_DESCARTE,
  type AjusteAprendido,
  type CodigoDoDescarte,
} from '@/fonte/aprendizado-da-descoberta'
import { cn } from '@/lib/utils'
import { EtiquetasDeTexto } from '@/components/etiquetas-de-texto'
import { SelecaoMultipla } from '@/components/selecao-multipla'
import { PORTES_DO_ICP } from '@/fonte/campos-do-icp'
import { PORTES_DA_RECEITA, ROTULOS_DOS_PORTES, SETORES_DA_BUSCA } from '@/fonte/opcoes-da-busca'
import { useDadosDoBrasil } from './sinais/dados-do-brasil'
import { AbasDoModulo, CampoDeBusca, Contagem } from './modulo-contas-e-contatos'

const INTERVALO_POLLING_MS = 5_000

const rotuloCreditos = (n: number) => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'crédito' : 'créditos'}`

const ROTULO_DA_ORIGEM: Record<OrigemDaDescoberta, string> = { sinal: 'Sinal', busca: 'Busca', sincronizacao: 'Sincronização' }
const ORDEM_DAS_ORIGENS: OrigemDaDescoberta[] = ['sinal', 'busca', 'sincronizacao']

const ROTULO_DO_ENCAIXE: Record<ContaDescoberta['fitLevel'], string> = {
  alto: 'Encaixe alto',
  medio: 'Encaixe medio',
  baixo: 'Encaixe baixo',
  sem_dado: 'Encaixe sem dado',
}

/** O dia e o mês de um Sinal, como a pessoa escreve ("12/10"), no fuso de Brasília. */
function diaEMes(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const minuscula = (frase: string) => (frase ? frase.charAt(0).toLowerCase() + frase.slice(1) : frase)

/** O Sinal mais recente em linguagem de usuário: "Sinal: abriu filial em Campinas (12/10)". */
export function frasePorExtensoDoSinal(sinal: SinalDoMotivo): string {
  return `Sinal: ${minuscula(sinal.frase.replace(/\.$/, ''))} (${diaEMes(sinal.data)})`
}

/** A primeira frase do aviso depois de aceitar: a Conta e os Sinais que vieram com ela. */
function baseDoAviso(nome: string, r: ResultadoDoAceite): string {
  const sinais = r.sinaisMigrados > 0 ? ` com ${r.sinaisMigrados} ${r.sinaisMigrados === 1 ? 'Sinal' : 'Sinais'}` : ''
  return r.created ? `${nome} agora é uma Conta-alvo${sinais}.` : `${nome} já era uma Conta-alvo${sinais}.`
}

/** O que a pessoa lê depois de aceitar, e o que aconteceu com o Comitê (o aceite confere o saldo e o limite do mês). */
function avisoDoAceite(nome: string, r: ResultadoDoAceite): string {
  const base = baseDoAviso(nome, r)
  if (r.comite === 'liberado') return `${base} Buscando o Comitê de compra…`
  if (r.comite === 'limite_do_mes') {
    return `${base} Limite do mês atingido. A Automação volta na renovação ou fale com a equipe Althius. Use Enriquecer Comitê na Conta quando houver limite.`
  }
  if (r.comite === 'sem_contrato') return `${base} Sem contrato ativo, o Comitê não pode ser enriquecido agora.`
  return `${base} Sem créditos suficientes para enriquecer o Comitê agora: use Enriquecer Comitê na Conta quando houver saldo.`
}

/** O detalhe de uma candidata: o que a descreve e todos os Sinais que a trouxeram, com data e fonte pública. */
function DetalheDaCandidata({
  candidata,
  ajustes = [],
  explicar,
}: {
  candidata: ContaDescoberta
  ajustes?: AjusteAprendido[]
  explicar?: (id: string) => Promise<ExplicacaoDeAderencia>
}) {
  const aprendido = ajustesDaCandidata(candidata, ajustes)[0]
  return (
    <div aria-label={`Detalhes de ${candidata.nome}`} role="group" className="flex flex-col gap-3 text-xs">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-al-muted">
        <span>Origem: {ROTULO_DA_ORIGEM[candidata.origem]}</span>
        {candidata.descricao && <span className="text-al-ink">{candidata.descricao}</span>}
      </div>
      {explicar && <PorQueEssaAderencia key={candidata.id} explicar={() => explicar(candidata.id)} />}
      {aprendido && <p className="text-al-muted">{fraseDoAjuste(aprendido)}.</p>}
      {candidata.voltouPorSinalEm && (
        <p className="text-al-ink">
          <span className="font-medium text-al-accent">Voltou por novo Sinal</span> em {formatarDataCompleta(candidata.voltouPorSinalEm)}.
          {candidata.motivoDoDescarteAnterior ? ` Motivo do descarte anterior: ${candidata.motivoDoDescarteAnterior}.` : ''}
        </p>
      )}
      {candidata.motivosDeSinal.length > 0 ? (
        <ul aria-label="Sinais da candidata" className="flex flex-col divide-y divide-al-line border-y border-al-line">
          {candidata.motivosDeSinal.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
              <span className={m.valido ? 'text-al-ink' : 'text-al-muted'}>{m.frase}</span>
              <span className="text-al-muted">
                {formatarDataCompleta(m.data)}
                {m.fonte ? ` · ${m.fonte}` : ''}
                {m.valido ? '' : ' · vencido'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-al-muted">Nenhum Sinal registrado para esta candidata.</p>
      )}
    </div>
  )
}

export function PaginaDescobertas() {
  const fonte = useFonteDeDescobertas()
  const dadosDoBrasil = useDadosDoBrasil()
  const fonteDeContas = useFonteDeContas()
  const saldo = useDados((f) => (f.saldoDeCreditos ? f.saldoDeCreditos() : Promise.resolve(null)), [])
  const [estadoAba, setEstadoAba] = useState<EstadoContaDescoberta>('nova')
  const [busca, setBusca] = useState('')
  const [pedindoBusca, setPedindoBusca] = useState(false)
  const [criteriosBusca, setCriteriosBusca] = useState<{ criterios: CriteriosDaBusca; icpVersion: number | null; resumo: string; temIcp: boolean } | null>(null)
  const [criteriosEditados, setCriteriosEditados] = useState<CriteriosDaBusca | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [modalUrl, setModalUrl] = useState<{ id: string; nome: string } | null>(null)
  const [urlInformada, setUrlInformada] = useState('')
  const [motivoDescarte, setMotivoDescarte] = useState<{ id: string; nome: string } | null>(null)
  const [textoDescarte, setTextoDescarte] = useState('')
  const [codigoDescarte, setCodigoDescarte] = useState<CodigoDoDescarte | null>(null)
  const [ajustes, setAjustes] = useState<AjusteAprendido[]>([])
  const [versaoDoAprendizado, setVersaoDoAprendizado] = useState(0)
  const workspace = useDados((f) => f.workspace(), [])
  useEffect(() => {
    if (!fonte?.aprendizado) return
    let vivo = true
    fonte
      .aprendizado()
      .then((lista) => vivo && setAjustes(lista))
      .catch(() => vivo && setAjustes([]))
    return () => {
      vivo = false
    }
  }, [fonte, versaoDoAprendizado])
  const [filtroOrigem, setFiltroOrigem] = useState<OrigemDaDescoberta | 'todas'>('todas')
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)
  const [avisoDeAceite, setAvisoDeAceite] = useState<string | null>(null)

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

  // "Ver candidata", vindo de Mercado e de Sinais encontrados: abre a aba onde a candidata está, com o detalhe aberto.
  const [parametros] = useSearchParams()
  const candidataDoLink = parametros.get('candidata')
  useEffect(() => {
    if (!candidataDoLink || !fonte) return
    let ativo = true
    void (async () => {
      for (const estado of ['nova', 'aceita', 'descartada'] as const) {
        const lista = await fonte.listarDescobertas(estado).catch(() => [])
        if (!ativo) return
        if (lista.some((c) => c.id === candidataDoLink)) {
          setEstadoAba(estado)
          setDetalheAberto(candidataDoLink)
          return
        }
      }
    })()
    return () => {
      ativo = false
    }
  }, [candidataDoLink, fonte])

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

  const ilimitado = saldo?.ilimitado === true
  const semSaldo = ilimitado ? false : cotacao ? cotacao.saldoDisponivel < cotacao.creditos : false
  const botaoDesabilitado = pedindoBusca || emAndamento || semSaldo

  async function dispararBusca() {
    if (!fonte) return
    setPedindoBusca(true)
    setErroAcao(null)
    try {
      const resultado = await fonte.criteriosDaBusca()
      setCriteriosBusca({ criterios: resultado.criterios, icpVersion: resultado.icpVersion, resumo: resultado.icpResumo, temIcp: resultado.temIcp })
      setCriteriosEditados(resultado.criterios)
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Erro ao iniciar busca de contas.')
    } finally {
      setPedindoBusca(false)
    }
  }

  // Região no formato que a busca já entende (account-discovery/regioes.ts): "Brasil", a sigla da UF ou "Cidade, UF".
  const opcoesDeRegiao = dadosDoBrasil
    ? [
        { valor: 'Brasil' },
        ...dadosDoBrasil.localidades.ufs.map(([uf, nome]) => ({ valor: uf, detalhe: nome })),
        ...dadosDoBrasil.localidades.cidades.map(([cidade, uf]) => ({ valor: `${cidade}, ${uf}` })),
      ]
    : []
  const opcoesDeCnae = dadosDoBrasil
    ? (['subclasses'] as const).flatMap((nivel) =>
        (dadosDoBrasil.cnae[nivel] as [string, string, string?][]).map(([codigo, descricao]) => ({ valor: codigo, detalhe: descricao })),
      )
    : []
  const opcoesDePorte = (fonte: CriteriosDaBusca['fonte']) =>
    PORTES_DO_ICP.filter((p) => fonte === 'receita' || !PORTES_DA_RECEITA.includes(p)).map((valor) => ({
      valor,
      rotulo: ROTULOS_DOS_PORTES[valor] ?? valor,
    }))
  const opcoesDeSetor = [...new Set([...(criteriosBusca?.criterios.setores ?? []), ...SETORES_DA_BUSCA])].map((valor) => ({ valor }))
  const criteriosDoDialog = criteriosEditados ?? criteriosBusca?.criterios ?? null
  const criteriosValidos = criteriosDoDialog ? criteriosDoDialog.setores.length > 0 || criteriosDoDialog.palavrasChave.length > 0 : false

  async function confirmarBusca() {
    if (!criteriosBusca || !criteriosDoDialog || !criteriosValidos) return
    setPedindoBusca(true)
    setErroAcao(null)
    try {
      const allowTesting = cotacao?.estadoDoActor === 'testing' && cotacao.podeTestar
      if (cotacao?.estadoDoActor === 'testing' && !cotacao.podeTestar) {
        setErroAcao('A fonte desta busca ainda está em validação pela equipe Althius.')
        return
      }
      await fonte.buscarContas({ criterios: criteriosDoDialog, icpVersion: criteriosBusca.icpVersion, allowTesting })
      setCriteriosBusca(null)
      recarregarCotacao()
      recarregarLista()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Erro ao iniciar busca de contas.')
    } finally { setPedindoBusca(false) }
  }

  async function aceitar(candidata: ContaDescoberta, url?: string) {
    setErroAcao(null)
    setAvisoDeAceite(null)
    const site = url ?? candidata.website
    // O site é opcional quando há CNPJ: a Conta nasce sem site. Sem site e sem CNPJ, a pessoa informa o endereço.
    if (!site && !candidata.cnpj) {
      setModalUrl({ id: candidata.id, nome: candidata.nome })
      setUrlInformada('')
      return
    }
    try {
      const resultado = await fonte.aceitarDescoberta(candidata.id, site)
      setModalUrl(null)
      setAvisoDeAceite(avisoDoAceite(candidata.nome, resultado))
      recarregarLista()
      // O Comitê só dispara se o saldo e o limite do mês permitem (o aceite confere); senão a Conta fica com "Enriquecer Comitê".
      let aviso = avisoDoAceite(candidata.nome, resultado)
      if (resultado.comite === 'liberado' && fonteDeContas.buscarComite) {
        try {
          const comite = await fonteDeContas.buscarComite(resultado.targetAccountId)
          aviso = `${baseDoAviso(candidata.nome, resultado)} Comitê de compra: ${comite.novas} ${comite.novas === 1 ? 'pessoa sugerida' : 'pessoas sugeridas'} para abordagem.`
        } catch (e) {
          aviso = `${baseDoAviso(candidata.nome, resultado)} Não foi possível enriquecer o Comitê agora: use Enriquecer Comitê na Conta.${e instanceof Error && e.message ? ` Motivo: ${e.message}.` : ''}`
        }
        setAvisoDeAceite(aviso)
      }
      if (candidata.cnpj && fonteDeContas.enriquecerReceita) {
        try {
          await fonteDeContas.enriquecerReceita(resultado.targetAccountId, candidata.cnpj)
          aviso += ' Dados da Receita: ok.'
        } catch (e) {
          aviso += ` Dados da Receita: não foi possível consultar agora.${e instanceof Error && e.message ? ` Motivo: ${e.message}.` : ''}`
        }
        setAvisoDeAceite(aviso)
      }
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível aceitar a candidata.')
    }
  }

  async function confirmarDescarte() {
    if (!motivoDescarte || !fonte) return
    setErroAcao(null)
    try {
      await fonte.descartarDescoberta(motivoDescarte.id, textoDescarte.trim() || undefined, codigoDescarte ?? undefined)
      setMotivoDescarte(null)
      setTextoDescarte('')
      setCodigoDescarte(null)
      setVersaoDoAprendizado((v) => v + 1)
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

  // As origens que existem na lista: "Sincronização" só aparece quando há dado dessa origem.
  const origensPresentes = ORDEM_DAS_ORIGENS.filter((o) => (candidatas ?? []).some((c) => c.origem === o))
  const origemEmUso = filtroOrigem !== 'todas' && origensPresentes.includes(filtroOrigem) ? filtroOrigem : 'todas'
  const opcoesDeOrigem = ORDEM_DAS_ORIGENS.filter((o) => o !== 'sincronizacao' || origensPresentes.includes(o))

  const listaFiltrada = (candidatas ?? []).filter((c) => {
    if (origemEmUso !== 'todas' && c.origem !== origemEmUso) return false
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
              className="h-9 border-al-accent bg-al-accent/5 text-sm font-medium tracking-[0.04em] text-al-accent hover:bg-al-accent/10"
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
                {ilimitado ? 'Ilimitado (interno)' : rotuloCreditos(cotacao.creditos)}
              </span>
            )}
          </div>
        </div>

        {semSaldo && !emAndamento && cotacao && (
          <p className="text-xs text-al-atencao">
            Sem créditos suficientes: o saldo disponível é {rotuloCreditos(cotacao.saldoDisponivel)}.
          </p>
        )}

        {erroAcao && !criteriosBusca && (
          <p role="alert" className="text-xs text-al-atencao">
            {erroAcao}
          </p>
        )}

        {avisoDeAceite && (
          <p role="status" className="text-xs text-al-ink">
            {avisoDeAceite}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Abas de estado: Novas / Aceitas / Descartadas */}
          <div className="segmentado" role="tablist">
            {(['nova', 'aceita', 'descartada'] as const).map((aba) => (
              <button
                key={aba}
                type="button"
                role="tab"
                aria-selected={estadoAba === aba}
                onClick={() => setEstadoAba(aba)}
              >
                {aba === 'nova' ? 'Novas' : aba === 'aceita' ? 'Aceitas' : 'Descartadas'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-al-muted">
            Origem
            <select
              value={origemEmUso}
              onChange={(e) => setFiltroOrigem(e.target.value as OrigemDaDescoberta | 'todas')}
              className="rounded-md h-8 border border-al-line bg-al-bg px-2 text-xs text-al-ink outline-none focus:border-al-accent"
            >
              <option value="todas">Todas</option>
              {opcoesDeOrigem.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_DA_ORIGEM[o]}
                </option>
              ))}
            </select>
          </label>

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
                <Fragment key={c.id}>
                <tr className="hover:bg-al-surface/40 transition-colors">
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
                        (c.fitLevel === 'baixo' || c.fitLevel === 'sem_dado') && 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
                      )}
                    >
                      {ROTULO_DO_ENCAIXE[c.fitLevel] ?? ROTULO_DO_ENCAIXE.baixo}
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
                      {c.voltouPorSinalEm && (
                        <span className="text-[0.75rem] font-medium text-al-accent">
                          Voltou por novo Sinal
                          {c.motivoDoDescarteAnterior && (
                            <span className="font-normal text-al-muted"> · Descarte anterior: {c.motivoDoDescarteAnterior}</span>
                          )}
                        </span>
                      )}
                      {c.motivos.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.motivos.map((m, i) => (
                            <span key={i} className="rounded-md inline-block bg-al-surface px-1.5 py-0.5 text-[0.75rem] text-al-ink border border-al-line">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.motivosDeSinal.length > 0 ? (
                        <div className="flex items-baseline gap-1.5 pt-0.5">
                          <span className="truncate text-[0.75rem] text-al-ink">{frasePorExtensoDoSinal(c.motivosDeSinal[0])}</span>
                          {c.motivosDeSinal.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setDetalheAberto(c.id)}
                              aria-label={`Mais ${c.motivosDeSinal.length - 1} ${c.motivosDeSinal.length - 1 === 1 ? 'Sinal' : 'Sinais'} de ${c.nome}`}
                              className="shrink-0 text-[0.75rem] font-medium text-al-accent hover:underline"
                            >
                              +{c.motivosDeSinal.length - 1}
                            </button>
                          )}
                        </div>
                      ) : (
                        c.sinais.length > 0 && (
                          <div className="flex flex-col gap-0.5 pt-0.5">
                            {c.sinais.slice(0, 2).map((s, i) => (
                              <span key={i} className="text-[0.75rem] text-al-muted truncate">
                                • {s.frase}
                              </span>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </td>

                  <td className="p-3 align-top text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={detalheAberto === c.id}
                        aria-label={`${detalheAberto === c.id ? 'Ocultar' : 'Ver'} detalhes de ${c.nome}`}
                        title={detalheAberto === c.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                        onClick={() => setDetalheAberto(detalheAberto === c.id ? null : c.id)}
                        className="h-8 px-2 text-xs text-al-muted hover:text-al-ink"
                      >
                        {detalheAberto === c.id ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                      </Button>
                      {estadoAba === 'nova' && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => aceitar(c)}
                            title="Aceitar candidata e criar Conta-alvo"
                            className="rounded-md h-8 border border-al-sucesso bg-al-sucesso px-2.5 text-xs text-al-on-accent hover:opacity-90"
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
                {detalheAberto === c.id && (
                  <tr className="bg-al-surface/30">
                    <td colSpan={6} className="p-3">
                      <DetalheDaCandidata candidata={c} ajustes={ajustes} explicar={fonte?.explicarAderencia?.bind(fonte)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal para informar o site da empresa quando faltar */}
      {modalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-2xl w-full max-w-md border border-al-line bg-al-surface p-6 shadow-xl">
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
                className="rounded-lg mt-1 w-full border border-al-line bg-al-bg px-3 py-2 text-sm text-al-ink outline-none focus:border-al-accent"
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

      {criteriosBusca && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-label="Confirmar filtros da busca" className="rounded-2xl w-full max-w-lg border border-al-line bg-al-surface p-6 shadow-xl">
            <h3 className="text-base font-semibold text-al-ink">Confirmar filtros da busca</h3>
            <p className="mt-1 text-xs text-al-muted">Do seu ICP{criteriosBusca.resumo ? `: ${criteriosBusca.resumo}` : '.'}</p>
            <div className="mt-4 grid gap-3">
              {criteriosDoDialog && (
                <>
                  <SelecaoMultipla
                    rotulo="Setores"
                    opcoes={opcoesDeSetor}
                    selecionadas={criteriosDoDialog.setores}
                    aoMudar={(setores) => setCriteriosEditados({ ...criteriosDoDialog, setores })}
                  />
                  <EtiquetasDeTexto
                    rotulo="Palavras-chave"
                    valores={criteriosDoDialog.palavrasChave}
                    aoMudar={(palavrasChave) => setCriteriosEditados({ ...criteriosDoDialog, palavrasChave })}
                  />
                  <SelecaoMultipla
                    rotulo="Porte (faixas)"
                    opcoes={opcoesDePorte(criteriosDoDialog.fonte)}
                    selecionadas={criteriosDoDialog.portes}
                    aoMudar={(portes) => setCriteriosEditados({ ...criteriosDoDialog, portes })}
                  />
                  {dadosDoBrasil ? (
                    <SelecaoMultipla
                      rotulo="Região"
                      opcoes={opcoesDeRegiao}
                      selecionadas={criteriosDoDialog.regioes}
                      aoMudar={(regioes) => setCriteriosEditados({ ...criteriosDoDialog, regioes })}
                      dica="Buscar estado ou cidade"
                    />
                  ) : (
                    <Carregando rotulo="Carregando as localidades" />
                  )}
                  {criteriosDoDialog.fonte === 'receita' && dadosDoBrasil && (
                    <SelecaoMultipla
                      rotulo="CNAEs"
                      opcoes={opcoesDeCnae}
                      selecionadas={criteriosDoDialog.cnaes}
                      aoMudar={(cnaes) => setCriteriosEditados({ ...criteriosDoDialog, cnaes })}
                      dica="Buscar por código ou descrição"
                    />
                  )}
                  <EtiquetasDeTexto
                    rotulo="Excluir"
                    valores={criteriosDoDialog.excluir}
                    aoMudar={(excluir) => setCriteriosEditados({ ...criteriosDoDialog, excluir })}
                  />
                </>
              )}
            </div>
            {!criteriosBusca.temIcp || !criteriosValidos ? <p className="mt-3 text-xs text-al-atencao">Informe ao menos um setor ou uma palavra-chave. <Link className="underline" to="/configuracoes/playbook/icp">Edite o ICP em Configurações</Link>.</p> : null}
            <p className="mt-3 text-xs text-al-muted">Custo: {ilimitado ? 'Ilimitado (interno)' : cotacao ? rotuloCreditos(cotacao.creditos) : 'calculando'} · Saldo: {ilimitado ? 'Ilimitado (interno)' : cotacao ? rotuloCreditos(cotacao.saldoDisponivel) : 'calculando'}</p>
            {erroAcao && <p role="alert" className="mt-3 text-xs text-al-atencao">{erroAcao}</p>}
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setCriteriosBusca(null); setErroAcao(null) }}>Cancelar</Button><Button type="button" disabled={!criteriosValidos || pedindoBusca} onClick={confirmarBusca} className="bg-al-accent text-al-on-accent hover:bg-al-accent-2">Confirmar</Button></div>
          </div>
        </div>
      )}

      {fonte?.aprendizado && (
        <OQueADescobertaAprendeu
          ajustes={ajustes}
          podeDesfazer={workspace?.papel === 'administrador' && Boolean(fonte.desfazerAprendizado)}
          aoDesfazer={async (ajuste) => {
            setErroAcao(null)
            try {
              await fonte.desfazerAprendizado?.(ajuste)
              setVersaoDoAprendizado((v) => v + 1)
            } catch (e) {
              setErroAcao(e instanceof Error ? e.message : 'Não foi possível desfazer o aprendizado.')
            }
          }}
        />
      )}

      {/* Modal de confirmação de descarte com motivo */}
      {motivoDescarte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-2xl w-full max-w-md border border-al-line bg-al-surface p-6 shadow-xl">
            <h3 className="text-base font-semibold text-al-ink">Descartar {motivoDescarte.nome}?</h3>
            <p className="mt-1 text-xs text-al-muted">
              A empresa sairá da lista e a Caixa lembrará dela para não voltar em buscas futuras.
            </p>
            <fieldset className="mt-4">
              <legend className="block text-xs font-medium text-al-ink uppercase tracking-rotulo">Por que descartar?</legend>
              <div role="radiogroup" aria-label="Motivo do descarte" className="mt-2 flex flex-wrap gap-2">
                {MOTIVOS_DO_DESCARTE.map((m) => (
                  <button
                    key={m.codigo}
                    type="button"
                    role="radio"
                    aria-checked={codigoDescarte === m.codigo}
                    onClick={() => setCodigoDescarte(m.codigo)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs',
                      codigoDescarte === m.codigo ? 'border-al-accent text-al-ink' : 'border-al-line text-al-muted',
                    )}
                  >
                    {m.rotulo}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-al-muted">O motivo ensina a Descoberta a dar menos peso a empresas parecidas.</p>
            </fieldset>
            <div className="mt-4">
              <label className="block text-xs font-medium text-al-ink uppercase tracking-rotulo">
                Detalhe (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex.: Fora do ICP, porte menor que o mínimo, etc."
                value={textoDescarte}
                onChange={(e) => setTextoDescarte(e.target.value)}
                maxLength={300}
                className="rounded-lg mt-1 w-full border border-al-line bg-al-bg px-3 py-2 text-sm text-al-ink outline-none focus:border-al-accent"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMotivoDescarte(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!codigoDescarte}
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

/** O que a Descoberta aprendeu com os aceites e descartes do Workspace. Desfazer é só do Administrador. */
function OQueADescobertaAprendeu({
  ajustes,
  podeDesfazer,
  aoDesfazer,
}: {
  ajustes: AjusteAprendido[]
  podeDesfazer: boolean
  aoDesfazer: (ajuste?: AjusteAprendido) => Promise<void>
}) {
  const [confirmando, setConfirmando] = useState<AjusteAprendido | 'tudo' | null>(null)
  return (
    <details className="mt-6 rounded-xl border border-al-line p-4">
      <summary className="cursor-pointer text-sm text-al-ink">O que a Descoberta aprendeu</summary>
      <section aria-label="O que a Descoberta aprendeu" className="mt-3 flex flex-col gap-3 text-sm">
        {ajustes.length === 0 ? (
          <p className="text-al-muted">
            Ainda nada. A partir de 3 aceites ou descartes parecidos, a Descoberta passa a dar mais ou menos peso a empresas assim.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ajustes.map((a) => (
              <li key={`${a.dimensao}:${a.valor}`} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {fraseDoAjuste(a)}.{' '}
                  <span className="text-al-muted">
                    {a.decisoes} decisões, a última em {formatarDataCompleta(a.atualizadoEm)}.
                  </span>
                </span>
                {podeDesfazer && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(a)}>
                    Desfazer este ajuste
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeDesfazer && ajustes.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setConfirmando('tudo')}>
            <RotateCcw className="size-4" aria-hidden />
            Recomeçar o aprendizado
          </Button>
        )}
        {confirmando && (
          <div role="alertdialog" aria-label="Confirmar" className="flex flex-wrap items-center gap-3 rounded-lg border border-al-atencao/50 p-3">
            <span>
              {confirmando === 'tudo'
                ? 'Recomeçar apaga tudo o que a Descoberta aprendeu neste Workspace. Continuar?'
                : `Desfazer "${fraseDoAjuste(confirmando)}"?`}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const alvo = confirmando
                setConfirmando(null)
                await aoDesfazer(alvo === 'tudo' ? undefined : alvo)
              }}
            >
              Confirmar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
          </div>
        )}
      </section>
    </details>
  )
}

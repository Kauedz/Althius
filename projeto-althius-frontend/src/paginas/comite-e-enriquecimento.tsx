import { useId, useState } from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  Phone,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ContaAlvo, Contato, ContatoProposto, ResultadoDoComite } from '@/fonte/contas-tipos'
import { useFonteDeContas } from '@/fonte/contexto'
import { cn } from '@/lib/utils'

export function SecaoReceitaFederal({
  conta,
  aoAtualizar,
}: {
  conta: ContaAlvo
  aoAtualizar: () => void
}) {
  const fonte = useFonteDeContas()
  const [expandido, setExpandido] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modalCnpj, setModalCnpj] = useState(false)
  const [cnpjInput, setCnpjInput] = useState(conta.legalIdentifier ?? '')

  const receita = conta.receitaData
  const custoId = useId()

  async function handleBuscar(cnpjAlvo?: string) {
    const doc = cnpjAlvo ?? conta.legalIdentifier ?? cnpjInput
    if (!doc) {
      setModalCnpj(true)
      return
    }
    if (!fonte.enriquecerReceita) return
    setBuscando(true)
    setErro(null)
    try {
      await fonte.enriquecerReceita(conta.id, doc)
      setModalCnpj(false)
      aoAtualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar dados na Receita Federal.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-al-line bg-al-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded bg-al-ink/5 text-al-ink">
            <Building2 className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-al-ink">Dados da Receita Federal (CNPJ)</h3>
            <p className="text-xs text-al-muted">
              {receita ? (
                <>Razão Social: <span className="font-medium text-al-ink">{receita.razaoSocial}</span> (Receita Federal)</>
              ) : (
                'Dados cadastrais oficiais, quadro societário (QSA) e CNAE'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {receita && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpandido(!expandido)}
              className="h-8 gap-1.5 border-al-line text-xs"
            >
              {expandido ? 'Ocultar detalhes' : 'Ver detalhes'}
              {expandido ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          )}

          {fonte.enriquecerReceita && (
            <>
              <span id={custoId} className="text-xs text-al-muted">1 crédito</span>
              <Button
                type="button"
                size="sm"
                disabled={buscando}
                onClick={() => handleBuscar()}
                aria-describedby={custoId}
                className="rounded-md h-8 gap-1.5 border border-al-accent bg-al-accent text-xs font-medium text-al-on-accent hover:bg-al-accent-2"
              >
                <Sparkles className="size-3.5" />
                {buscando ? 'Consultando...' : receita ? 'Atualizar Receita' : 'Consultar Receita'}
              </Button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <div role="alert" className="rounded bg-al-erro/10 p-3 text-xs text-al-erro">
          {erro}
        </div>
      )}

      {receita && expandido && (
        <div className="flex flex-col gap-4 border-t border-al-line pt-4 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <span className="rotulo block text-al-muted">CNPJ</span>
              <span className="font-medium text-al-ink">{receita.cnpjFormatado}</span>
            </div>
            <div>
              <span className="rotulo block text-al-muted">Situação Cadastral</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-al-sucesso-suave text-al-sucesso font-medium">
                {receita.situacaoCadastral}
              </span>
            </div>
            <div>
              <span className="rotulo block text-al-muted">Porte</span>
              <span className="text-al-ink">{receita.porte ?? '—'}</span>
            </div>
            <div>
              <span className="rotulo block text-al-muted">Capital Social</span>
              <span className="font-medium text-al-ink">
                {receita.capitalSocial
                  ? receita.capitalSocial.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '—'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="rotulo block text-al-muted">CNAE Principal</span>
              <span className="text-al-ink">
                {receita.cnaePrincipal?.codigo} — {receita.cnaePrincipal?.descricao}
              </span>
            </div>
            {receita.endereco && (
              <div>
                <span className="rotulo block text-al-muted">Endereço</span>
                <span className="text-al-ink">
                  {[
                    receita.endereco.logradouro,
                    receita.endereco.numero,
                    receita.endereco.bairro,
                    receita.endereco.municipio && `${receita.endereco.municipio} - ${receita.endereco.uf}`,
                    receita.endereco.cep && `CEP ${receita.endereco.cep}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
          </div>

          {receita.socios && receita.socios.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="rotulo block text-al-muted">Quadro de Sócios e Administradores (QSA)</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {receita.socios.map((s, i) => (
                  <div key={i} className="rounded border border-al-line bg-al-bg p-2.5">
                    <span className="block font-medium text-al-ink">{s.nome}</span>
                    <span className="block text-al-muted">{s.cargo ?? s.qualificacao ?? 'Sócio'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal para digitar CNPJ caso a conta não tenha */}
      <Dialog open={modalCnpj} onOpenChange={setModalCnpj}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Informar CNPJ da empresa</DialogTitle>
            <DialogDescription>
              Digite o CNPJ da empresa para consultar os dados cadastrais oficiais da Receita Federal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-3">
            <label htmlFor="cnpj-input" className="rotulo">
              CNPJ (14 dígitos)
            </label>
            <input
              id="cnpj-input"
              type="text"
              placeholder="00.000.000/0001-00"
              value={cnpjInput}
              onChange={(e) => setCnpjInput(e.target.value)}
              className="h-9 w-full rounded border border-al-line bg-al-bg px-3 text-sm text-al-ink outline-none focus:border-al-accent"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalCnpj(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={buscando || !cnpjInput.trim()}
              onClick={() => handleBuscar(cnpjInput)}
              className="rounded-lg border border-al-accent bg-al-accent font-medium text-al-on-accent hover:bg-al-accent-2"
            >
              {buscando ? 'Consultando...' : 'Buscar na Receita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** "N novas · M já encontradas (sem custo)": só as novas custaram crédito. */
function resumoDoComite({ novas, jaEncontradas }: ResultadoDoComite) {
  const textoDasNovas = `${novas} ${novas === 1 ? 'nova' : 'novas'}`
  const textoDasJaEncontradas = `${jaEncontradas} já ${jaEncontradas === 1 ? 'encontrada' : 'encontradas'} (sem custo)`
  return `${textoDasNovas} · ${textoDasJaEncontradas}`
}

export function SecaoComiteDeCompra({
  contaId,
  propostas,
  carregando,
  aoAtualizar,
}: {
  contaId: string
  propostas: ContatoProposto[]
  carregando: boolean
  aoAtualizar: () => void
}) {
  const fonte = useFonteDeContas()
  const [buscando, setBuscando] = useState(false)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<ResultadoDoComite | null>(null)

  async function handleBuscarComite() {
    if (!fonte.buscarComite) return
    setBuscando(true)
    setErro(null)
    setResumo(null)
    try {
      setResumo(await fonte.buscarComite(contaId))
      aoAtualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar comitê de compra.')
    } finally {
      setBuscando(false)
    }
  }

  async function handleAceitar(id: string) {
    if (!fonte.aceitarContatoProposto) return
    setAcaoId(id)
    setErro(null)
    try {
      await fonte.aceitarContatoProposto(id)
      aoAtualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível aceitar o contato.')
    } finally {
      setAcaoId(null)
    }
  }

  async function handleDescartar(id: string) {
    if (!fonte.descartarContatoProposto) return
    setAcaoId(id)
    setErro(null)
    try {
      await fonte.descartarContatoProposto(id)
      aoAtualizar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível descartar a proposta.')
    } finally {
      setAcaoId(null)
    }
  }

  const novas = propostas.filter((p) => p.state === 'nova')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-al-line pb-3">
        <div className="flex items-center gap-2.5">
          <Users className="size-4 text-al-muted" />
          <span className="text-sm font-medium text-al-ink">
            Pessoas sugeridas para abordagem ({novas.length})
          </span>
        </div>

        {fonte.buscarComite && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-al-muted">
              Custo: 1 crédito por pessoa nova. Pessoas já encontradas não são cobradas.
            </span>
            <Button
              type="button"
              size="sm"
              disabled={buscando}
              onClick={handleBuscarComite}
              className="rounded-md h-8 gap-1.5 border border-al-accent bg-al-accent text-xs font-medium text-al-on-accent hover:bg-al-accent-2"
            >
              <Search className="size-3.5" />
              {buscando ? 'Buscando...' : 'Enriquecer Comitê'}
            </Button>
          </div>
        )}
      </div>

      {erro && (
        <div role="alert" className="rounded bg-al-erro/10 p-3 text-xs text-al-erro">
          {erro}
        </div>
      )}

      {resumo && (
        <div role="status" className="rounded bg-al-ink/5 p-3 text-xs text-al-ink">
          {resumoDoComite(resumo)}
        </div>
      )}

      {carregando ? (
        <div className="py-6 text-center text-xs text-al-muted">Carregando comitê...</div>
      ) : novas.length === 0 ? (
        <div className="rounded border border-dashed border-al-line p-6 text-center text-xs text-al-muted">
          Nenhuma pessoa proposta para o comitê de compra no momento. Clique em "Enriquecer Comitê" para coletar os perfis de Decisores, Influenciadores e Campeões.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {novas.map((p) => {
            const ehDecisor = p.persona === 'Decisor'
            const ehInfluenciador = p.persona === 'Influenciador'
            return (
              <div
                key={p.id}
                className="flex flex-col justify-between gap-3 rounded-lg border border-al-line bg-al-surface p-4 text-xs transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-[0.6875rem] font-medium uppercase tracking-wider',
                        ehDecisor
                          ? 'bg-al-atencao-suave text-al-atencao'
                          : ehInfluenciador
                            ? 'bg-al-hover text-al-ink'
                            : 'bg-al-sucesso-suave text-al-sucesso',
                      )}
                    >
                      {p.persona ?? 'Outro'}
                    </span>

                    {p.linkedinUrl && (
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Ver no LinkedIn"
                        className="text-al-muted hover:text-al-ink"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium text-al-ink">{p.name}</h4>
                    <p className="line-clamp-2 text-al-muted">{p.role ?? p.headline ?? 'Cargo não especificado'}</p>
                  </div>

                  {p.location && (
                    <span className="text-[0.6875rem] text-al-muted">📍 {p.location}</span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-al-line pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={acaoId === p.id}
                    onClick={() => handleDescartar(p.id)}
                    className="h-7 border-al-line px-2 text-[0.6875rem] text-al-muted hover:text-al-erro"
                  >
                    <Trash2 className="size-3" />
                    Descartar
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={acaoId === p.id}
                    onClick={() => handleAceitar(p.id)}
                    className="rounded-md h-7 gap-1 border border-al-accent bg-al-accent px-2.5 text-[0.6875rem] font-medium text-al-on-accent hover:bg-al-accent-2"
                  >
                    <Check className="size-3" />
                    Aceitar Contato
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * A frase do resultado de revelar um e-mail: já tinha (sem custo), achou um novo, ou não achou nada novo. Usada
 * tanto na ação por linha (`BotoesRevelarContato`) quanto na ação em lote.
 */
export function mensagemDaRevelacaoDeEmail(res: {
  sucesso: boolean
  valor: string | null
  creditosDebitados: number
  jaExistia?: boolean
}): string {
  if (res.jaExistia && res.valor) return `Já encontrado, sem custo: ${res.valor}`
  if (res.sucesso && res.valor) return `Encontrado: ${res.valor} (${res.creditosDebitados} créditos debitados)`
  return 'Nenhum e-mail novo encontrado. Nenhum crédito foi debitado.'
}

export function BotoesRevelarContato({
  contato,
  aoRevelar,
}: {
  contato: Contato
  aoRevelar: () => void
}) {
  const fonte = useFonteDeContas()
  const [aberto, setAberto] = useState(false)
  const [cotacao, setCotacao] = useState<
    { creditos: number; saldo: number; podeRevelar: boolean; jaEncontrado?: boolean } | null
  >(null)
  const [revelando, setRevelando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const precisaEmail = !contato.email && !contato.canais.email
  const precisaTelefone = !contato.whatsapp && !contato.canais.telefone

  if (!fonte.revelarContato || (!precisaEmail && !precisaTelefone)) {
    return null
  }

  async function abrirModal() {
    setAberto(true)
    setCotacao(null)
    setResultado(null)
    setErro(null)
    if (fonte.cotarRevelacaoContato) {
      try {
        const c = await fonte.cotarRevelacaoContato(contato.id, 'email')
        setCotacao(c)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível consultar a cotação.')
      }
    } else {
      setErro('A cotação da revelação está indisponível.')
    }
  }

  async function confirmarRevelacao() {
    if (!fonte.revelarContato || !cotacao?.podeRevelar || revelando) return
    setRevelando(true)
    setErro(null)
    try {
      const res = await fonte.revelarContato(contato.id, 'email')
      setResultado(mensagemDaRevelacaoDeEmail(res))
      // Só a busca que terminou chega aqui: a falha é exceção e aparece como erro.
      if ((res.jaExistia || res.sucesso) && res.valor) aoRevelar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A busca do e-mail falhou.')
    } finally {
      setRevelando(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {precisaEmail && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={abrirModal}
            title="Consultar o custo de revelar e-mail"
            className="h-7 gap-1 border-al-line px-2 text-[0.6875rem] hover:border-al-accent hover:text-al-accent"
          >
            <Mail className="size-3" />
            Revelar E-mail
          </Button>
        )}

        {/* Telefone está fora (prospeccao-funcional B3): sem cotação, sem revelação, sem crédito. */}
        {precisaTelefone && (
          <span
            title="A revelação de telefone está indisponível."
            className="inline-flex h-7 items-center gap-1 px-2 text-[0.6875rem] text-al-muted"
          >
            <Phone className="size-3" />
            Telefone indisponível
          </span>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Revelar E-mail de {contato.nome}
            </DialogTitle>
            <DialogDescription>
              A Althius busca o e-mail profissional a partir do perfil público do LinkedIn.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-3 text-xs">
            <div className="rounded border border-al-line bg-al-surface p-3">
              <span className="rotulo block text-al-muted">Custo da ação</span>
              {cotacao?.jaEncontrado ? (
                <>
                  <span className="text-sm font-semibold text-al-ink">Já encontrado, sem custo</span>
                  <span className="block mt-1 text-[0.6875rem] text-al-muted">
                    Este Contato já tem e-mail. Nenhuma busca nova é feita e nenhum crédito é debitado.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-al-ink">
                    {cotacao ? `${cotacao.creditos} créditos` : erro ? 'Cotação indisponível' : 'Consultando cotação...'}
                  </span>
                  <span className="block mt-1 text-[0.6875rem] text-al-muted">
                    Importante: os créditos só são debitados do saldo se um e-mail novo for encontrado e gravado no Contato.
                  </span>
                </>
              )}
            </div>

            {resultado && (
              <div role="status" className="rounded bg-al-sucesso-suave p-3 text-al-sucesso font-medium">
                {resultado}
              </div>
            )}

            {cotacao && !cotacao.podeRevelar && (
              <div role="alert" className="rounded bg-al-erro/10 p-3 text-al-erro">
                {cotacao.saldo < cotacao.creditos
                  ? `Saldo insuficiente: ${cotacao.saldo} créditos disponíveis; são necessários ${cotacao.creditos}.`
                  : 'A revelação não está disponível para este Contato.'}
              </div>
            )}

            {erro && (
              <div role="alert" className="rounded bg-al-erro/10 p-3 text-al-erro">
                {erro}
                {!cotacao && <Button type="button" variant="outline" onClick={abrirModal}>Tentar de novo</Button>}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            {!resultado && (
              <Button
                type="button"
                disabled={revelando || !cotacao?.podeRevelar}
                onClick={confirmarRevelacao}
                className="rounded-lg border border-al-accent bg-al-accent font-medium text-al-on-accent hover:bg-al-accent-2"
              >
                {revelando ? 'Buscando...' : 'Confirmar e Revelar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

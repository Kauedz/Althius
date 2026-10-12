import { FileText, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useFonte, useFonteDeContas } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import {
  CAMPOS_DO_CSV,
  type ContaDistribuivel,
  type DecisaoDoContato,
  type EstadoDoLote,
  type FiltroDasLinhas,
  type FonteDeImportacaoDeContas,
  type LinhaDaImportacao,
  type LoteDeImportacao,
  type Mapeamento,
  type ResumoDeLote,
} from '@/fonte/importacao-tipos'
import { baixarTexto, montarCsvDoRelatorio, ROTULO_DA_SITUACAO } from '@/fonte/relatorio-da-importacao'
import type { Participante } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import { CABECALHO, CELULA } from './modulo-contas-e-contatos'

const CAMPO = 'rounded-md h-9 border border-al-line bg-al-surface px-3 text-sm text-al-ink'
const TAMANHO_DA_PAGINA = 50

const ROTULO_DO_ESTADO: Record<EstadoDoLote, string> = {
  enviando: 'Enviando',
  mapeando: 'Aguardando o mapeamento',
  previa: 'Em prévia',
  processando: 'Processando',
  concluido: 'Concluída',
  falhou: 'Falhou',
  cancelado: 'Descartada',
}

const ROTULO_DA_DECISAO: Record<DecisaoDoContato, string> = {
  atualizar: 'Atualizar os dados do Contato',
  vincular: 'Adicionar Vínculo com esta Conta',
  transferir: 'Transferir o Vínculo para esta Conta',
  ignorar: 'Ignorar o Contato desta linha',
}

const DECISOES = Object.keys(ROTULO_DA_DECISAO) as DecisaoDoContato[]

export function PaginaImportarContas() {
  const { loteId } = useParams<{ loteId?: string }>()
  const importacao = useFonteDeContas().importacao
  return (
    <Pagina titulo="Importar CSV" icone={Upload} voltar={{ para: '/contas', rotulo: 'Contas' }}>
      {!importacao ? (
        <p className="text-sm text-al-muted">A importação por CSV só existe no Workspace operacional.</p>
      ) : loteId ? (
        <AcompanharImportacao key={loteId} id={loteId} importacao={importacao} />
      ) : (
        <EnviarArquivo importacao={importacao} />
      )}
    </Pagina>
  )
}

/** O tamanho do arquivo escolhido, na unidade que se lê: bytes, KB ou MB (o limite do envio é 5 MB). */
function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const numero = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return bytes < 1024 * 1024 ? `${numero(bytes / 1024)} KB` : `${numero(bytes / (1024 * 1024))} MB`
}

function EnviarArquivo({ importacao }: { importacao: FonteDeImportacaoDeContas }) {
  const navegar = useNavigate()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recentes, setRecentes] = useState<ResumoDeLote[] | null>(null)
  const [erroDasRecentes, setErroDasRecentes] = useState(false)

  useEffect(() => {
    let ativo = true
    importacao.lotes().then(
      (lotes) => ativo && setRecentes(lotes),
      () => ativo && setErroDasRecentes(true),
    )
    return () => {
      ativo = false
    }
  }, [importacao])

  async function enviar() {
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    try {
      const lote = await importacao.enviarArquivo(arquivo)
      navegar(`/contas/importar/${lote.id}`)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
      setEnviando(false)
    }
  }

  return (
    <>
      <p className="max-w-3xl text-sm text-al-muted">
        Envie um arquivo CSV com até 5 MB e 5.000 linhas. Cada linha precisa da URL e do nome da empresa; o Contato é
        opcional, e o nome dele é obrigatório quando a linha traz dados de Contato. Nada é gravado antes de você
        conferir a prévia e confirmar.
      </p>
      <form
        aria-label="Enviar arquivo CSV"
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
        className="rounded-xl flex flex-col items-start gap-3 border border-al-line bg-al-surface/40 p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* O controle nativo fica escondido só para os olhos: o rótulo é o botão, e o foco do teclado aparece nele. */}
          <label
            className={cn(
              BOTAO_SECUNDARIO,
              'relative cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-al-accent',
            )}
          >
            <Upload className="size-3.5" aria-hidden />
            Escolher arquivo
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              aria-label="Arquivo CSV"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          {arquivo && (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-al-ink">
              <FileText className="size-4 shrink-0 text-al-muted" aria-hidden />
              <span className="truncate" title={arquivo.name}>
                {arquivo.name}
              </span>
              <span className="shrink-0 text-al-muted">· {formatarTamanho(arquivo.size)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!arquivo || enviando}
            aria-describedby={arquivo ? undefined : 'dica-do-envio'}
            className={BOTAO_PRIMARIO}
          >
            {enviando ? 'Enviando…' : 'Enviar arquivo'}
          </button>
          {!arquivo && (
            <p id="dica-do-envio" className="text-xs text-al-muted">
              Escolha um arquivo CSV para liberar o envio.
            </p>
          )}
        </div>
        <Mensagem tipo="erro">{erro}</Mensagem>
      </form>

      <section aria-labelledby="importacoes-recentes" className="flex flex-col gap-2">
        <h2 id="importacoes-recentes" className="rotulo">
          Importações recentes
        </h2>
        {erroDasRecentes && <Mensagem tipo="erro">Não foi possível carregar as importações recentes.</Mensagem>}
        {recentes?.length === 0 && <p className="text-sm text-al-muted">Nenhuma importação ainda.</p>}
        <ul className="flex flex-col">
          {recentes?.map((lote) => (
            <li key={lote.id} className="flex items-center gap-3 border-b border-al-line py-2 text-sm">
              <Link to={`/contas/importar/${lote.id}`} className="text-al-ink hover:text-al-accent hover:underline">
                {lote.arquivo}
              </Link>
              <span className="text-al-muted">
                {ROTULO_DO_ESTADO[lote.estado]} · {lote.totalDeLinhas} linhas · {formatarDataCompleta(lote.criadoEm)}
                {!lote.ehMeu && ' · de outra pessoa'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function AcompanharImportacao({ id, importacao }: { id: string; importacao: FonteDeImportacaoDeContas }) {
  const [lote, setLote] = useState<LoteDeImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let ativo = true
    importacao.lote(id).then(
      (carregado) => ativo && setLote(carregado),
      (falha) => ativo && setErro(mensagemDeErro(falha)),
    )
    return () => {
      ativo = false
    }
  }, [id, importacao, tentativa])

  if (erro) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-al-muted">{erro}</p>
        <button
          type="button"
          className={BOTAO_SECUNDARIO}
          onClick={() => {
            setErro(null)
            setTentativa((n) => n + 1)
          }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!lote) return <Carregando rotulo="Carregando a importação" />

  return (
    <>
      <p className="text-sm text-al-muted">
        {lote.arquivo} · {ROTULO_DO_ESTADO[lote.estado]} · enviado em {formatarDataCompleta(lote.criadoEm)}
      </p>
      {lote.estado === 'falhou' && (
        <>
          <Mensagem tipo="erro">{lote.motivoDaFalha ?? 'Não foi possível ler o arquivo.'}</Mensagem>
          <Link to="/contas/importar" className={cn(BOTAO_SECUNDARIO, 'self-start')}>
            Enviar outro arquivo
          </Link>
        </>
      )}
      {lote.estado === 'cancelado' && (
        <>
          <p className="text-sm text-al-muted">Esta importação foi descartada e nada foi gravado no Workspace.</p>
          <Link to="/contas/importar" className={cn(BOTAO_SECUNDARIO, 'self-start')}>
            Enviar outro arquivo
          </Link>
        </>
      )}
      {(lote.estado === 'mapeando' || lote.estado === 'previa') &&
        (lote.ehMeu ? (
          <Previa lote={lote} importacao={importacao} aoAtualizar={setLote} />
        ) : (
          <p className="text-sm text-al-muted">Esta importação é de outra pessoa e ainda não foi confirmada.</p>
        ))}
      {lote.estado === 'processando' && <Processamento lote={lote} importacao={importacao} aoAtualizar={setLote} />}
      {lote.estado === 'concluido' && <Relatorio lote={lote} importacao={importacao} />}
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h2 className="rotulo">{titulo}</h2>
      {children}
    </section>
  )
}

function Previa({
  lote,
  importacao,
  aoAtualizar,
}: {
  lote: LoteDeImportacao
  importacao: FonteDeImportacaoDeContas
  aoAtualizar: (lote: LoteDeImportacao) => void
}) {
  const navegar = useNavigate()
  const [mapeamento, setMapeamento] = useState<Mapeamento>(lote.mapeamento)
  const [cabecalho, setCabecalho] = useState(lote.primeiraLinhaEhCabecalho)
  const [substituir, setSubstituir] = useState(lote.substituirCorrigidosAMao)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [decisaoEmMassa, setDecisaoEmMassa] = useState<DecisaoDoContato>('atualizar')

  async function executar(acao: () => Promise<void>) {
    setOcupado(true)
    setErro(null)
    try {
      await acao()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  const visualizar = () =>
    executar(async () => {
      aoAtualizar(
        await importacao.visualizar(lote.id, {
          mapeamento,
          primeiraLinhaEhCabecalho: cabecalho,
          substituirCorrigidosAMao: substituir,
        }),
      )
    })

  const emPrevia = lote.estado === 'previa'
  const { previa, contagens } = lote
  const obrigatoriosMapeados = CAMPOS_DO_CSV.filter((c) => c.obrigatorio).every((c) => mapeamento[c.campo] !== undefined)

  return (
    <>
      <Bloco titulo="Colunas do arquivo">
        <form
          aria-label="Mapear colunas"
          onSubmit={(e) => {
            e.preventDefault()
            void visualizar()
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS_DO_CSV.map(({ campo, rotulo, grupo, obrigatorio }) => (
              <label key={campo} className="flex flex-col gap-1 text-xs text-al-muted">
                {rotulo}
                {obrigatorio ? ' (obrigatório)' : ` (${grupo}, opcional)`}
                <select
                  value={mapeamento[campo] ?? ''}
                  onChange={(e) => {
                    const proximo = { ...mapeamento }
                    if (e.target.value === '') delete proximo[campo]
                    else proximo[campo] = Number(e.target.value)
                    setMapeamento(proximo)
                  }}
                  className={CAMPO}
                >
                  <option value="">Não importar</option>
                  {lote.colunas.map((coluna, indice) => (
                    <option key={indice} value={indice}>
                      {coluna}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-al-ink">
            <input type="checkbox" checked={cabecalho} onChange={(e) => setCabecalho(e.target.checked)} />A primeira linha
            é o cabeçalho
          </label>
          <label className="flex items-center gap-2 text-sm text-al-ink">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
            Substituir dados corrigidos manualmente pelos do arquivo
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={ocupado || !obrigatoriosMapeados} className={BOTAO_PRIMARIO}>
              {emPrevia ? 'Atualizar prévia' : 'Ver prévia'}
            </button>
            <button
              type="button"
              disabled={ocupado}
              className={BOTAO_SECUNDARIO}
              onClick={() =>
                void executar(async () => {
                  await importacao.cancelar(lote.id)
                  navegar('/contas/importar')
                })
              }
            >
              Descartar importação
            </button>
          </div>
          {!obrigatoriosMapeados && (
            <p className="text-xs text-al-muted">Indique as colunas do nome e da URL da empresa para ver a prévia.</p>
          )}
        </form>
        <Mensagem tipo="erro">{erro}</Mensagem>
      </Bloco>

      {emPrevia && (
        <>
          <Bloco titulo="Prévia">
            <ul className="flex flex-col gap-1 text-sm text-al-ink">
              <li>{contagens.total} linhas de dados no arquivo</li>
              <li>
                {previa.contasNovas} {previa.contasNovas === 1 ? 'Conta nova' : 'Contas novas'}, {previa.contasAtualizadas}{' '}
                {previa.contasAtualizadas === 1 ? 'Conta atualizada' : 'Contas atualizadas'} e {previa.contasIgnoradas}{' '}
                {previa.contasIgnoradas === 1 ? 'ignorada' : 'ignoradas'} (de outro Vendedor responsável)
              </li>
              <li>
                {previa.contatosNovos} {previa.contatosNovos === 1 ? 'Contato novo' : 'Contatos novos'} e{' '}
                {previa.contatosExistentes} {previa.contatosExistentes === 1 ? 'Contato que já existe' : 'Contatos que já existem'}
              </li>
              <li>{previa.conflitos} com valores escritos à mão que o arquivo não vai trocar</li>
              <li>
                {contagens.invalidas} {contagens.invalidas === 1 ? 'linha inválida' : 'linhas inválidas'}: não serão importadas e aparecem
                como falhas no relatório
              </li>
              <li>
                {previa.decisoesPendentes}{' '}
                {previa.decisoesPendentes === 1 ? 'Contato espera' : 'Contatos esperam'} a sua decisão
              </li>
            </ul>
            {previa.decisoesPendentes > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2 text-al-muted">
                  Decisão para todos os que esperam
                  <select
                    value={decisaoEmMassa}
                    onChange={(e) => setDecisaoEmMassa(e.target.value as DecisaoDoContato)}
                    className={CAMPO}
                  >
                    {DECISOES.map((decisao) => (
                      <option key={decisao} value={decisao}>
                        {ROTULO_DA_DECISAO[decisao]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={ocupado}
                  className={BOTAO_SECUNDARIO}
                  onClick={() =>
                    void executar(async () => {
                      await importacao.decidir(lote.id, decisaoEmMassa)
                      aoAtualizar(await importacao.lote(lote.id))
                    })
                  }
                >
                  Aplicar a todos
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={ocupado || previa.decisoesPendentes > 0 || contagens.pendentes === 0}
                className={BOTAO_PRIMARIO}
                onClick={() =>
                  void executar(async () => {
                    aoAtualizar(await importacao.confirmar(lote.id))
                  })
                }
              >
                Confirmar importação
              </button>
              {previa.decisoesPendentes > 0 && (
                <span className="text-xs text-al-muted">Decida o que fazer com cada Contato que já existe.</span>
              )}
            </div>
          </Bloco>
          <TabelaDeLinhas
            lote={lote}
            importacao={importacao}
            filtros={['todas', 'decisoes', 'conflitos', 'invalidas']}
            comDecisao
            aoDecidir={async () => aoAtualizar(await importacao.lote(lote.id))}
          />
        </>
      )}
    </>
  )
}

const ROTULO_DO_FILTRO: Record<FiltroDasLinhas, string> = {
  todas: 'Todas as linhas',
  invalidas: 'Inválidas',
  decisoes: 'Esperam decisão',
  conflitos: 'Com valores preservados',
  problemas: 'Com problemas',
}

function TabelaDeLinhas({
  lote,
  importacao,
  filtros,
  comDecisao = false,
  aoDecidir,
}: {
  lote: LoteDeImportacao
  importacao: FonteDeImportacaoDeContas
  filtros: FiltroDasLinhas[]
  comDecisao?: boolean
  aoDecidir?: () => Promise<void>
}) {
  const [filtro, setFiltro] = useState<FiltroDasLinhas>(filtros[0])
  const [linhas, setLinhas] = useState<LinhaDaImportacao[] | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const carregadas = useRef(0)

  // Recarrega desde o começo quando o filtro, a prévia ou uma decisão mudam.
  useEffect(() => {
    let ativo = true
    importacao.linhas(lote.id, filtro, 0, TAMANHO_DA_PAGINA).then(
      (pagina) => {
        if (!ativo) return
        carregadas.current = pagina.length
        setLinhas(pagina)
        setTemMais(pagina.length === TAMANHO_DA_PAGINA)
        setErro(null)
      },
      (falha) => ativo && setErro(mensagemDeErro(falha)),
    )
    return () => {
      ativo = false
    }
  }, [importacao, lote.id, lote.contagens, lote.previa, lote.mapeamento, filtro, versao])

  async function maisLinhas() {
    try {
      const pagina = await importacao.linhas(lote.id, filtro, carregadas.current, TAMANHO_DA_PAGINA)
      carregadas.current += pagina.length
      setLinhas((atuais) => [...(atuais ?? []), ...pagina])
      setTemMais(pagina.length === TAMANHO_DA_PAGINA)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  async function decidir(linha: LinhaDaImportacao, decisao: DecisaoDoContato) {
    try {
      await importacao.decidir(lote.id, decisao, [linha.numero])
      await aoDecidir?.()
      setVersao((n) => n + 1)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <Bloco titulo="Linhas">
      <div role="group" aria-label="Filtrar linhas" className="flex flex-wrap gap-2">
        {filtros.map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-pressed={filtro === opcao}
            onClick={() => setFiltro(opcao)}
            className={cn(BOTAO_SECUNDARIO, filtro === opcao && 'border-al-accent')}
          >
            {ROTULO_DO_FILTRO[opcao]}
          </button>
        ))}
      </div>
      <Mensagem tipo="erro">{erro}</Mensagem>
      {!linhas && !erro && <Carregando rotulo="Carregando as linhas" />}
      {linhas?.length === 0 && <p className="text-sm text-al-muted">Nenhuma linha neste filtro.</p>}
      {linhas && linhas.length > 0 && (
        <div className="overflow-auto">
          <table aria-label="Linhas da importação" className="w-full min-w-[56rem] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className={cn(CABECALHO, 'w-16')}>Linha</th>
                <th scope="col" className={cn(CABECALHO, 'w-40')}>Empresa</th>
                <th scope="col" className={cn(CABECALHO, 'w-36')}>Contato</th>
                <th scope="col" className={CABECALHO}>O que acontece</th>
                {comDecisao && <th scope="col" className={cn(CABECALHO, 'w-64')}>Decisão</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.numero} className="align-top">
                  <td className={cn(CELULA, 'py-2')}>{linha.numero}</td>
                  <td className={cn(CELULA, 'py-2')}>{linha.empresa ?? linha.celulas[0] ?? '—'}</td>
                  <td className={cn(CELULA, 'py-2')}>{linha.contato ?? '—'}</td>
                  <td className={cn(CELULA, 'py-2')}>
                    <DescricaoDaLinha linha={linha} />
                  </td>
                  {comDecisao && (
                    <td className={cn(CELULA, 'py-2')}>
                      {linha.previa?.precisaDecidir && (
                        <select
                          aria-label={`Decisão da linha ${linha.numero}`}
                          value={linha.decisao ?? ''}
                          onChange={(e) => void decidir(linha, e.target.value as DecisaoDoContato)}
                          className={cn(CAMPO, 'w-full')}
                        >
                          <option value="" disabled>
                            Escolha…
                          </option>
                          {DECISOES.map((decisao) => (
                            <option key={decisao} value={decisao} disabled={decisao === 'transferir' && !linha.previa?.podeTransferir}>
                              {ROTULO_DA_DECISAO[decisao]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {temMais && (
        <button type="button" className={cn(BOTAO_SECUNDARIO, 'self-start')} onClick={() => void maisLinhas()}>
          Mostrar mais linhas
        </button>
      )}
    </Bloco>
  )
}

/** O que a linha faz (na prévia) ou fez (no relatório), com os motivos. */
function DescricaoDaLinha({ linha }: { linha: LinhaDaImportacao }) {
  const { previa } = linha
  const conta = previa
    ? previa.conta === 'criar'
      ? 'Cria a Conta.'
      : previa.conta === 'atualizar'
        ? `Atualiza a Conta${previa.contaExistente ? ` ${previa.contaExistente}` : ''}${
            previa.camposDaConta.length > 0 ? ` (${previa.camposDaConta.join(', ')})` : ' (sem mudanças)'
          }.`
        : `Ignora a Conta ${previa.contaExistente ?? ''}: é de outro Vendedor responsável.`
    : null
  const contato = previa?.contato
    ? previa.contato === 'novo'
      ? 'Cria o Contato.'
      : previa.contato === 'existente'
        ? `Contato que já existe: ${previa.contatoExistente ?? ''}${
            previa.outrosVinculos.length > 0 ? `, vinculado a ${previa.outrosVinculos.join(', ')}` : ''
          }.`
        : 'Mesmo Contato de uma linha anterior do arquivo.'
    : null
  const conflitos = [...(previa?.conflitosDaConta ?? []), ...(previa?.conflitosDoContato ?? [])]
  return (
    <div className="flex flex-col gap-0.5">
      {linha.situacao !== 'pendente' && <span className="font-normal">{ROTULO_DA_SITUACAO[linha.situacao]}</span>}
      {conta && <span>{conta}</span>}
      {contato && <span>{contato}</span>}
      {conflitos.length > 0 && (
        <span className="text-al-muted">Preserva os valores escritos à mão: {conflitos.join(', ')}.</span>
      )}
      {linha.motivos.map((motivo) => (
        <span key={motivo} className="text-al-muted">{motivo}</span>
      ))}
      {linha.observacoes.map((observacao) => (
        <span key={observacao} className="text-al-muted">{observacao}</span>
      ))}
    </div>
  )
}

function Contagens({ lote }: { lote: LoteDeImportacao }) {
  const { contagens } = lote
  const itens: [string, number][] = [
    ['Criadas', contagens.criadas],
    ['Atualizadas', contagens.atualizadas],
    ['Vinculadas', contagens.vinculadas],
    ['Ignoradas', contagens.ignoradas],
    ['Com falha', contagens.comFalha],
  ]
  return (
    <dl className="flex flex-wrap gap-6">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="flex flex-col">
          <dt className="rotulo text-[0.6875rem]">{rotulo}</dt>
          <dd className="text-2xl">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Processa o lote em blocos enquanto a tela está aberta; se ela fechar, "Retomar" continua de onde parou. */
function Processamento({
  lote,
  importacao,
  aoAtualizar,
}: {
  lote: LoteDeImportacao
  importacao: FonteDeImportacaoDeContas
  aoAtualizar: (lote: LoteDeImportacao) => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const ehMeu = lote.ehMeu

  useEffect(() => {
    if (!ehMeu) return
    let ativo = true
    void (async () => {
      try {
        let atual: LoteDeImportacao = lote
        while (ativo && atual.estado === 'processando') {
          atual = await importacao.processarBloco(lote.id)
          if (ativo) aoAtualizar(atual)
        }
      } catch (falha) {
        if (ativo) setErro(mensagemDeErro(falha))
      }
    })()
    return () => {
      ativo = false
    }
    // O laço segue o lote que a tela recebe a cada bloco; só o lote, quem processa e a retomada o reiniciam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote.id, ehMeu, importacao, tentativa])

  const { contagens } = lote
  const feitas = contagens.total - contagens.pendentes
  return (
    <Bloco titulo="Processamento">
      <progress
        aria-label="Progresso da importação"
        value={feitas}
        max={Math.max(contagens.total, 1)}
        className="w-full max-w-xl"
      />
      <p role="status" className="text-sm text-al-ink">
        {feitas} de {contagens.total} linhas processadas
      </p>
      <Contagens lote={lote} />
      {!ehMeu && <p className="text-sm text-al-muted">Só quem importou o arquivo processa as linhas.</p>}
      {erro && (
        <>
          <Mensagem tipo="erro">{erro}</Mensagem>
          <button
            type="button"
            className={cn(BOTAO_SECUNDARIO, 'self-start')}
            onClick={() => {
              setErro(null)
              setTentativa((n) => n + 1)
            }}
          >
            Retomar
          </button>
        </>
      )}
    </Bloco>
  )
}

function Relatorio({ lote, importacao }: { lote: LoteDeImportacao; importacao: FonteDeImportacaoDeContas }) {
  const [erro, setErro] = useState<string | null>(null)

  async function baixar(filtro: 'problemas' | 'todas') {
    setErro(null)
    try {
      const todas: LinhaDaImportacao[] = []
      for (;;) {
        const pagina = await importacao.linhas(lote.id, filtro, todas.length, 500)
        todas.push(...pagina)
        if (pagina.length < 500) break
      }
      const base = lote.arquivo.replace(/\.[^.]+$/, '')
      baixarTexto(`${filtro === 'problemas' ? 'erros' : 'relatorio'}-${base}.csv`, montarCsvDoRelatorio(lote, todas))
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <>
      <Bloco titulo="Relatório">
        <Contagens lote={lote} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void baixar('problemas')}>
            Baixar erros (CSV)
          </button>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void baixar('todas')}>
            Baixar relatório completo (CSV)
          </button>
        </div>
        <Mensagem tipo="erro">{erro}</Mensagem>
      </Bloco>
      <TabelaDeLinhas lote={lote} importacao={importacao} filtros={['problemas', 'todas']} />
      <Distribuicao lote={lote} importacao={importacao} />
    </>
  )
}

/** A Distribuição da importação (CRM-06): o Administrador reparte, em rodízio, as Contas criadas entre participantes ativos. */
function Distribuicao({ lote, importacao }: { lote: LoteDeImportacao; importacao: FonteDeImportacaoDeContas }) {
  const fonte = useFonte()
  const [contas, setContas] = useState<ContaDistribuivel[]>([])
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    void (async () => {
      try {
        const dados = await fonte.participantesDoWorkspace()
        if (dados.papel !== 'administrador') return
        const distribuiveis = await importacao.contasDistribuiveis(lote.id)
        if (!ativo) return
        setParticipantes(dados.participantes)
        setContas(distribuiveis)
      } catch {
        // Quem não pode distribuir simplesmente não vê a seção.
      }
    })()
    return () => {
      ativo = false
    }
  }, [fonte, importacao, lote.id, versao])

  async function distribuir() {
    setMensagem(null)
    try {
      const alteradas = await importacao.distribuir(
        lote.id,
        contas.map((conta, i) => ({ contaId: conta.contaId, responsavelId: escolhidos[i % escolhidos.length] })),
      )
      setMensagem({ tipo: 'sucesso', texto: `${alteradas} ${alteradas === 1 ? 'Conta mudou' : 'Contas mudaram'} de responsável.` })
      setEscolhidos([])
      setVersao((n) => n + 1)
    } catch (falha) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(falha) })
    }
  }

  if (contas.length === 0 && !mensagem) return null
  if (contas.length === 0 && mensagem) return <Bloco titulo="Distribuir Contas"><Mensagem tipo={mensagem.tipo}>{mensagem.texto}</Mensagem></Bloco>

  return (
    <Bloco titulo="Distribuir Contas">
      <p className="text-sm text-al-muted">
        {contas.length} {contas.length === 1 ? 'Conta criada' : 'Contas criadas'} por esta importação ainda{' '}
        {contas.length === 1 ? 'está' : 'estão'} com quem importou. A distribuição vale uma vez por Conta, até{' '}
        {formatarDataCompleta(contas[0].distribuivelAte)}. Escolha os participantes que recebem; as Contas são repartidas em
        rodízio.
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Participantes que recebem as Contas</legend>
        {participantes.map(({ conta }) => (
          <label key={conta.id} className="flex items-center gap-2 text-sm text-al-ink">
            <input
              type="checkbox"
              checked={escolhidos.includes(conta.id)}
              onChange={(e) =>
                setEscolhidos((atuais) => (e.target.checked ? [...atuais, conta.id] : atuais.filter((id) => id !== conta.id)))
              }
            />
            {conta.nome}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={escolhidos.length === 0}
        className={cn(BOTAO_PRIMARIO, 'self-start')}
        onClick={() => void distribuir()}
      >
        Distribuir Contas
      </button>
      {mensagem && <Mensagem tipo={mensagem.tipo}>{mensagem.texto}</Mensagem>}
    </Bloco>
  )
}

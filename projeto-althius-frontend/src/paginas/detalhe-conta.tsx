import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Building2, ExternalLink, Pause, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SeloDeAderencia } from '@/components/aderencia'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useAmbiente, useDadosDeContas, useDadosDeSequencias, useFonteDeContas } from '@/fonte/contexto'
import type { ContaAlvo, Contato, Interacao, Sinal, TipoDeInteracao } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo, formatarDataExplicita } from '@/fonte/formatar-data'
import { estaValido } from '@/fonte/regras-sinais'
import { cn, porId } from '@/lib/utils'
import { AcoesDaConta } from './arquivar-e-apagar'
import { useCamposDoContato } from './campos-do-contato'
import { SeloStatus } from './detalhe-sequencia'
import { CAMPO, CamposDoContato } from './formulario-de-contato'
import { FalhaAoCarregar } from './modulo-contas-e-contatos'
import { DialogoNovaSequencia } from './nova-sequencia'
import { Foguinho } from './sinais/componentes'
import { TabelaDeContatos } from './tabela-de-contatos'
import { useMigalhaParaALista } from './voltar-para-a-lista'

interface Props {
  contaId: string
}

const ROTULOS_INTERACOES: Record<TipoDeInteracao, string> = {
  'email-enviado': 'E-mail enviado',
  'email-recebido': 'E-mail recebido',
  'mensagem-enviada': 'Mensagem enviada',
  ligacao: 'Ligação',
  reuniao: 'Reunião',
}

const VOLTAR_PARA_CONTAS = { para: '/contas', rotulo: 'Contas' }

/** O detalhe de uma Conta-alvo, numa página só: cabeçalho e, abaixo, as seções em sequência. */
export function DetalheConta({ contaId }: Props) {
  const fonte = useFonteDeContas()
  const hoje = fonte.hoje()
  // Uma Sequência nasce com Contatos participantes: sem Contatos no Workspace, não há como criá-la.
  const permiteCriarSequencia = useAmbiente().disponivel('contatos')
  const [dialogoNovaAberto, setDialogoNovaAberto] = useState(false)
  // A migalha volta para a lista de onde o detalhe foi aberto (Contas ou Contatos), com o recorte que ela tinha.
  const voltar = useMigalhaParaALista(VOLTAR_PARA_CONTAS)

  const {
    dados: conta,
    carregando: carregandoConta,
    erro: erroConta,
    recarregar: recarregarConta,
  } = useDadosDeContas((f) => f.conta(contaId), [contaId])

  const { dados: sinais, carregando: carregandoSinais } = useDadosDeContas(
    (f) => f.sinaisDaConta(contaId),
    [contaId],
  )

  const { dados: contatos, carregando: carregandoContatos } = useDadosDeContas(
    (f) => f.contatosDaConta(contaId),
    [contaId],
  )

  const {
    dados: interacoes,
    carregando: carregandoInteracoes,
    erro: erroInteracoes,
    recarregar: recarregarInteracoes,
  } = useDadosDeContas(
    (f) => f.interacoesDaConta(contaId),
    [contaId],
  )

  const {
    dados: sequencia,
    carregando: carregandoSequencia,
  } = useDadosDeSequencias((f) => f.sequenciaPorConta(contaId), [contaId])

  // A âncora do endereço (a seção Contatos, vindo da tabela de Contas) só tem onde cair quando as seções acima dela
  // já têm a altura final. Rola uma vez por navegação: um "Tentar de novo" não devolve a página à âncora.
  const { hash, key } = useLocation()
  const navegacaoJaRolada = useRef<string | null>(null)
  const secoesAcimaProntas = !carregandoConta && !carregandoSinais && !carregandoContatos
  useEffect(() => {
    if (!hash || !secoesAcimaProntas || navegacaoJaRolada.current === key) return
    const secao = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!secao) return
    navegacaoJaRolada.current = key
    secao.scrollIntoView()
  }, [hash, key, secoesAcimaProntas])

  if (carregandoConta) {
    return (
      <Pagina titulo="Contas" icone={Building2}>
        <Carregando />
      </Pagina>
    )
  }

  // A fonte rejeita um identificador que não existe; qualquer outra falha é um erro de carregamento.
  if (!conta && (!erroConta || erroConta.message.includes('não encontrada'))) {
    return (
      <Pagina titulo="Conta não encontrada" voltar={voltar}>
        <Link to={voltar.para} state={voltar.estado} className="self-start underline underline-offset-4">
          Voltar para {voltar.rotulo}
        </Link>
      </Pagina>
    )
  }

  if (!conta) {
    return (
      <Pagina titulo="Contas" icone={Building2}>
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-sm text-al-muted">Não foi possível carregar a Conta-alvo.</p>
          <Button
            type="button"
            variant="outline"
            onClick={recarregarConta}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        </div>
      </Pagina>
    )
  }

  const contatosPorId = porId(contatos ?? [])
  // Só o Vendedor responsável cria a Sequência da Conta (ADR-0009); uma fonte que não informa a responsabilidade não restringe.
  // Uma Conta arquivada saiu da operação: nada de Sequência, Contato nem Interação nova até ser restaurada (CRM-18).
  const arquivada = !!conta.arquivadaEm
  const podeCriarSequencia = permiteCriarSequencia && conta.sobMinhaResponsabilidade !== false && !arquivada
  const sequenciaEncerrada = sequencia?.status === 'encerrada'

  return (
    <Pagina titulo={conta.nome} voltar={voltar} className="gap-0">
      <CabecalhoDaConta conta={conta} hoje={hoje} />
      <AcoesDaConta conta={conta} temSequenciaEmAndamento={!!sequencia && !sequenciaEncerrada} />

      <div className="flex flex-col">
        <Secao id="sinais" titulo="Sinais" contagem={sinais && contar(sinais.length, 'sinal', 'sinais')}>
          {carregandoSinais ? (
            <Carregando />
          ) : sinais && sinais.length > 0 ? (
            <SinaisDaConta sinais={sinais} hoje={hoje} />
          ) : (
            <SecaoVazia>Nenhum sinal</SecaoVazia>
          )}
        </Secao>

        <Secao id="contatos" titulo="Contatos" contagem={contatos && contar(contatos.length, 'contato', 'contatos')}>
          {conta.sobMinhaResponsabilidade && !arquivada && (
            <VinculosDaConta contaId={conta.id} contatosDaConta={contatos ?? []} />
          )}
          {carregandoContatos && <Carregando />}

          {!carregandoContatos && (!contatos || contatos.length === 0) && (
            <SecaoVazia>Nenhum contato</SecaoVazia>
          )}

          {!carregandoContatos && contatos && contatos.length > 0 && (
            <div className="overflow-x-auto">
              <TabelaDeContatos
                linhas={contatos
                  .toSorted((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                  .map((contato) => ({ contato, conta }))}
                hoje={hoje}
                rotulo="Contatos da Conta-alvo"
                comEmpresa={false}
              />
            </div>
          )}
        </Secao>

        <Secao
          id="interacoes"
          titulo="Interações"
          contagem={interacoes && contar(interacoes.length, 'interação', 'interações')}
        >
          {conta.sobMinhaResponsabilidade && !arquivada && <FormularioDeInteracao contaId={conta.id} />}
          {carregandoInteracoes ? (
            <Carregando />
          ) : erroInteracoes ? (
            <FalhaAoCarregar mensagem="Não foi possível carregar as interações." tentarDeNovo={recarregarInteracoes} />
          ) : interacoes && interacoes.length > 0 ? (
            <ol aria-label="Interações" className={LINHA_DO_TEMPO}>
              {interacoes.map((interacao) => (
                <ItemDeInteracao
                  key={interacao.id}
                  interacao={interacao}
                  nomeDoContato={interacao.contatoId && contatosPorId[interacao.contatoId]?.nome}
                  hoje={hoje}
                />
              ))}
            </ol>
          ) : (
            <SecaoVazia>Nenhuma interação registrada</SecaoVazia>
          )}
        </Secao>

        <Secao
          id="sequencia"
          titulo="Sequência"
          contagem={sequencia && (sequenciaEncerrada ? null : `${contar(sequencia.steps.length, 'step', 'steps')} ordenados`)}
        >

          {carregandoSequencia && (
            <div className="border border-al-line bg-al-surface p-4">
              <Carregando />
            </div>
          )}

          {!carregandoSequencia && sequencia && (
            <div className="flex flex-col gap-3 border border-al-line bg-al-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-al-line pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <SeloStatus status={sequencia.status} />
                  <span className="text-sm font-medium text-al-ink">
                    Plano de abordagem da {conta.nome}
                  </span>
                </div>

                <Link
                  to={`/sequencias/${sequencia.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium tracking-rotulo uppercase text-al-ink hover:text-al-accent underline underline-offset-4"
                >
                  Ver sequência <ArrowRight className="size-3.5" />
                </Link>
              </div>

              {sequenciaEncerrada ? (
                <p className="text-xs text-al-muted">
                  {sequencia.encerradaPor === 'exclusao'
                    ? 'Encerrada porque a Conta-alvo foi apagada. Os passos pendentes foram cancelados.'
                    : 'Encerrada porque a responsabilidade pela Conta-alvo mudou. Os passos pendentes foram cancelados; o Vendedor responsável atual cria a Sequência dele.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-al-muted pt-1">
                  <div>
                    <span className="rotulo block text-al-muted">Cobertura</span>
                    <span className="text-sm font-medium text-al-ink">
                      {sequencia.totalParticipantes}{' '}
                      {sequencia.totalParticipantes === 1 ? 'contato participante' : 'contatos participantes'}
                    </span>
                  </div>

                  <div>
                    <span className="rotulo block text-al-muted">Progresso</span>
                    <span className="text-sm font-medium text-al-ink">
                      Passo atual: {Math.min(sequencia.passoAtual + 1, sequencia.steps.length)} de {sequencia.steps.length}
                    </span>
                  </div>
                </div>
              )}

              {sequencia.status === 'pausada' && (
                <div className="mt-2 flex items-start gap-2.5 border border-al-atencao/40 bg-al-atencao/10 p-3 text-xs text-al-ink">
                  <Pause className="size-4 shrink-0 text-al-atencao mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <p>
                      <strong>Sequência pausada · Pausa da Conta inteira:</strong>{' '}
                      {sequencia.motivoPause ?? 'resposta recebida na Conta-alvo'}. Toda a abordagem da empresa está em pausa aguardando análise humana.
                    </p>
                    <span className="text-[0.6875rem] text-al-muted">
                      Nenhum Contato da empresa recebe os próximos steps enquanto a sequência estiver pausada.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!carregandoSequencia && !sequencia && !podeCriarSequencia && (
            <SecaoVazia>Nenhuma sequência nesta Conta-alvo</SecaoVazia>
          )}

          {!carregandoSequencia && (!sequencia || sequenciaEncerrada) && podeCriarSequencia && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-dashed border-al-line bg-al-surface/40 p-5">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-al-ink">
                  {sequenciaEncerrada ? 'Nenhuma sequência em andamento nesta Conta-alvo.' : 'Nenhuma sequência nesta Conta-alvo.'}
                </p>
                <p className="text-xs text-al-muted">
                  Crie um plano estruturado de abordagem por e-mail, LinkedIn e outros canais para esta empresa.
                </p>
              </div>

              <Button
                type="button"
                onClick={() => setDialogoNovaAberto(true)}
                className="inline-flex items-center gap-1.5 h-9 border border-al-accent bg-al-accent px-4 text-xs font-medium tracking-rotulo text-al-on-accent uppercase hover:bg-al-accent-2 shrink-0"
              >
                <Plus className="size-3.5" />
                Criar sequência
              </Button>
            </div>
          )}
        </Secao>
      </div>

      <DialogoNovaSequencia
        aberto={dialogoNovaAberto}
        aoMudar={setDialogoNovaAberto}
        contaIdInicial={conta.id}
      />
    </Pagina>
  )
}

/** Logo, nome, links, segmento, Aderência e origem: só o que a fonte entregar. */
function CabecalhoDaConta({ conta, hoje }: { conta: ContaAlvo; hoje: Date }) {
  const { origem } = conta

  return (
    <header className="flex items-start gap-4 border-b border-al-line pt-2 pb-7">
      <LogoDaConta
        nome={conta.nome}
        logo={conta.logo}
        deUmaCor={conta.logoDeUmaCor}
        className="size-11 rounded-[6px] text-sm"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="titulo-display text-[2.375rem] leading-none">{conta.nome}</h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-al-muted">
          {conta.dominio &&
            (conta.siteUrl ? (
              <LinkExterno href={conta.siteUrl}>{conta.dominio}</LinkExterno>
            ) : (
              <span>{conta.dominio}</span>
            ))}
          {conta.linkedinUrl && <LinkExterno href={conta.linkedinUrl}>LinkedIn</LinkExterno>}
          {conta.segmento && <span>{conta.segmento}</span>}
          {(conta.totalSinaisValidos ?? 0) > 0 && <Foguinho quantidade={conta.totalSinaisValidos!} />}
          <SeloDeAderencia aderencia={conta.aderencia} />
        </div>
        {origem && (
          <p className="mt-2.5 text-xs text-al-muted">
            {origem.tipo === 'recomendada' ? (
              'Recomendada pela Althius'
            ) : (
              <>
                Importada por {origem.importadaPor} em{' '}
                <span title={formatarDataCompleta(origem.importadaEm)} aria-label={formatarDataCompleta(origem.importadaEm)}>
                  {formatarDataExplicita(origem.importadaEm, hoje)}
                </span>
                .
              </>
            )}
          </p>
        )}
      </div>
    </header>
  )
}

function LinkExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 hover:text-al-ink hover:underline underline-offset-2"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

function Secao({
  id,
  titulo,
  contagem,
  children,
}: {
  id: string
  titulo: string
  contagem?: string | null
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`secao-${id}`}
      className="flex scroll-mt-22 flex-col gap-4 border-b border-al-line py-8"
    >
      <div className="flex items-baseline justify-between">
        <h3 id={`secao-${id}`} className="titulo-display text-[1.3125rem]">
          {titulo}
        </h3>
        {contagem && <span className="text-xs text-al-muted">{contagem}</span>}
      </div>
      {children}
    </section>
  )
}

function SecaoVazia({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-30 place-items-center border border-dashed border-al-line text-sm text-al-muted">
      {children}
    </div>
  )
}

function contar(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`
}

const LINHA_DO_TEMPO = 'flex flex-col'
// Cada item desenha o seu trecho da linha vertical à esquerda e o seu ponto.
const ITEM_DA_LINHA_DO_TEMPO =
  "relative border-l border-al-line pb-5 pl-5 last:pb-0 before:absolute before:top-1.5 before:-left-1 before:size-[7px] before:rounded-full before:bg-al-muted before:content-['']"

/** A data do módulo, com a data completa no tooltip e no nome acessível. */
function DataDoModulo({ data, hoje }: { data: string; hoje: Date }) {
  const completa = formatarDataCompleta(data)
  return (
    <span title={completa} aria-label={completa}>
      {formatarDataDoModulo(data, hoje, { maiuscula: true })}
    </span>
  )
}

/** O Sinal mais recente em destaque e, abaixo, o histórico dos outros, do mais recente ao mais antigo. */
function SinaisDaConta({ sinais, hoje }: { sinais: Sinal[]; hoje: Date }) {
  const [maisRecente, ...historico] = sinais

  return (
    <>
      <article
        aria-label="Sinal mais recente"
        className="border-l-2 border-al-accent bg-al-surface px-5 py-4.5"
      >
        <p className="mb-2 text-lg font-light text-al-ink">{maisRecente.frase}</p>
        {maisRecente.descricao && maisRecente.descricao !== maisRecente.frase && (
          <p className="mb-2 text-sm text-al-muted">{maisRecente.descricao}</p>
        )}
        {maisRecente.evidencia && !maisRecente.evidencia.startsWith('http') && (
          <blockquote className="mb-3 border-l-2 border-al-line pl-3 text-xs italic text-al-muted">
            {maisRecente.evidencia}
          </blockquote>
        )}
        <DetalhesDoSinal sinal={maisRecente} hoje={hoje} />
      </article>

      {historico.length > 0 && (
        <ol aria-label="Histórico de sinais" className={`${LINHA_DO_TEMPO} mt-2`}>
          {historico.map((sinal) => (
            <li key={sinal.id} className={ITEM_DA_LINHA_DO_TEMPO}>
              <p className="mb-0.5 text-sm text-al-ink">{sinal.frase}</p>
              {sinal.descricao && sinal.descricao !== sinal.frase && (
                <p className="mb-1 text-xs text-al-muted">{sinal.descricao}</p>
              )}
              {sinal.evidencia && !sinal.evidencia.startsWith('http') && (
                <blockquote className="my-1 border-l-2 border-al-line pl-3 text-xs italic text-al-muted">
                  {sinal.evidencia}
                </blockquote>
              )}
              <DetalhesDoSinal sinal={sinal} hoje={hoje} />
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/**
 * Se o Sinal ainda vale (30 dias do disparo, ADR 0007), a data e, quando existirem, a fonte, a evidência e quem o
 * detectou. Um reencontro do mesmo acontecimento aparece como nota: não conta de novo nem renova a validade.
 */
function DetalhesDoSinal({ sinal, hoje }: { sinal: Sinal; hoje: Date }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-al-muted">
        <span className="selo">{estaValido(sinal, hoje) ? 'Válido' : 'Expirado'}</span>
        <DataDoModulo data={sinal.data} hoje={hoje} />
        {sinal.fonte && <span>Fonte: {sinal.fonte}</span>}
        {sinal.evidencia && (
          sinal.evidencia.startsWith('http://') || sinal.evidencia.startsWith('https://') ? (
            <LinkExterno href={sinal.evidencia}>Evidência</LinkExterno>
          ) : null
        )}
        {sinal.detectadoPor && <span>Detectado por {sinal.detectadoPor}</span>}
      </div>
      {sinal.reencontrado && (
        <p className="mt-1 text-xs text-al-muted">
          Reencontrado em {formatarDataDoModulo(sinal.reencontrado.data, hoje, { maiuscula: false })}: o mesmo
          acontecimento não conta de novo nem renova validade.
        </p>
      )}
    </>
  )
}

function ItemDeInteracao({
  interacao,
  nomeDoContato,
  hoje,
}: {
  interacao: Interacao
  nomeDoContato?: string
  hoje: Date
}) {
  return (
    <li className={ITEM_DA_LINHA_DO_TEMPO}>
      <p className="mb-0.5 text-sm text-al-ink">
        {ROTULOS_INTERACOES[interacao.tipo]}
        {nomeDoContato && ` · ${nomeDoContato}`}
      </p>
      <p className="text-xs text-al-muted">
        <DataDoModulo data={interacao.data} hoje={hoje} />
        {interacao.participanteCliente && ` · ${interacao.participanteCliente}`}
        {interacao.origem && ` · ${interacao.origem}`}
      </p>
    </li>
  )
}

/** O Vendedor responsável registra uma Interação comercial manual na Conta; ela entra no histórico abaixo. */
function FormularioDeInteracao({ contaId }: { contaId: string }) {
  const fonte = useFonteDeContas()
  const [tipo, setTipo] = useState<TipoDeInteracao>('ligacao')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function registrar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await fonte.registrarInteracao({ contaId, tipo })
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a interação.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form aria-label="Registrar interação" onSubmit={registrar} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        Tipo de interação
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoDeInteracao)}
          className="h-9 cursor-pointer border border-al-line bg-al-surface pr-8 pl-3 text-sm text-al-ink"
        >
          {Object.entries(ROTULOS_INTERACOES).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        variant="outline"
        disabled={salvando}
        className="h-9 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
      >
        Registrar
      </Button>
      {erro && (
        <p role="alert" className="w-full text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </form>
  )
}

const BOTAO_SECUNDARIO = 'h-9 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface'

/**
 * O que o Vendedor responsável faz com os Contatos da Conta: cadastrar um Contato novo, vincular um Contato que já
 * atua em outra Conta e encerrar o Vínculo de quem saiu da empresa (as Interações ficam nesta Conta).
 */
function VinculosDaConta({ contaId, contatosDaConta }: { contaId: string; contatosDaConta: Contato[] }) {
  const fonte = useFonteDeContas()
  const [cadastrando, setCadastrando] = useState(false)
  const { dados: todos } = useDadosDeContas((f) => f.contatos(), [])
  const nestaConta = new Set(contatosDaConta.map((c) => c.id))
  const deOutrasContas = [...new Map((todos ?? []).filter((c) => !nestaConta.has(c.id)).map((c) => [c.id, c])).values()]

  return (
    <div className="flex flex-col gap-3 pb-3">
      {fonte.salvarContato && !cadastrando && (
        <Button type="button" variant="outline" onClick={() => setCadastrando(true)} className={cn(BOTAO_SECUNDARIO, 'self-start')}>
          <Plus className="mr-1.5 size-4" /> Novo Contato
        </Button>
      )}
      {cadastrando && fonte.salvarContato && (
        <FormularioNovoContato contaId={contaId} fechar={() => setCadastrando(false)} />
      )}
      {fonte.vincularContato && deOutrasContas.length > 0 && (
        <AcaoDeVinculo
          rotulo="Vincular Contato"
          campo="Contato de outra Conta"
          botao="Vincular"
          opcoes={deOutrasContas}
          agir={(contatoId) => fonte.vincularContato!(contatoId, contaId)}
        />
      )}
      {fonte.encerrarVinculo && contatosDaConta.length > 0 && (
        <AcaoDeVinculo
          rotulo="Encerrar Vínculo"
          campo="Contato desta Conta"
          botao="Encerrar vínculo"
          opcoes={contatosDaConta}
          agir={(contatoId) => fonte.encerrarVinculo!(contatoId, contaId)}
        />
      )}
    </div>
  )
}

/** Escolhe um Contato e age sobre o Vínculo dele com a Conta. */
function AcaoDeVinculo({
  rotulo,
  campo,
  botao,
  opcoes,
  agir,
}: {
  rotulo: string
  campo: string
  botao: string
  opcoes: Contato[]
  agir: (contatoId: string) => Promise<void>
}) {
  const [contatoId, setContatoId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!contatoId) return
    setSalvando(true)
    setErro(null)
    try {
      await agir(contatoId)
      setContatoId('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar o Vínculo do Contato.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form aria-label={rotulo} onSubmit={enviar} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-al-muted">
        {campo}
        <select value={contatoId} onChange={(e) => setContatoId(e.target.value)} className={cn(CAMPO, 'cursor-pointer pr-8')}>
          <option value="">Escolha um Contato</option>
          {opcoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={salvando || !contatoId} className={BOTAO_SECUNDARIO}>
        {botao}
      </Button>
      {erro && (
        <p role="alert" className="w-full text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </form>
  )
}

/** O cadastro de um Contato na Conta: só o nome é obrigatório; o nome sozinho não mescla com outro Contato. */
function FormularioNovoContato({ contaId, fechar }: { contaId: string; fechar: () => void }) {
  const fonte = useFonteDeContas()
  const { campos, editar } = useCamposDoContato({ nome: '', cargo: '', email: '', whatsapp: '', linkedin: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await fonte.salvarContato!({ contaId, ...campos })
      fechar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o Contato.')
      setSalvando(false)
    }
  }

  return (
    <form aria-label="Novo Contato" onSubmit={enviar} className="flex flex-wrap items-end gap-3 border border-al-line bg-al-surface/40 p-4">
      <CamposDoContato campos={campos} editar={editar} />
      <Button
        type="submit"
        disabled={salvando}
        className="h-9 border border-al-accent bg-al-accent px-4 text-xs font-medium tracking-rotulo text-al-on-accent uppercase hover:bg-al-accent-2"
      >
        Salvar
      </Button>
      <Button type="button" variant="outline" onClick={fechar} className={BOTAO_SECUNDARIO}>
        Cancelar
      </Button>
      {erro && (
        <p role="alert" className="w-full text-sm text-al-atencao">
          {erro}
        </p>
      )}
    </form>
  )
}

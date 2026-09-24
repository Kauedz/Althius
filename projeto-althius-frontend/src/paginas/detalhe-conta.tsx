import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, ExternalLink, Pause, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SeloDeAderencia } from '@/components/aderencia'
import { LogoDaConta } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useDadosDeSequencias, useFonteDeContas } from '@/fonte/contexto'
import type { ContaAlvo, Interacao, Sinal, TipoDeInteracao } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo, formatarDataExplicita } from '@/fonte/formatar-data'
import { porId } from '@/lib/utils'
import { SeloStatus } from './detalhe-sequencia'
import { DialogoNovaSequencia } from './nova-sequencia'
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

  const { dados: interacoes, carregando: carregandoInteracoes } = useDadosDeContas(
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

  return (
    <Pagina titulo={conta.nome} voltar={voltar} className="gap-0">
      <CabecalhoDaConta conta={conta} hoje={hoje} />

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
          {carregandoInteracoes ? (
            <Carregando />
          ) : interacoes && interacoes.length > 0 ? (
            <ol aria-label="Interações" className={LINHA_DO_TEMPO}>
              {interacoes.map((interacao) => (
                <ItemDeInteracao
                  key={interacao.id}
                  interacao={interacao}
                  nomeDoContato={contatosPorId[interacao.contatoId]?.nome}
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
          contagem={sequencia && `${contar(sequencia.steps.length, 'step', 'steps')} ordenados`}
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

          {!carregandoSequencia && !sequencia && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-dashed border-al-line bg-al-surface/40 p-5">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-al-ink">
                  Nenhuma sequência nesta Conta-alvo.
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
        <p className="mb-3 text-lg font-light text-al-ink">{maisRecente.frase}</p>
        <DetalhesDoSinal sinal={maisRecente} hoje={hoje} />
      </article>

      {historico.length > 0 && (
        <ol aria-label="Histórico de sinais" className={`${LINHA_DO_TEMPO} mt-2`}>
          {historico.map((sinal) => (
            <li key={sinal.id} className={ITEM_DA_LINHA_DO_TEMPO}>
              <p className="mb-0.5 text-sm text-al-ink">{sinal.frase}</p>
              <DetalhesDoSinal sinal={sinal} hoje={hoje} />
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** A data do Sinal e, quando existirem, a fonte, a evidência e quem o detectou. */
function DetalhesDoSinal({ sinal, hoje }: { sinal: Sinal; hoje: Date }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-al-muted">
      <DataDoModulo data={sinal.data} hoje={hoje} />
      {sinal.fonte && <span>Fonte: {sinal.fonte}</span>}
      {sinal.evidencia && <LinkExterno href={sinal.evidencia}>Evidência</LinkExterno>}
      {sinal.detectadoPor && <span>Detectado por {sinal.detectadoPor}</span>}
    </div>
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

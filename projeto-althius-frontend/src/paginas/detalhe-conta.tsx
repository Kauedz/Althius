import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Mail,
  Pause,
  Phone,
  Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Button } from '@/components/ui/button'
import { useDadosDeContas, useDadosDeSequencias, useFonteDeContas } from '@/fonte/contexto'
import type { Aderencia, TipoDeInteracao } from '@/fonte/contas-tipos'
import { formatarDataCompleta, formatarDataDoModulo } from '@/fonte/formatar-data'
import { SeloStatus } from './detalhe-sequencia'
import { DialogoNovaSequencia } from './nova-sequencia'

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

export function DetalheConta({ contaId }: Props) {
  const fonte = useFonteDeContas()
  const hoje = fonte.hoje()
  const [dialogoNovaAberto, setDialogoNovaAberto] = useState(false)

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

  if (carregandoConta) {
    return <Carregando />
  }

  const naoEncontrada = !conta || (erroConta !== null && erroConta.message.includes('não encontrada'))

  if (erroConta || !conta) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-8">
        <Link
          to="/contas"
          className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase"
        >
          <ArrowLeft className="size-4" /> Voltar para Contas
        </Link>
        <p className="text-sm text-al-muted">
          {naoEncontrada ? 'Conta não encontrada.' : 'Não foi possível carregar a conta.'}
        </p>
        {!naoEncontrada && erroConta && (
          <Button
            type="button"
            variant="outline"
            onClick={recarregarConta}
            className="h-8 border-al-line text-xs tracking-rotulo uppercase hover:bg-al-surface"
          >
            Tentar de novo
          </Button>
        )}
      </div>
    )
  }

  const contatosMap = new Map(contatos?.map((c) => [c.id, c]) ?? [])
  const sinalMaisRecente = sinais && sinais.length > 0 ? sinais[0] : null
  const outrosSinais = sinais && sinais.length > 1 ? sinais.slice(1) : []

  // Iniciais para o logo quando não houver imagem
  const iniciais = conta.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Navegação / Migalha */}
      <div>
        <Link
          to="/contas"
          className="inline-flex items-center gap-1.5 text-xs text-al-muted hover:text-al-ink tracking-rotulo uppercase"
        >
          <ArrowLeft className="size-4" /> Contas / {conta.nome}
        </Link>
      </div>

      {/* Cabeçalho da Conta-alvo */}
      <div className="flex flex-col gap-3 border-b border-al-line pb-6">
        <div className="flex flex-wrap items-center gap-4">
          {conta.logo ? (
            <img
              src={conta.logo}
              alt={`Logo da ${conta.nome}`}
              className="size-12 rounded-none border border-al-line object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-12 shrink-0 border border-al-line bg-al-surface flex items-center justify-center font-bold text-base text-al-ink"
            >
              {iniciais}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="titulo-secao text-2xl font-light uppercase text-al-ink">
                {conta.nome}
              </h2>
              <BadgeAderencia aderencia={conta.aderencia} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-al-muted">
              {conta.dominio && (
                <a
                  href={conta.siteUrl ?? `https://${conta.dominio}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-al-ink underline underline-offset-2"
                >
                  {conta.dominio}
                  <ExternalLink className="size-3" />
                </a>
              )}

              {conta.linkedinUrl && (
                <>
                  <span>·</span>
                  <a
                    href={conta.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-al-ink underline underline-offset-2"
                  >
                    LinkedIn
                    <ExternalLink className="size-3" />
                  </a>
                </>
              )}

              {conta.segmento && (
                <>
                  <span>·</span>
                  <span>{conta.segmento}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Linha discreta de origem */}
        {conta.origem && (
          <p className="text-xs text-al-muted">
            {conta.origem.tipo === 'recomendada' && 'Recomendada pela Althius'}
            {conta.origem.tipo === 'importada' &&
              `Importada por ${conta.origem.importadaPor} em ${formatarDataDoModulo(conta.origem.importadaEm, hoje, { maiuscula: false })}.`}
          </p>
        )}
      </div>

      {/* Seções principais do Detalhe */}
      <div className="flex flex-col gap-8">
        {/* SEÇÃO SEQUÊNCIA (TICKET 04) */}
        <section aria-labelledby="secao-sequencia" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 id="secao-sequencia" className="rotulo text-xs font-semibold uppercase text-al-muted">
              Sequência
            </h3>
            {sequencia && (
              <span className="text-xs text-al-muted">
                {sequencia.steps.length} {sequencia.steps.length === 1 ? 'step' : 'steps'} ordenados
              </span>
            )}
          </div>

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
                  <p>
                    <strong>Sequência pausada:</strong>{' '}
                    {sequencia.motivoPause ?? 'resposta recebida na Conta-alvo'}. Toda a abordagem da empresa está em pausa aguardando análise humana.
                  </p>
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
        </section>

        {/* SEÇÃO SINAIS */}
        <section aria-labelledby="secao-sinais" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 id="secao-sinais" className="rotulo text-xs font-semibold uppercase text-al-muted">
              Sinais
            </h3>
            {sinais && (
              <span className="text-xs text-al-muted">
                {sinais.length} {sinais.length === 1 ? 'sinal' : 'sinais'}
              </span>
            )}
          </div>

          {carregandoSinais && <Carregando />}

          {!carregandoSinais && (!sinais || sinais.length === 0) && (
            <div className="border border-al-line bg-al-surface p-4 text-xs text-al-muted">
              Nenhum sinal
            </div>
          )}

          {!carregandoSinais && sinalMaisRecente && (
            <div className="flex flex-col gap-3">
              {/* Sinal mais recente em destaque */}
              <div className="border border-al-line bg-al-surface p-4 flex flex-col gap-2">
                <p className="text-sm font-medium text-al-ink">{sinalMaisRecente.frase}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-al-muted">
                  <span>
                    {formatarDataDoModulo(sinalMaisRecente.data, hoje, { maiuscula: true })}
                  </span>
                  {sinalMaisRecente.fonte && (
                    <>
                      <span>·</span>
                      <span>Fonte: {sinalMaisRecente.fonte}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>Detectado por {sinalMaisRecente.detectadoPor ?? 'Scopus'}</span>
                </div>
              </div>

              {/* Histórico dos outros sinais */}
              {outrosSinais.length > 0 && (
                <div className="flex flex-col divide-y divide-al-line border border-al-line bg-al-surface/40">
                  {outrosSinais.map((s) => (
                    <div key={s.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-al-ink font-normal">{s.frase}</span>
                      <span className="text-al-muted shrink-0">
                        {formatarDataDoModulo(s.data, hoje, { maiuscula: false })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* SEÇÃO CONTATOS */}
        <section aria-labelledby="secao-contatos" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 id="secao-contatos" className="rotulo text-xs font-semibold uppercase text-al-muted">
              Contatos
            </h3>
            {contatos && (
              <span className="text-xs text-al-muted">
                {contatos.length} {contatos.length === 1 ? 'contato' : 'contatos'}
              </span>
            )}
          </div>

          {carregandoContatos && <Carregando />}

          {!carregandoContatos && (!contatos || contatos.length === 0) && (
            <div className="border border-al-line bg-al-surface p-4 text-xs text-al-muted">
              Nenhum contato
            </div>
          )}

          {!carregandoContatos && contatos && contatos.length > 0 && (
            <div className="overflow-x-auto border border-al-line bg-al-surface">
              <table aria-label="Tabela de Contatos da Conta" className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-al-line text-xs font-medium tracking-rotulo text-al-muted uppercase">
                    <th scope="col" className="py-2.5 px-4 font-normal">Nome</th>
                    <th scope="col" className="py-2.5 px-4 font-normal">Cargo</th>
                    <th scope="col" className="py-2.5 px-4 font-normal">Persona</th>
                    <th scope="col" className="py-2.5 px-4 font-normal">Canais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-al-line">
                  {contatos.map((contato) => (
                    <tr key={contato.id} className="h-10 text-xs">
                      <td className="py-2 px-4 font-medium text-al-ink">{contato.nome}</td>
                      <td className="py-2 px-4 text-al-muted">{contato.cargo ?? '—'}</td>
                      <td className="py-2 px-4 text-al-muted">{contato.persona ?? '—'}</td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span title={`E-mail ${contato.canais.email ? 'disponível' : 'indisponível'}`}>
                            <Mail
                              className={`size-3.5 ${contato.canais.email ? 'text-al-ink' : 'text-al-muted/20'}`}
                            />
                          </span>
                          <span title={`Telefone ${contato.canais.telefone ? 'disponível' : 'indisponível'}`}>
                            <Phone
                              className={`size-3.5 ${contato.canais.telefone ? 'text-al-ink' : 'text-al-muted/20'}`}
                            />
                          </span>
                          <span title={`LinkedIn ${contato.canais.linkedin ? 'disponível' : 'indisponível'}`}>
                            <svg
                              viewBox="0 0 24 24"
                              role="img"
                              aria-label={`LinkedIn ${contato.canais.linkedin ? 'disponível' : 'indisponível'}`}
                              className={`size-3.5 fill-none stroke-current ${contato.canais.linkedin ? 'text-al-ink' : 'text-al-muted/20'}`}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6ZM2 9h4v12H2z" />
                              <circle cx="4" cy="4" r="2" />
                            </svg>
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SEÇÃO INTERAÇÕES */}
        <section aria-labelledby="secao-interacoes" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 id="secao-interacoes" className="rotulo text-xs font-semibold uppercase text-al-muted">
              Interações
            </h3>
            {interacoes && (
              <span className="text-xs text-al-muted">
                {interacoes.length} {interacoes.length === 1 ? 'interação' : 'interações'}
              </span>
            )}
          </div>

          {carregandoInteracoes && <Carregando />}

          {!carregandoInteracoes && (!interacoes || interacoes.length === 0) && (
            <div className="border border-al-line bg-al-surface p-4 text-xs text-al-muted">
              Nenhuma interação registrada
            </div>
          )}

          {!carregandoInteracoes && interacoes && interacoes.length > 0 && (
            <div className="flex flex-col divide-y divide-al-line border border-al-line bg-al-surface">
              {interacoes.map((item) => {
                const contato = contatosMap.get(item.contatoId)
                const rotuloTipo = ROTULOS_INTERACOES[item.tipo] ?? item.tipo
                const dataFormatada = formatarDataDoModulo(item.data, hoje, { maiuscula: true })
                const dataCompleta = formatarDataCompleta(item.data)

                return (
                  <div key={item.id} className="p-3.5 flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-al-ink">
                        {rotuloTipo}
                        {contato?.nome && ` · ${contato.nome}`}
                      </span>
                      <span title={dataCompleta} className="text-al-muted shrink-0">
                        {dataFormatada}
                      </span>
                    </div>

                    {(item.participanteCliente || item.origem) && (
                      <span className="text-al-muted text-xs">
                        {[item.participanteCliente, item.origem].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Modal para criar sequência caso o estado esteja vazio */}
      <DialogoNovaSequencia
        aberto={dialogoNovaAberto}
        aoMudar={setDialogoNovaAberto}
        contaIdInicial={conta.id}
      />
    </div>
  )
}

function BadgeAderencia({ aderencia }: { aderencia?: Aderencia }) {
  if (!aderencia) {
    return (
      <span
        title="Aderência ainda não avaliada"
        aria-label="Aderência ainda não avaliada"
        className="text-xs text-al-muted"
      >
        —
      </span>
    )
  }

  if (aderencia === 'quente') {
    return <span className="text-xs font-normal text-al-ink">🔥 Quente</span>
  }

  if (aderencia === 'fit') {
    return <span className="text-xs font-normal text-al-ink">Fit</span>
  }

  return <span className="text-xs font-normal text-al-muted">Não fit</span>
}

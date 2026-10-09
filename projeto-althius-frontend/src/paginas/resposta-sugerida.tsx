// A Resposta sugerida (canais 08 e 09): o Rhetor prepara uma resposta à mensagem do Contato, e só o titular a lê, edita,
// aprova e envia. Nada sai sem a Aprovação dele, e enviar não retoma a Sequência: ela segue pausada até a retomada.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PropostaDeResposta } from '@/fonte/sequencias-tipos'

/** A primeira geração é automática: sem o automático liberado, o Rhetor espera o titular pedir (creditos-e-planos 03). */
const MOTIVO_DA_PARADA: Record<NonNullable<PropostaDeResposta['paradaPeloTeto']>, string> = {
  confirmar:
    'O Rhetor só prepara a resposta quando você pede: o automático de Execuções de Agentes ou o do Rhetor está em Confirmar (Configurações › Automação e tetos).',
  sem_teto:
    'O Rhetor não preparou a resposta sozinho: o automático de Execuções de Agentes ou o do Rhetor não tem teto mensal aprovado (Configurações › Automação e tetos).',
  teto_atingido:
    'O Rhetor não preparou a resposta sozinho: o automático de Execuções de Agentes ou o do Rhetor chegou no teto do mês (Configurações › Automação e tetos).',
}

interface Props {
  propostas: PropostaDeResposta[]
  aoAprovarEEnviar: (pedido: { id: string; revisao: number; textoEditado?: string }) => Promise<{ enviada: boolean; mensagem?: string }>
  aoRejeitar: (id: string) => Promise<void>
  aoGerarDeNovo: (id: string) => Promise<void>
}

export function RespostaSugerida({ propostas, aoAprovarEEnviar, aoRejeitar, aoGerarDeNovo }: Props) {
  const visiveis = propostas.filter((p) => p.status !== 'rejeitada')
  if (visiveis.length === 0) return null
  return (
    <section aria-label="Resposta sugerida" className="flex flex-col gap-3 border border-al-line bg-al-surface p-4">
      <span className="text-xs font-semibold tracking-rotulo uppercase text-al-muted">
        Resposta sugerida · só você vê · nada sai sem a sua Aprovação
      </span>
      {visiveis.map((proposta) => (
        <CartaoDaProposta
          key={`${proposta.id}:${proposta.revisao}:${proposta.status}`}
          proposta={proposta}
          aoAprovarEEnviar={aoAprovarEEnviar}
          aoRejeitar={aoRejeitar}
          aoGerarDeNovo={aoGerarDeNovo}
        />
      ))}
    </section>
  )
}

function CartaoDaProposta({
  proposta,
  aoAprovarEEnviar,
  aoRejeitar,
  aoGerarDeNovo,
}: Omit<Props, 'propostas'> & { proposta: PropostaDeResposta }) {
  const [texto, setTexto] = useState(proposta.texto)
  const [trabalhando, setTrabalhando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)

  async function executar(acao: () => Promise<{ texto: string; ok: boolean } | null>) {
    setTrabalhando(true)
    setAviso(null)
    try {
      setAviso(await acao())
    } catch (falha) {
      setAviso({ texto: falha instanceof Error ? falha.message : 'Não foi possível concluir agora.', ok: false })
    } finally {
      setTrabalhando(false)
    }
  }

  async function aprovarEEnviar() {
    await executar(async () => {
      const editado = texto.trim() !== proposta.texto.trim()
      const resultado = await aoAprovarEEnviar({
        id: proposta.id,
        revisao: proposta.revisao,
        ...(editado ? { textoEditado: texto.trim() } : {}),
      })
      return resultado.enviada
        ? { texto: 'Resposta enviada.', ok: true }
        : { texto: resultado.mensagem ?? 'A resposta não saiu. Tente de novo em instantes.', ok: false }
    })
  }

  const destinatario = proposta.nomeDoDestinatario
    ? `Para ${proposta.nomeDoDestinatario} · ${proposta.destinatario}`
    : `Para ${proposta.destinatario}`
  const gerar = (rotulo: string) => (
    <Button variant="ghost" disabled={trabalhando} onClick={() => executar(async () => (await aoGerarDeNovo(proposta.id), null))}>
      {rotulo}
    </Button>
  )
  const gerarDeNovo = gerar('Gerar de novo')

  return (
    <article className="flex flex-col gap-2 border-l-2 border-al-line pl-3">
      <span className="text-sm text-al-muted">{destinatario}</span>
      {proposta.mensagemDeOrigem && (
        <blockquote className="border-l border-al-line pl-2 text-sm text-al-muted">{proposta.mensagemDeOrigem}</blockquote>
      )}

      {proposta.status === 'gerando' && <p className="text-sm text-al-muted">O Rhetor está preparando uma resposta…</p>}

      {proposta.status === 'falhou' && proposta.paradaPeloTeto && (
        <>
          <p className="text-sm text-al-muted">{MOTIVO_DA_PARADA[proposta.paradaPeloTeto]}</p>
          <div className="flex gap-2">{gerar('Gerar resposta')}</div>
        </>
      )}

      {proposta.status === 'falhou' && !proposta.paradaPeloTeto && (
        <>
          <p className="text-sm text-al-atencao">
            Não foi possível preparar a resposta. A mensagem do Contato está guardada e a Sequência segue pausada.
          </p>
          <div className="flex gap-2">{gerarDeNovo}</div>
        </>
      )}

      {proposta.status === 'desatualizada' && (
        <>
          <p className="text-sm text-al-atencao">
            Chegou outra mensagem nesta conversa. Gere a resposta de novo antes de aprovar.
          </p>
          <div className="flex gap-2">{gerarDeNovo}</div>
        </>
      )}

      {proposta.status === 'pronta' && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Texto da resposta
            <textarea
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              rows={6}
              className="border border-al-line bg-transparent px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={aprovarEEnviar} disabled={trabalhando || texto.trim().length === 0} className="px-4">
              {trabalhando ? 'Enviando…' : 'Aprovar e enviar'}
            </Button>
            {gerarDeNovo}
            <Button variant="ghost" disabled={trabalhando} onClick={() => executar(async () => (await aoRejeitar(proposta.id), null))}>
              Rejeitar
            </Button>
          </div>
          <span className="text-xs text-al-muted">Enviar não retoma a Sequência: ela continua pausada até você retomar.</span>
        </>
      )}

      {(proposta.status === 'aprovada' || proposta.status === 'enviando') && (
        <p className="text-sm text-al-muted">Aprovada. O envio está em andamento.</p>
      )}
      {proposta.status === 'enviada' && <p className="text-sm text-al-sucesso">Resposta enviada.</p>}
      {proposta.status === 'incerta' && (
        <p className="text-sm text-al-atencao">
          O envio ficou incerto. Confira sua caixa de saída antes de mandar de novo.
        </p>
      )}

      {aviso && (
        <p role="status" className={aviso.ok ? 'text-sm text-al-sucesso' : 'text-sm text-al-atencao'}>
          {aviso.texto}
        </p>
      )}
    </article>
  )
}

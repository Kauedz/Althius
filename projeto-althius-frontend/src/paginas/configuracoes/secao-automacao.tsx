import { useState } from 'react'
import { BOTAO_PRIMARIO } from '@/components/botoes'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import {
  type EscopoDeAutomacao,
  type ModoDeAutomacao,
  type ResumoDoLimite,
  MOTIVO_DO_BLOQUEIO,
} from '@/fonte/automacao-tipos'
import { useDados, useFonteDeAutomacao } from '@/fonte/contexto'
import type { Permissao } from '@/fonte/tipos'
import { catalogoDeIntegracoesDosAgentes } from '@/fonte/catalogo-de-conexoes'
import { cn } from '@/lib/utils'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

const GRUPOS: { tipo: EscopoDeAutomacao['tipo']; titulo: string; descricao: string }[] = [
  { tipo: 'acao', titulo: 'Tipos de ação', descricao: 'Varredura de Sinais, enriquecimento e Execuções de Agentes.' },
  { tipo: 'agente', titulo: 'Agentes', descricao: 'Cada Agente, com as Permissões dele nas Integrações.' },
  { tipo: 'integracao', titulo: 'Integrações', descricao: 'O que cada Integração faz sozinha.' },
  { tipo: 'rotina', titulo: 'Rotinas', descricao: 'Cada Rotina de um Agente tem o teto dela; sem teto aprovado, ela não roda.' },
]

const ROTULO_DA_PERMISSAO: Record<Permissao, string> = { ler: 'Ler', propor: 'Propor', executar: 'Executar' }
const numero = new Intl.NumberFormat('pt-BR')

/**
 * Automação e tetos (creditos-e-planos 03, automacao-e-contrato-inativo): um limite mensal do Workspace, o do
 * contrato, e o interruptor "confirmar ou automático" de cada tipo de ação. Agente, Integração e Rotina continuam com
 * o teto de cada um. Nada automático desses roda sem teto; a página diz por quê. O escopo que ninguém executa sozinho
 * ainda fica travado em confirmar. As Permissões Ler/Propor/Executar dos Agentes aparecem aqui só para leitura.
 */
export function SecaoAutomacao() {
  const fonte = useFonteDeAutomacao()
  const escopos = useDados(fonte, (f) => f.escopos(), [])
  const resumo = useDados(fonte, async (f) => (f.resumoDoLimite ? f.resumoDoLimite() : null), [])
  const workspace = useDados((f) => f.workspace(), [])
  const permissoes = useDados(async (f) => {
    const agentes = await f.agentes()
    const pares = await Promise.all(
      agentes.map(async (a) => [a.id, (await f.personalizacao(a.id).catch(() => null))?.permissoes ?? {}] as const),
    )
    return new Map(pares)
  }, [])
  const administrador = workspace?.papel === 'administrador'

  return (
    <SecaoDeConfiguracoes
      id="automacao"
      titulo="Automação e tetos"
      alcance="workspace"
      descricao="Escolha o que pede confirmação e o que roda sozinho. O limite mensal do Workspace é o do contrato, até os créditos da faixa. Chegou nele, a Automação pausa e avisa os Administradores."
    >
      {!escopos ? (
        <Carregando />
      ) : (
        <>
          {!administrador && <Mensagem tipo="info">Só um Administrador muda o automático e os tetos.</Mensagem>}
          {resumo ? <LimiteDoMes resumo={resumo} administrador={administrador} /> : null}
          {GRUPOS.filter((grupo) => grupo.tipo !== 'rotina' || escopos.some((e) => e.tipo === 'rotina')).map((grupo) => (
            <Bloco key={grupo.tipo} titulo={grupo.titulo} descricao={grupo.descricao}>
              <ul className="flex flex-col divide-y divide-al-line">
                {escopos
                  .filter((e) => e.tipo === grupo.tipo)
                  .map((escopo) => (
                    <LinhaDoEscopo
                      key={escopo.escopo}
                      escopo={escopo}
                      administrador={administrador}
                      limiteDaAcao={escopo.tipo === 'acao' && resumo ? { ilimitado: resumo.ilimitado, limite: resumo.limite } : null}
                      salvar={(modo, teto) => fonte.salvar(escopo.escopo, modo, teto)}
                      permissoes={
                        escopo.tipo === 'agente' ? permissoes?.get(escopo.escopo.slice('agente:'.length)) : undefined
                      }
                    />
                  ))}
              </ul>
            </Bloco>
          ))}
        </>
      )}
    </SecaoDeConfiguracoes>
  )
}

function LimiteDoMes({ resumo, administrador }: { resumo: ResumoDoLimite; administrador: boolean }) {
  const fonte = useFonteDeAutomacao()
  const [texto, setTexto] = useState<string | null>(null)
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  const exibido = texto ?? (resumo.limite === null ? '' : String(resumo.limite))
  const mudou = texto !== null && texto !== (resumo.limite === null ? '' : String(resumo.limite))

  async function enviar() {
    if (!fonte.salvarLimite) return
    setErro(undefined)
    const valor = Number(exibido.trim().replace(',', '.'))
    if (!(valor > 0)) return setErro('O limite precisa ser maior que zero.')
    if (resumo.tetoDaFaixa !== null && valor > resumo.tetoDaFaixa) {
      return setErro('O limite não pode passar dos créditos da faixa.')
    }
    setSalvando(true)
    try {
      await fonte.salvarLimite(valor)
      setTexto(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Bloco titulo="Limite do mês" descricao="Um limite para a varredura, o enriquecimento e as Execuções de Agentes.">
      {resumo.ilimitado ? (
        <p className="text-sm font-medium">Ilimitado</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {numero.format(resumo.uso)} de {numero.format(resumo.limite ?? 0)} créditos usados no mês.
          </p>
          {administrador && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Limite mensal do Workspace"
                inputMode="decimal"
                value={exibido}
                onChange={(e) => setTexto(e.target.value)}
                className="rounded-md h-9 w-36 border border-al-line bg-al-surface px-2 text-sm"
              />
              <button type="button" disabled={!mudou || salvando} onClick={enviar} className={BOTAO_PRIMARIO}>
                Salvar limite
              </button>
              {erro && (
                <p role="alert" className="w-full text-sm text-al-atencao">
                  {erro}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Bloco>
  )
}

function LinhaDoEscopo({
  escopo,
  administrador,
  limiteDaAcao,
  salvar,
  permissoes,
}: {
  escopo: EscopoDeAutomacao
  administrador: boolean
  /** Nos tipos de ação, o teto é o limite do Workspace: a linha só troca Confirmar e Automático. */
  limiteDaAcao: { ilimitado: boolean; limite: number | null } | null
  salvar: (modo: ModoDeAutomacao, teto: number | null) => Promise<void>
  permissoes?: Partial<Record<string, Permissao>>
}) {
  const [modo, setModo] = useState<ModoDeAutomacao>(escopo.modo)
  const [teto, setTeto] = useState(escopo.teto === null ? '' : String(escopo.teto))
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  const semCampoDeTeto = limiteDaAcao !== null
  const mudou = semCampoDeTeto
    ? modo !== escopo.modo
    : modo !== escopo.modo || teto !== (escopo.teto === null ? '' : String(escopo.teto))
  const listaDePermissoes = Object.entries(permissoes ?? {})
    .map(([id, p]) => `${catalogoDeIntegracoesDosAgentes.find((i) => i.id === id)?.nome ?? id}: ${ROTULO_DA_PERMISSAO[p!]}`)

  async function enviar() {
    setErro(undefined)
    const valor = limiteDaAcao
      ? limiteDaAcao.ilimitado
        ? null
        : limiteDaAcao.limite
      : teto.trim() === ''
        ? null
        : Number(teto.replace(',', '.'))
    if (!semCampoDeTeto && valor !== null && !(valor > 0)) return setErro('O teto precisa ser maior que zero.')
    if (modo === 'automatico' && valor === null && !limiteDaAcao?.ilimitado) {
      return setErro('O automático precisa de um teto mensal aprovado.')
    }
    setSalvando(true)
    try {
      await salvar(modo, valor)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <li aria-label={escopo.nome} className="flex flex-wrap items-start justify-between gap-4 py-4">
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <span className="font-medium">{escopo.nome}</span>
        <span className={cn('text-sm', escopo.bloqueio === 'teto_atingido' ? 'text-al-atencao' : 'text-al-muted')}>
          {escopo.bloqueio
            ? MOTIVO_DO_BLOQUEIO[escopo.bloqueio]
            : semCampoDeTeto
              ? 'Roda sozinho, dentro do limite do mês.'
              : `Automático: ${numero.format(escopo.gastoNoMes)} de ${numero.format(escopo.teto ?? 0)} créditos usados no mês.`}
        </span>
        {permissoes && (
          <span className="text-xs text-al-muted">
            Permissões: {listaDePermissoes.length ? listaDePermissoes.join(' · ') : 'nenhuma Integração'}
          </span>
        )}
      </div>
      {administrador && escopo.bloqueio !== 'sem_executor' ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Modo de ${escopo.nome}`}
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoDeAutomacao)}
            className="rounded-md h-9 border border-al-line bg-al-surface px-2 text-sm"
          >
            <option value="confirmar">Confirmar</option>
            <option value="automatico">Automático</option>
          </select>
          {!semCampoDeTeto && (
            <input
              aria-label={`Teto mensal de ${escopo.nome}`}
              inputMode="decimal"
              placeholder="Teto (créditos)"
              value={teto}
              onChange={(e) => setTeto(e.target.value)}
              className="rounded-md h-9 w-36 border border-al-line bg-al-surface px-2 text-sm"
            />
          )}
          <button type="button" disabled={!mudou || salvando} onClick={enviar} className={BOTAO_PRIMARIO}>
            Salvar
          </button>
          {erro && (
            <p role="alert" className="w-full text-sm text-al-atencao">
              {erro}
            </p>
          )}
        </div>
      ) : (
        <span className="selo">{escopo.modo === 'automatico' ? 'Automático' : 'Confirmar'}</span>
      )}
    </li>
  )
}

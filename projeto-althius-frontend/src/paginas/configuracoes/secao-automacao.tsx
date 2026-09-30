import { useState } from 'react'
import { BOTAO_PRIMARIO } from '@/components/botoes'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import {
  type EscopoDeAutomacao,
  type ModoDeAutomacao,
  MOTIVO_DO_BLOQUEIO,
} from '@/fonte/automacao-tipos'
import { useDados, useFonteDeAutomacao } from '@/fonte/contexto'
import type { Permissao } from '@/fonte/tipos'
import { catalogoDeIntegracoes } from '@/fonte/catalogo-de-conexoes'
import { cn } from '@/lib/utils'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

const GRUPOS: { tipo: EscopoDeAutomacao['tipo']; titulo: string; descricao: string }[] = [
  { tipo: 'acao', titulo: 'Tipos de ação', descricao: 'Varredura de Sinais, enriquecimento e Execuções de Agentes.' },
  { tipo: 'agente', titulo: 'Agentes', descricao: 'Cada Agente, com as Permissões dele nas Integrações.' },
  { tipo: 'integracao', titulo: 'Integrações', descricao: 'O que cada Integração faz sozinha.' },
]

const ROTULO_DA_PERMISSAO: Record<Permissao, string> = { ler: 'Ler', propor: 'Propor', executar: 'Executar' }
const numero = new Intl.NumberFormat('pt-BR')

/**
 * Automação e tetos (creditos-e-planos 03): numa página só, o interruptor "confirmar ou automático" de cada tipo de
 * ação, Agente e Integração, e o teto mensal em créditos de cada automático. Nada automático roda sem teto; a página
 * diz por quê. As Permissões Ler/Propor/Executar dos Agentes aparecem aqui só para leitura, lidas da configuração do
 * Agente, onde elas se mudam.
 */
export function SecaoAutomacao() {
  const fonte = useFonteDeAutomacao()
  const escopos = useDados(fonte, (f) => f.escopos(), [])
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
      descricao="Escolha o que pede confirmação e o que roda sozinho. Nada automático roda sem um teto mensal aprovado; chegou no teto, pausa e avisa os Administradores."
    >
      {!escopos ? (
        <Carregando />
      ) : (
        <>
          {!administrador && <Mensagem tipo="info">Só um Administrador muda o automático e os tetos.</Mensagem>}
          {GRUPOS.map((grupo) => (
            <Bloco key={grupo.tipo} titulo={grupo.titulo} descricao={grupo.descricao}>
              <ul className="flex flex-col divide-y divide-al-line">
                {escopos
                  .filter((e) => e.tipo === grupo.tipo)
                  .map((escopo) => (
                    <LinhaDoEscopo
                      key={escopo.escopo}
                      escopo={escopo}
                      administrador={administrador}
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

function LinhaDoEscopo({
  escopo,
  administrador,
  salvar,
  permissoes,
}: {
  escopo: EscopoDeAutomacao
  administrador: boolean
  salvar: (modo: ModoDeAutomacao, teto: number | null) => Promise<void>
  permissoes?: Partial<Record<string, Permissao>>
}) {
  const [modo, setModo] = useState<ModoDeAutomacao>(escopo.modo)
  const [teto, setTeto] = useState(escopo.teto === null ? '' : String(escopo.teto))
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)
  const mudou = modo !== escopo.modo || teto !== (escopo.teto === null ? '' : String(escopo.teto))
  const listaDePermissoes = Object.entries(permissoes ?? {})
    .map(([id, p]) => `${catalogoDeIntegracoes.find((i) => i.id === id)?.nome ?? id}: ${ROTULO_DA_PERMISSAO[p!]}`)

  async function enviar() {
    setErro(undefined)
    const valor = teto.trim() === '' ? null : Number(teto.replace(',', '.'))
    if (valor !== null && !(valor > 0)) return setErro('O teto precisa ser maior que zero.')
    if (modo === 'automatico' && valor === null) return setErro('O automático precisa de um teto mensal aprovado.')
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
            : `Automático: ${numero.format(escopo.gastoNoMes)} de ${numero.format(escopo.teto ?? 0)} créditos usados no mês.`}
        </span>
        {permissoes && (
          <span className="text-xs text-al-muted">
            Permissões: {listaDePermissoes.length ? listaDePermissoes.join(' · ') : 'nenhuma Integração'}
          </span>
        )}
      </div>
      {administrador ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Modo de ${escopo.nome}`}
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoDeAutomacao)}
            className="h-9 border border-al-line bg-al-surface px-2 text-sm"
          >
            <option value="confirmar">Confirmar</option>
            <option value="automatico">Automático</option>
          </select>
          <input
            aria-label={`Teto mensal de ${escopo.nome}`}
            inputMode="decimal"
            placeholder="Teto (créditos)"
            value={teto}
            onChange={(e) => setTeto(e.target.value)}
            className="h-9 w-36 border border-al-line bg-al-surface px-2 text-sm"
          />
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

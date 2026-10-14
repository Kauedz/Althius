import { useId, type ReactNode } from 'react'
import { BOTAO_PRIMARIO } from '@/components/botoes'
import { Carregando, IconeDaEspecialidade } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { useDados } from '@/fonte/contexto'
import { formatarPeriodoIsoPorExtenso } from '@/fonte/formatar-data'
import { textoDoSaldo } from '@/fonte/creditos'
import type { PlanoDoWorkspace, UsoDoWorkspace } from '@/fonte/tipos'
import { ERRO_SEM_PARTICIPACAO } from '@/fonte/regras'
import { cn } from '@/lib/utils'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

const numero = new Intl.NumberFormat('pt-BR')

/**
 * Plano: a situação do Workspace na Althius, a mesma para todos os Participantes. Mostra o plano atual, os
 * Participantes ativos e as Execuções de Agentes no período, sem preço, franquia nem limite; o upgrade ainda não existe.
 */
export function SecaoPlano() {
  const plano = useDados((fonte) => fonte.plano(), [])

  return (
    <SecaoDeConfiguracoes
      id="plano"
      titulo="Plano"
      alcance="workspace"
      descricao="A situação do Workspace na Althius. Os números abaixo são demonstrativos."
    >
      {!plano ? (
        <Carregando />
      ) : (
        <>
          <PlanoAtual plano={plano} />
          {plano.uso ? (
            <Uso uso={plano.uso} />
          ) : (
            <Mensagem tipo="info">{ERRO_SEM_PARTICIPACAO} O uso aparece só para quem participa.</Mensagem>
          )}
        </>
      )}
    </SecaoDeConfiguracoes>
  )
}

/** O upgrade fica visível e focável, mas não leva a lugar nenhum: a contratação ainda não está disponível. */
function PlanoAtual({ plano }: { plano: PlanoDoWorkspace }) {
  return (
    <section aria-label="Plano atual" className="cartao flex items-center justify-between gap-6 p-6">
      <div className="flex flex-col gap-1">
        <span className="rotulo">Plano atual</span>
        <span className="titulo-secao text-3xl">{plano.nome}</span>
        <span className="text-sm text-al-muted">
          Vale para todo o Workspace {plano.nomeDoWorkspace}. Preços, franquias e limites aparecem aqui quando estiverem
          definidos.
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="upgrade-em-breve"
          className={cn(BOTAO_PRIMARIO, 'cursor-not-allowed opacity-50 hover:border-al-accent hover:bg-al-accent')}
        >
          Fazer upgrade
        </button>
        <span id="upgrade-em-breve" className="selo">
          Em breve
        </span>
      </div>
    </section>
  )
}

function Uso({ uso }: { uso: UsoDoWorkspace }) {
  const { participantes, convitesPendentes, execucoes } = uso

  return (
    <Bloco
      titulo="Uso do Workspace"
      descricao="Uma Execução é cada vez que um Agente foi acionado e entregou um resultado. Decidir uma Aprovação não conta como Execução nova."
    >
      <div className="grid grid-cols-2 gap-6">
        <Indicador rotulo="Participantes ativos" valor={participantes}>
          {convitesPendentes === 0
            ? 'Nenhum convite pendente'
            : `${convitesPendentes} ${convitesPendentes === 1 ? 'convite pendente' : 'convites pendentes'}, fora da contagem`}
        </Indicador>
        <Indicador rotulo="Execuções de Agentes" valor={execucoes.total}>
          Período: {formatarPeriodoIsoPorExtenso(execucoes.inicio, execucoes.fim)}
        </Indicador>
      </div>
      <table aria-label="Execuções por Especialidade no período" className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-al-line">
            <th className="rotulo py-2 font-normal">Especialidade</th>
            <th className="rotulo py-2 text-right font-normal">Execuções no período</th>
          </tr>
        </thead>
        <tbody>
          {execucoes.porEspecialidade.map(({ especialidadeId, nome, total }) => (
            <tr key={especialidadeId} className="border-b border-al-line last:border-b-0">
              <td className="py-2.5">
                <span className="flex items-center gap-3 font-normal">
                  <IconeDaEspecialidade especialidade={especialidadeId} className="text-al-muted" />
                  {nome}
                </span>
              </td>
              <td className="py-2.5 text-right tabular-nums">{numero.format(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bloco>
  )
}

function Indicador({ rotulo, valor, children }: { rotulo: string; valor: number; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="rounded-2xl flex flex-col gap-1 border border-al-line p-5">
      <span id={id} className="rotulo">
        {rotulo}
      </span>
      <span className="titulo-display text-5xl tabular-nums">{numero.format(valor)}</span>
      <span className="text-sm text-al-muted">{children}</span>
    </div>
  )
}

const ROTULO_DO_ESTADO: Record<string, string> = {
  ativo: 'Contrato ativo',
  suspenso: 'Contrato suspenso',
  encerrado: 'Contrato encerrado',
}

/**
 * Plano no Workspace operacional (acesso-e-planos): o contrato com a Althius, cobrado fora da plataforma. Mostra o estado
 * do contrato, a faixa, o saldo de créditos, o limite mensal e o uso do mês, tudo em créditos. Não há checkout nem portal:
 * mudar de faixa, ampliar usuários ou renovar é com a equipe Althius. Os números de exemplo ficam só na Demonstração.
 */
export function SecaoPlanoDoWorkspaceOperacional() {
  const saldo = useDados((fonte) => (fonte.saldoDeCreditos ? fonte.saldoDeCreditos() : Promise.resolve(null)), [])
  const contrato = useDados((fonte) => (fonte.contratoDoWorkspace ? fonte.contratoDoWorkspace() : Promise.resolve(null)), [])

  return (
    <SecaoDeConfiguracoes id="plano" titulo="Plano" alcance="workspace" descricao="A situação do Workspace na Althius.">
      {contrato === undefined ? (
        <Carregando />
      ) : contrato === null ? (
        <div role="status" className="rounded-2xl flex max-w-2xl flex-col items-start gap-2 border border-dashed border-al-line px-5 py-4">
          <span className="selo">Sem contrato ativo</span>
          <p className="text-al-ink">Este Workspace ainda não tem um contrato ativo na Althius.</p>
          <p className="text-sm text-al-muted">Fale com a equipe Althius para contratar ou retomar o acesso.</p>
        </div>
      ) : (
        <section aria-label="Contrato" className="cartao flex max-w-3xl flex-col gap-5 p-6">
          <div className="flex flex-col gap-1">
            <span className="selo self-start">{ROTULO_DO_ESTADO[contrato.estado] ?? contrato.estado}</span>
            <span className="titulo-secao text-3xl">{contrato.faixa}</span>
            <span className="text-sm text-al-muted">
              Cobrado fora da plataforma. Para ampliar usuários ou mudar de faixa, fale com a equipe Althius.
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <DadoDoContrato rotulo="Saldo de créditos" valor={saldo ? textoDoSaldo(saldo) : '—'} comoStatus />
            <DadoDoContrato
              rotulo="Limite mensal"
              valor={contrato.ilimitado ? 'Sem limite' : `${numero.format(contrato.limiteMensal)} créditos`}
            />
            <DadoDoContrato
              rotulo="Uso do mês"
              valor={`${numero.format(contrato.usoDoMes)} ${contrato.usoDoMes === 1 ? 'crédito' : 'créditos'}`}
            />
            <DadoDoContrato
              rotulo="Usuários"
              valor={contrato.ilimitado || contrato.maximoDeUsuarios === null ? `${contrato.usuariosAtivos}` : `${contrato.usuariosAtivos} de ${contrato.maximoDeUsuarios}`}
            />
          </dl>
        </section>
      )}
      {contrato === null && saldo && (
        <div role="status" aria-label="Saldo de créditos" className="flex max-w-2xl flex-col gap-1">
          <span className="rotulo">Saldo de créditos</span>
          <span className="titulo-secao text-3xl">{textoDoSaldo(saldo)}</span>
        </div>
      )}
    </SecaoDeConfiguracoes>
  )
}

function DadoDoContrato({ rotulo, valor, comoStatus = false }: { rotulo: string; valor: string; comoStatus?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border border-al-line p-4" {...(comoStatus ? { role: 'status', 'aria-label': rotulo } : {})}>
      <dt className="rotulo">{rotulo}</dt>
      <dd className="titulo-secao text-2xl tabular-nums">{valor}</dd>
    </div>
  )
}

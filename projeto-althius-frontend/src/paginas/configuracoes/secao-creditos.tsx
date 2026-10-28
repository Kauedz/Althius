import { useState } from 'react'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { useDados } from '@/fonte/contexto'
import { nomeDaAcao, nomeDoLancamento } from '@/fonte/creditos'
import type { LancamentoDeCredito, PrecoDeCredito, SaldoDeCreditos } from '@/fonte/tipos'
import { Bloco, SecaoDeConfiguracoes } from './componentes'

/**
 * Créditos claros (Fase 8): o saldo do Workspace, o preço de cada ação, o extrato por ação e por Sinal e como obter
 * mais. Tudo em créditos: nenhum valor em moeda chega ao cliente. O Workspace interno da equipe Althius aparece como
 * "Ilimitado (interno)", e o uso dele continua no extrato.
 */
export function SecaoCreditos() {
  const saldo = useDados((fonte) => fonte.saldoDeCreditos?.() ?? Promise.resolve(null), [])
  const precos = useDados((fonte) => fonte.precosDeCreditos?.() ?? Promise.resolve([]), [])
  const extrato = useDados((fonte) => fonte.extratoDeCreditos?.() ?? Promise.resolve([]), [])
  if (saldo === undefined || precos === undefined || extrato === undefined) return <Carregando />

  return (
    <SecaoDeConfiguracoes
      id="creditos"
      titulo="Créditos"
      alcance="workspace"
      descricao="O saldo, o preço de cada ação e o extrato de uso deste Workspace."
    >
      <CartaoDeSaldo saldo={saldo} />
      <TabelaDePrecos precos={precos} />
      <Extrato lancamentos={extrato} />
      <Bloco titulo="Como obter mais créditos">
        <p>Os créditos são lançados pela equipe Althius conforme o contrato do Workspace.</p>
        <p className="text-sm text-al-muted">Para ampliar o contrato ou lançar mais créditos, fale com a equipe Althius.</p>
      </Bloco>
    </SecaoDeConfiguracoes>
  )
}

const NUMERO = new Intl.NumberFormat('pt-BR')
const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })

/** O catálogo é texto do banco: uma descrição que fale de moeda ou de limite interno não chega à tela. */
const TEXTO_INTERNO = /US\$|\bUSD\b|d[oó]lar|\bTeto\b/i

export function CartaoDeSaldo({ saldo }: { saldo: SaldoDeCreditos | null }) {
  if (!saldo) return <Mensagem tipo="info">Não foi possível ler o saldo agora.</Mensagem>
  if (saldo.ilimitado) {
    return (
      <div className="cartao flex flex-col gap-1 p-5">
        <span className="rotulo">Disponível</span>
        <strong className="titulo-display text-3xl">Ilimitado (interno)</strong>
        <p className="mt-2 text-sm text-al-muted">Workspace interno da equipe Althius: o uso continua no extrato.</p>
      </div>
    )
  }
  const cartoes: [string, number][] = [
    ['Disponível', saldo.disponivel],
    ['Reservado', saldo.reservado],
    ['Lançado', saldo.lancado],
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cartoes.map(([rotulo, valor]) => (
        <div className="cartao flex flex-col gap-1 p-5" key={rotulo}>
          <span className="rotulo">{rotulo}</span>
          <strong className="titulo-display text-3xl tabular-nums">{NUMERO.format(valor)}</strong>
          <span className="text-sm text-al-muted">créditos</span>
        </div>
      ))}
    </div>
  )
}

export function TabelaDePrecos({ precos }: { precos: PrecoDeCredito[] }) {
  return (
    <Bloco titulo="Preço por ação" descricao="Quanto cada ação desconta do saldo, em créditos.">
      {precos.length === 0 ? (
        <p className="text-sm text-al-muted">Nenhum preço disponível.</p>
      ) : (
        <table aria-label="Preço por ação" className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-al-line text-xs tracking-rotulo uppercase text-al-muted">
              <th className="py-2 font-normal">Ação</th>
              <th className="py-2 text-right font-normal">Créditos</th>
            </tr>
          </thead>
          <tbody>
            {precos.map((preco) => (
              <tr className="border-b border-al-line" key={preco.acao}>
                <td className="py-3">
                  <div className="text-al-ink">{nomeDaAcao(preco.acao)}</div>
                  {preco.descricao && !TEXTO_INTERNO.test(preco.descricao) && (
                    <div className="text-xs text-al-muted">{preco.descricao}</div>
                  )}
                </td>
                <td className="py-3 text-right tabular-nums">{NUMERO.format(preco.creditos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Bloco>
  )
}

export function Extrato({ lancamentos }: { lancamentos: LancamentoDeCredito[] }) {
  const [acao, setAcao] = useState('todas')
  const [sinal, setSinal] = useState('todos')
  const acoes = [...new Set(lancamentos.map((l) => l.acao).filter((a): a is string => !!a))]
  const sinais = [...new Set(lancamentos.map((l) => l.sinal).filter((s): s is string => !!s))]
  const visiveis = lancamentos.filter(
    (l) => (acao === 'todas' || l.acao === acao) && (sinal === 'todos' || l.sinal === sinal),
  )
  const porSinal = resumoDoUso(lancamentos, (l) => l.sinal)
  const porAcao = resumoDoUso(lancamentos, (l) => l.acao)

  const filtros = (
    <>
      <select aria-label="Filtrar por ação" className="campo" value={acao} onChange={(e) => setAcao(e.target.value)}>
        <option value="todas">Todas as ações</option>
        {acoes.map((a) => (
          <option key={a} value={a}>
            {nomeDaAcao(a)}
          </option>
        ))}
      </select>
      {sinais.length > 0 && (
        <select aria-label="Filtrar por Sinal" className="campo" value={sinal} onChange={(e) => setSinal(e.target.value)}>
          <option value="todos">Todos os Sinais</option>
          {sinais.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
    </>
  )

  return (
    <Bloco titulo="Extrato" descricao="Entradas do contrato e o uso de cada ação." acoes={lancamentos.length > 0 ? filtros : undefined}>
      {lancamentos.length === 0 ? (
        <p className="text-sm text-al-muted">Nenhum lançamento ainda.</p>
      ) : (
        <>
          {porSinal.length > 0 && <ResumoDeUso titulo="Uso por Sinal" itens={porSinal} nome={String} />}
          {porAcao.length > 0 && <ResumoDeUso titulo="Uso por ação" itens={porAcao} nome={nomeDaAcao} />}
          <table aria-label="Extrato de créditos" className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-al-line text-xs tracking-rotulo uppercase text-al-muted">
                <th className="py-2 font-normal">Data</th>
                <th className="py-2 font-normal">Ação</th>
                <th className="py-2 font-normal">Sinal</th>
                <th className="py-2 text-right font-normal">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr className="border-b border-al-line" key={l.id}>
                  <td className="py-3 tabular-nums">{DATA.format(new Date(l.criadoEm))}</td>
                  <td className="py-3">{nomeDoLancamento(l)}</td>
                  <td className="py-3 text-al-muted">{l.sinal ?? '—'}</td>
                  <td className="py-3 text-right tabular-nums">
                    {l.creditos > 0 ? '+' : ''}
                    {NUMERO.format(l.creditos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Bloco>
  )
}

type ItemDeUso = { chave: string; creditos: number; acoes: number }

function resumoDoUso(lancamentos: LancamentoDeCredito[], chave: (l: LancamentoDeCredito) => string | null): ItemDeUso[] {
  const itens = new Map<string, ItemDeUso>()
  for (const lancamento of lancamentos) {
    const nome = chave(lancamento)
    if (!nome || lancamento.creditos >= 0) continue
    const item = itens.get(nome) ?? { chave: nome, creditos: 0, acoes: 0 }
    item.creditos += Math.abs(lancamento.creditos)
    item.acoes += 1
    itens.set(nome, item)
  }
  return [...itens.values()].sort((a, b) => b.creditos - a.creditos || b.acoes - a.acoes || a.chave.localeCompare(b.chave))
}

function ResumoDeUso({ titulo, itens, nome }: { titulo: string; itens: ItemDeUso[]; nome: (chave: string) => string }) {
  return (
    <section aria-label={titulo} className="mb-5 rounded border border-al-line p-4">
      <h3 className="mb-3 text-sm font-medium">{titulo}</h3>
      <ul className="space-y-2 text-sm">
        {itens.map((item) => (
          <li className="flex items-baseline justify-between gap-4" key={item.chave}>
            <span>{nome(item.chave)}</span>
            <span className="text-al-muted tabular-nums">{NUMERO.format(item.creditos)} {item.creditos === 1 ? 'crédito' : 'créditos'} · {item.acoes} {item.acoes === 1 ? 'ação' : 'ações'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

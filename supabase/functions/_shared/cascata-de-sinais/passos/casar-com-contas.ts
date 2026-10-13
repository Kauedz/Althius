// O casamento: a empresa que abriu vaga só vira Sinal se for uma Conta-alvo do Workspace (página do LinkedIn, site ou
// nome sem a forma jurídica; na dúvida, não é: um Sinal de outra empresa é pior que um Sinal perdido). Regra interna,
// sem custo. Cada vaga confirmada vira um Sinal da Conta, com a mesma chave de acontecimento dos Sinais de vaga de
// sempre (empresa + cargo + ano). As empresas que não são Conta ficam só na contagem (e nos nomes, para o Hermes dizer).
import { mesmaEmpresa } from '../../../signal-runner/adaptadores/comum.ts'
import { sinalDaVaga } from '../../../signal-runner/adaptadores/vagas.ts'
import type { ImplDoPasso, Item } from '../tipos.ts'
import { candidataDoItem, cnpjLimpo } from './comum.ts'

export const casarComContas: ImplDoPasso = {
  executar(entrada, ctx) {
    const sinais = new Map<string, Item>()
    const semConta: string[] = []
    for (const item of entrada) {
      const c = candidataDoItem(item)
      if (!c) continue
      const conta = ctx.contas.find((x) => mesmaEmpresa(x, c.empresa))
      if (!conta) {
        semConta.push(c.empresa.nome)
        continue
      }
      for (const vaga of c.vagas) {
        const s = sinalDaVaga(vaga, conta, vaga.fonte, ctx.agora)
        if (sinais.has(s.eventKey)) continue
        sinais.set(s.eventKey, {
          contaId: conta.id,
          contaNome: conta.name,
          eventKey: s.eventKey,
          phrase: s.phrase,
          firedAt: s.firedAt,
          source: s.source ?? vaga.fonte,
          evidence: s.evidence ?? '',
          // Só para o passo da Receita: o CNPJ da Conta. Não vai para o Sinal.
          cnpjDaConta: cnpjLimpo(conta.cnpj),
        })
      }
    }
    ctx.memoria.set('semConta', semConta.length)
    ctx.memoria.set('semContaNomes', semConta.slice(0, 10))
    return [...sinais.values()]
  },
}

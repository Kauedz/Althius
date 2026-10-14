// O casamento: a empresa que abriu vaga só vira Sinal se for uma Conta-alvo do Workspace (página do LinkedIn, site ou
// nome sem a forma jurídica; na dúvida, não é: um Sinal de outra empresa é pior que um Sinal perdido). Regra interna,
// sem custo. Cada vaga confirmada vira um Sinal da Conta, com a mesma chave de acontecimento dos Sinais de vaga de
// sempre (empresa + cargo + ano). As empresas que não são Conta ficam na contagem (e nos nomes, para o Hermes dizer) e, com
// site, vão à memória da execução como Sinais de empresa: o motor os entrega ao banco, que os leva a uma Conta (por domínio)
// ou à candidata da Caixa de Descobertas.
import { mesmaEmpresa } from '../../../signal-runner/adaptadores/comum.ts'
import { sinalDaVaga } from '../../../signal-runner/adaptadores/vagas.ts'
import type { ImplDoPasso, Item } from '../tipos.ts'
import { candidataDoItem, cnpjLimpo, guardarSinalDeEmpresa } from './comum.ts'
import { lembrarAmostra } from './empresas.ts'

export const casarComContas: ImplDoPasso = {
  executar(entrada, ctx) {
    const sinais = new Map<string, Item>()
    const semConta: string[] = []
    const fora: { cnpj: null; nome: string }[] = []
    for (const item of entrada) {
      const c = candidataDoItem(item)
      if (!c) continue
      const conta = ctx.contas.find((x) => mesmaEmpresa(x, c.empresa))
      if (!conta) {
        semConta.push(c.empresa.nome)
        fora.push({ cnpj: null, nome: c.empresa.nome })
        const virtual = { id: '', name: c.empresa.nome, domain: null, linkedinUrl: null }
        for (const vaga of c.vagas) {
          const s = sinalDaVaga(vaga, virtual, vaga.fonte, ctx.agora)
          guardarSinalDeEmpresa(ctx.memoria, {
            empresa: { nome: c.empresa.nome, ...(c.empresa.site ? { site: c.empresa.site } : {}), ...(c.empresa.linkedinUrl ? { linkedinUrl: c.empresa.linkedinUrl } : {}) },
            eventKey: s.eventKey,
            phrase: s.phrase,
            firedAt: s.firedAt,
            source: s.source ?? vaga.fonte,
            evidence: s.evidence ?? '',
          })
        }
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
    lembrarAmostra(ctx, fora)
    return [...sinais.values()]
  },
}

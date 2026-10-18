// As variáveis de personalização do passo, com os mesmos nomes e valores que o banco usa no envio
// (private.step_variable_value). Uma variável sem valor (ou desconhecida) segura o passo de E-mail no envio; a
// pré-visualização a mostra destacada para o Vendedor ver antes.

export interface DadosDasVariaveis {
  conta?: { nome?: string | null; segmento?: string | null; dominio?: string | null; sinal?: string | null }
  contato?: { nome?: string | null; cargo?: string | null; email?: string | null; persona?: string | null }
  remetente?: { nome?: string | null }
}

const VARIAVEL = /\{\{\s*([\w.]+)\s*\}\}/g

export function valorDaVariavel(nome: string, dados: DadosDasVariaveis): string | null {
  const nomeCompleto = (dados.contato?.nome ?? '').trim()
  const espaco = nomeCompleto.indexOf(' ')
  const primeiroNome = nomeCompleto.split(/\s+/)[0] ?? ''
  const sobrenome = espaco > 0 ? nomeCompleto.slice(espaco + 1) : ''
  const mapa: Record<string, string | null | undefined> = {
    primeiro_nome: primeiroNome,
    'contato.primeiro_nome': primeiroNome,
    nome: nomeCompleto,
    'contato.nome': nomeCompleto,
    sobrenome,
    'contato.sobrenome': sobrenome,
    cargo: dados.contato?.cargo,
    'contato.cargo': dados.contato?.cargo,
    email: dados.contato?.email,
    'contato.email': dados.contato?.email,
    empresa: dados.conta?.nome,
    'conta.nome': dados.conta?.nome,
    segmento: dados.conta?.segmento,
    'conta.segmento': dados.conta?.segmento,
    dominio: dados.conta?.dominio,
    'conta.dominio': dados.conta?.dominio,
    'remetente.nome': dados.remetente?.nome,
    remetente: dados.remetente?.nome,
    // Só a pré-visualização da Demonstração tem Sinal e Persona; no envio real elas ainda seguram o passo.
    'conta.sinal': dados.conta?.sinal,
    persona: dados.contato?.persona,
  }
  const valor = mapa[nome.toLowerCase()]?.trim()
  return valor ? valor : null
}

/** As variáveis do texto que ficariam sem valor, sem repetição, na ordem em que aparecem. */
export function variaveisSemValor(texto: string, dados: DadosDasVariaveis): string[] {
  const faltando: string[] = []
  for (const [, nome] of texto.matchAll(VARIAVEL)) {
    const chave = nome.toLowerCase()
    if (!valorDaVariavel(chave, dados) && !faltando.includes(chave)) faltando.push(chave)
  }
  return faltando
}

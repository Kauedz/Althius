// O catálogo fixo de Especialidades da Althius (ADR 0005). O Cliente não cria Especialidades:
// cria Agentes a partir delas.
import type { Especialidade, EspecialidadeId } from './tipos'

export const especialidades: Especialidade[] = [
  {
    id: 'scopus',
    nome: 'Scopus',
    rotulo: 'Especialista em ICP',
    descricao: 'Define o ICP a partir dos seus melhores clientes e dá nota de aderência a cada Conta-alvo.',
    entrega: 'ICP e aderência de Contas-alvo',
    ferramentasNativas: [],
    integracoesPadrao: ['hubspot', 'clay', 'apollo', 'lusha'],
    sugestoes: [
      { id: 'scopus-aderencia', texto: 'Pontue a aderência da OpenAI ao nosso ICP' },
      { id: 'scopus-revisar-icp', texto: 'Revise nosso ICP com os clientes que fecharam em 2026' },
      { id: 'colaboracao-openai', texto: 'Monte a abordagem completa para a OpenAI' },
    ],
  },
  {
    id: 'ethos',
    nome: 'Ethos',
    rotulo: 'Especialista em Persona',
    descricao: 'Descreve dores, objeções e gatilhos de cada papel do Comitê de compra.',
    entrega: 'Personas do Comitê de compra',
    ferramentasNativas: [],
    integracoesPadrao: ['hubspot', 'apollo', 'lusha', 'notion'],
    sugestoes: [
      { id: 'ethos-comite-stripe', texto: 'Monte as personas do Comitê de compra da Stripe' },
      { id: 'ethos-objecoes-cfo', texto: 'Quais objeções um CFO levanta contra a Databricks?' },
    ],
  },
  {
    id: 'rhetor',
    nome: 'Rhetor',
    rotulo: 'Especialista em escrita persuasiva',
    descricao: 'Escreve e-mails, sequências, posts e copy no tom da marca, para cada persona.',
    entrega: 'E-mails, sequências e copy',
    ferramentasNativas: [],
    integracoesPadrao: ['hubspot', 'notion', 'meta-ads', 'google-ads'],
    sugestoes: [
      { id: 'rhetor-email-meta', texto: 'Escreva um e-mail frio para a Head de Dados da Meta' },
      { id: 'rhetor-sequencia', texto: 'Crie uma sequência de 4 toques para VPs de Engenharia' },
    ],
  },
  {
    id: 'oraculum',
    nome: 'Oraculum',
    rotulo: 'Especialista em GEO',
    descricao: 'Mede como a marca aparece no ChatGPT, Perplexity, Gemini e Claude e recomenda o que publicar para ser citada.',
    entrega: 'Presença da marca nos LLMs',
    ferramentasNativas: ['Busca no ChatGPT, Perplexity, Gemini e Claude'],
    integracoesPadrao: ['notion', 'google-ads'],
    sugestoes: [
      { id: 'oraculum-auditoria', texto: 'Audite nossa presença para "melhor plataforma de dados para IA"' },
      { id: 'oraculum-conteudo', texto: 'Que conteúdo publicar para ser citado no Perplexity?' },
    ],
  },
]

export function especialidade(id: EspecialidadeId): Especialidade {
  const encontrada = especialidades.find((e) => e.id === id)
  if (!encontrada) throw new Error(`Especialidade desconhecida: ${id}`)
  return encontrada
}

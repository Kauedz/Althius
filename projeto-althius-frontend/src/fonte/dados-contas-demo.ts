import type { ContaAlvo, Contato, Interacao, Sinal } from './contas-tipos'

function deslocarDias(hoje: Date, dias: number): string {
  const d = new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000)
  return d.toISOString()
}

export interface DadosContasIniciais {
  contas: ContaAlvo[]
  contatos: Contato[]
  sinais: Sinal[]
  interacoes: Interacao[]
}

/**
 * Cria o conjunto inicial de dados da demo do ticket 03,
 * com datas calculadas a partir de uma data de referência (hoje).
 */
export function criarDadosIniciais(hoje: Date): DadosContasIniciais {
  const sinais: Sinal[] = [
    {
      id: 'sinal-openai-1',
      contaId: 'openai',
      frase: 'Abriu 3 vagas de engenharia de dados de avaliação',
      data: deslocarDias(hoje, -2),
      fonte: 'Vaga no LinkedIn',
      detectadoPor: 'Scopus',
    },
    {
      id: 'sinal-stripe-1',
      contaId: 'stripe',
      frase: 'Lançamento de suporte a pagamentos de agentes',
      data: deslocarDias(hoje, -10),
      fonte: 'Blog da engenharia',
      detectadoPor: 'Scopus',
    },
    {
      id: 'sinal-anthropic-1',
      contaId: 'anthropic',
      frase: 'Anúncio de novas ferramentas para empresas',
      data: deslocarDias(hoje, -20),
      fonte: 'Comunicado à imprensa',
    },
    {
      id: 'sinal-bbva-1',
      contaId: 'bbva-mexico',
      frase: 'Expansão da equipe de inovação digital',
      data: deslocarDias(hoje, -15),
      fonte: 'Notícia de mercado',
    },
  ]

  const contatos: Contato[] = [
    {
      id: 'contato-openai-1',
      contaId: 'openai',
      nome: 'Sarah Chen',
      cargo: 'Head of Evaluation Engineering',
      area: 'Engenharia',
      persona: 'Decisora técnica',
      canais: { email: true, telefone: false, linkedin: true },
      ultimoContatoEm: deslocarDias(hoje, -5),
    },
    {
      id: 'contato-openai-2',
      contaId: 'openai',
      nome: 'Marcus Vance',
      cargo: 'Staff Research Engineer',
      area: 'Engenharia',
      canais: { email: true, telefone: false, linkedin: true },
    },
    {
      id: 'contato-openai-3',
      contaId: 'openai',
      nome: 'Elena Rostova',
      cargo: 'Product Lead - API',
      area: 'Produto',
      canais: { email: true, telefone: true, linkedin: true },
    },
    {
      id: 'contato-stripe-1',
      contaId: 'stripe',
      nome: 'David Kim',
      cargo: 'VP of Product',
      area: 'Produto',
      persona: 'Comitê executivo',
      canais: { email: true, telefone: false, linkedin: true },
      ultimoContatoEm: deslocarDias(hoje, -1),
    },
    {
      id: 'contato-stripe-2',
      contaId: 'stripe',
      nome: 'Rachel Green',
      cargo: 'Director of Business Development',
      area: 'Parcerias',
      canais: { email: true, telefone: true, linkedin: false },
    },
    {
      id: 'contato-anthropic-1',
      contaId: 'anthropic',
      nome: 'Alex Rivera',
      cargo: 'Enterprise Sales Director',
      area: 'Vendas',
      canais: { email: true, telefone: false, linkedin: true },
      ultimoContatoEm: deslocarDias(hoje, -45),
    },
    {
      id: 'contato-bbva-1',
      contaId: 'bbva-mexico',
      nome: 'Carlos Mendoza',
      cargo: 'Director de Innovación Digital',
      area: 'Inovação',
      canais: { email: true, telefone: true, linkedin: true },
    },
    {
      id: 'contato-bbva-2',
      contaId: 'bbva-mexico',
      nome: 'Sofia Ortiz',
      cargo: 'Líder de Arquitectura Cloud',
      area: 'Tecnologia',
      canais: { email: true, telefone: false, linkedin: false },
    },
  ]

  const interacoes: Interacao[] = [
    {
      id: 'interacao-stripe-1',
      contaId: 'stripe',
      contatoId: 'contato-stripe-1',
      tipo: 'mensagem-enviada',
      data: deslocarDias(hoje, -1),
      participanteCliente: 'Marina',
      origem: 'Althius',
    },
    {
      id: 'interacao-openai-1',
      contaId: 'openai',
      contatoId: 'contato-openai-1',
      tipo: 'email-enviado',
      data: deslocarDias(hoje, -5),
      participanteCliente: 'Marina',
      origem: 'HubSpot',
    },
    {
      id: 'interacao-anthropic-1',
      contaId: 'anthropic',
      contatoId: 'contato-anthropic-1',
      tipo: 'reuniao',
      data: deslocarDias(hoje, -45),
      participanteCliente: 'Marina',
      origem: 'Google Calendar',
    },
  ]

  const contas: ContaAlvo[] = [
    {
      id: 'openai',
      nome: 'OpenAI',
      dominio: 'openai.com',
      siteUrl: 'https://openai.com',
      linkedinUrl: 'https://linkedin.com/company/openai',
      logo: 'openai',
      segmento: 'Inteligência Artificial',
      aderencia: 'quente',
      origem: { tipo: 'recomendada' },
      totalContatos: 3,
      previaContatos: [{ nome: 'Sarah Chen' }, { nome: 'Marcus Vance' }, { nome: 'Elena Rostova' }],
      ultimoSinal: sinais.find((s) => s.id === 'sinal-openai-1'),
      ultimoContatoEm: deslocarDias(hoje, -5),
    },
    {
      id: 'stripe',
      nome: 'Stripe',
      dominio: 'stripe.com',
      siteUrl: 'https://stripe.com',
      linkedinUrl: 'https://linkedin.com/company/stripe',
      logo: 'stripe',
      segmento: 'Infraestrutura de pagamentos',
      aderencia: 'quente',
      origem: { tipo: 'recomendada' },
      totalContatos: 2,
      previaContatos: [{ nome: 'David Kim' }, { nome: 'Rachel Green' }],
      ultimoSinal: sinais.find((s) => s.id === 'sinal-stripe-1'),
      ultimoContatoEm: deslocarDias(hoje, -1),
    },
    {
      id: 'anthropic',
      nome: 'Anthropic',
      dominio: 'anthropic.com',
      siteUrl: 'https://anthropic.com',
      linkedinUrl: 'https://linkedin.com/company/anthropic',
      logo: 'anthropic',
      segmento: 'Inteligência Artificial',
      aderencia: 'fit',
      origem: { tipo: 'recomendada' },
      totalContatos: 1,
      previaContatos: [{ nome: 'Alex Rivera' }],
      ultimoSinal: sinais.find((s) => s.id === 'sinal-anthropic-1'),
      ultimoContatoEm: deslocarDias(hoje, -45),
    },
    {
      id: 'nubank',
      nome: 'Nubank',
      dominio: 'nubank.com.br',
      siteUrl: 'https://nubank.com.br',
      linkedinUrl: 'https://linkedin.com/company/nubank',
      logo: 'nubank',
      segmento: 'Serviços financeiros',
      aderencia: 'nao-fit',
      origem: { tipo: 'importada', importadaPor: 'Marina', importadaEm: deslocarDias(hoje, -30) },
      totalContatos: 0,
      previaContatos: [],
      ultimoSinal: undefined,
      ultimoContatoEm: undefined,
    },
    {
      id: 'bbva-mexico',
      nome: 'BBVA México',
      dominio: 'bbva.mx',
      siteUrl: 'https://bbva.mx',
      linkedinUrl: undefined,
      logo: undefined,
      segmento: undefined,
      aderencia: undefined,
      origem: { tipo: 'importada', importadaPor: 'Marina', importadaEm: deslocarDias(hoje, -15) },
      totalContatos: 2,
      previaContatos: [{ nome: 'Carlos Mendoza' }, { nome: 'Sofia Ortiz' }],
      ultimoSinal: sinais.find((s) => s.id === 'sinal-bbva-1'),
      ultimoContatoEm: undefined,
    },
  ]

  return {
    contas,
    contatos,
    sinais,
    interacoes,
  }
}

// Dados da demonstração (ADR 0003): Workspace da Databricks, Contas-alvo reais com informação
// pública e pessoas com cargos reais e nomes fictícios. Tudo em pt-BR.
import type {
  Agente,
  AgenteId,
  Aprovacao,
  Canal,
  Fato,
  Habilidade,
  Integracao,
  IntegracaoFutura,
  IntegracaoId,
  ItemDeAtividade,
  Permissao,
  Personalizacao,
  PreviaDeCanal,
  Rotina,
  Workspace,
} from './tipos'

export const HOJE = { data: '22/09/2026', diaDaSemana: 'terça' }

export const workspace: Workspace = {
  cliente: 'Databricks',
  descricao: 'Workspace de demonstração',
  usuario: { nome: 'Marina Alves', cargo: 'Head de Growth, LATAM' },
}

export const agentes: Agente[] = [
  {
    id: 'scopus',
    nome: 'Scopus',
    especialidade: 'Especialista em ICP',
    descricao: 'Define o ICP a partir dos seus melhores clientes e dá nota de aderência a cada Conta-alvo.',
    entrega: 'ICP e aderência de contas',
    estado: 'detectou',
    tarefasFeitas: 312,
    horasEconomizadas: 41,
    sugestoes: [
      { id: 'scopus-aderencia', texto: 'Pontue a aderência da OpenAI ao nosso ICP' },
      { id: 'scopus-revisar-icp', texto: 'Revise nosso ICP com os clientes que fecharam em 2026' },
      { id: 'colaboracao-openai', texto: 'Monte a abordagem completa para a OpenAI' },
    ],
  },
  {
    id: 'ethos',
    nome: 'Ethos',
    especialidade: 'Especialista em Persona',
    descricao: 'Descreve dores, objeções e gatilhos de cada papel do Comitê de compra.',
    entrega: 'Personas do Comitê de compra',
    estado: 'ocioso',
    tarefasFeitas: 187,
    horasEconomizadas: 26,
    sugestoes: [
      { id: 'ethos-comite-stripe', texto: 'Monte as personas do Comitê de compra da Stripe' },
      { id: 'ethos-objecoes-cfo', texto: 'Quais objeções um CFO levanta contra a Databricks?' },
    ],
  },
  {
    id: 'rhetor',
    nome: 'Rhetor',
    especialidade: 'Especialista em escrita persuasiva',
    descricao: 'Escreve e-mails, sequências, posts e copy no tom da marca, para cada persona.',
    entrega: 'E-mails, sequências e copy',
    estado: 'trabalhando',
    tarefasFeitas: 244,
    horasEconomizadas: 58,
    sugestoes: [
      { id: 'rhetor-email-meta', texto: 'Escreva um e-mail frio para a Head de Dados da Meta' },
      { id: 'rhetor-sequencia', texto: 'Crie uma sequência de 4 toques para VPs de Engenharia' },
    ],
  },
  {
    id: 'oraculum',
    nome: 'Oraculum',
    especialidade: 'Especialista em GEO',
    descricao: 'Mede como a marca aparece no ChatGPT, Perplexity, Gemini e Claude e recomenda o que publicar para ser citada.',
    entrega: 'Presença da marca nos LLMs',
    estado: 'ocioso',
    tarefasFeitas: 96,
    horasEconomizadas: 19,
    sugestoes: [
      { id: 'oraculum-auditoria', texto: 'Audite nossa presença para "melhor plataforma de dados para IA"' },
      { id: 'oraculum-conteudo', texto: 'Que conteúdo publicar para ser citado no Perplexity?' },
    ],
  },
]

export const fatos: Fato[] = [
  { id: 'f1', agenteId: 'scopus', texto: 'O ciclo de venda enterprise da Databricks leva em média 6 meses.', origem: 'Aprendido na Conversa de 12/09/2026' },
  { id: 'f2', agenteId: 'scopus', texto: 'Contas com mais de 2.000 funcionários e time de dados próprio convertem 3 vezes mais.', origem: 'Aprendido no HubSpot em 03/09/2026' },
  { id: 'f3', agenteId: 'scopus', texto: 'Marina prefere a lista de contas ordenada por aderência, não por receita.', origem: 'Aprendido na Conversa de 29/08/2026' },
  { id: 'f4', agenteId: 'ethos', texto: 'O Comitê de compra típico tem CDO, VP de Engenharia e alguém de Procurement.', origem: 'Aprendido na Conversa de 10/09/2026' },
  { id: 'f5', agenteId: 'ethos', texto: 'A objeção mais comum de CFOs é o custo de computação imprevisível.', origem: 'Aprendido no Notion em 05/09/2026' },
  { id: 'f6', agenteId: 'rhetor', texto: 'E-mails com até 90 palavras têm a maior taxa de resposta da equipe.', origem: 'Aprendido no HubSpot em 15/09/2026' },
  { id: 'f7', agenteId: 'rhetor', texto: 'O tom da Databricks é técnico e direto, sem superlativos.', origem: 'Aprendido na Configuração em 01/09/2026' },
  { id: 'f8', agenteId: 'oraculum', texto: 'A Snowflake é a concorrente mais citada ao lado da Databricks nos LLMs.', origem: 'Aprendido na Rotina de 15/09/2026' },
  { id: 'f9', agenteId: 'oraculum', texto: 'Os prompts-alvo prioritários são sobre lakehouse e plataforma de dados para IA.', origem: 'Aprendido na Conversa de 02/09/2026' },
]

export const habilidades: Habilidade[] = [
  { id: 'h1', agenteId: 'scopus', nome: 'Pontuar aderência ao ICP', descricao: 'Cruza firmografia, tecnologia usada e sinais públicos para dar uma nota de 0 a 100.', usos: 148, ultimaMelhoria: '18/09/2026', ativa: true },
  { id: 'h2', agenteId: 'scopus', nome: 'Encontrar contas parecidas', descricao: 'Parte dos melhores clientes e procura contas com o mesmo perfil.', usos: 37, ultimaMelhoria: '09/09/2026', ativa: true },
  { id: 'h3', agenteId: 'ethos', nome: 'Mapear Comitê de compra', descricao: 'Identifica os papéis que influenciam e decidem a compra numa Conta-alvo.', usos: 64, ultimaMelhoria: '14/09/2026', ativa: true },
  { id: 'h4', agenteId: 'ethos', nome: 'Antecipar objeções por cargo', descricao: 'Lista as objeções prováveis de cada papel, com a resposta sugerida.', usos: 29, ultimaMelhoria: '02/09/2026', ativa: false },
  { id: 'h5', agenteId: 'rhetor', nome: 'E-mail frio curto', descricao: 'Escreve e-mails de até 90 palavras com um único pedido claro.', usos: 121, ultimaMelhoria: '19/09/2026', ativa: true },
  { id: 'h6', agenteId: 'rhetor', nome: 'Sequência por persona', descricao: 'Monta sequências de toques adaptadas às dores de cada persona.', usos: 43, ultimaMelhoria: '11/09/2026', ativa: true },
  { id: 'h7', agenteId: 'oraculum', nome: 'Auditar prompts-alvo', descricao: 'Pergunta os prompts-alvo a cada LLM e registra se a marca é citada.', usos: 52, ultimaMelhoria: '15/09/2026', ativa: true },
  { id: 'h8', agenteId: 'oraculum', nome: 'Recomendar conteúdo citável', descricao: 'Sugere páginas e dados que aumentam a chance de a marca ser citada.', usos: 18, ultimaMelhoria: '08/09/2026', ativa: true },
]

export const rotinas: Rotina[] = [
  { id: 'r1', agenteId: 'oraculum', tarefa: 'Auditar a presença da Databricks nos LLMs e postar o resumo', frequencia: 'semanal', diaDaSemana: 'segunda', horario: '09:00', canalDestino: 'slack', pausada: false },
  { id: 'r2', agenteId: 'scopus', tarefa: 'Reavaliar a aderência das 50 contas prioritárias', frequencia: 'semanal', diaDaSemana: 'terça', horario: '08:00', canalDestino: 'email', pausada: false },
  { id: 'r3', agenteId: 'rhetor', tarefa: 'Sugerir respostas para os e-mails recebidos ontem', frequencia: 'diaria', horario: '07:30', canalDestino: 'slack', pausada: false },
  { id: 'r4', agenteId: 'ethos', tarefa: 'Atualizar as personas com as calls gravadas do mês', frequencia: 'mensal', horario: '10:00', canalDestino: null, pausada: true },
]

export const atividade: ItemDeAtividade[] = [
  { id: 'a1', agenteId: 'scopus', gatilho: 'rotina', quando: 'Hoje, 08:00', descricao: 'Reavaliou a aderência das 50 contas prioritárias', resultado: '14 contas mudaram de nota; a Anthropic subiu para 91.' },
  { id: 'a2', agenteId: 'rhetor', gatilho: 'rotina', quando: 'Hoje, 07:30', descricao: 'Sugeriu respostas para os e-mails de ontem', resultado: '6 rascunhos prontos no HubSpot.' },
  { id: 'a3', agenteId: 'scopus', gatilho: 'canal', quando: 'Ontem, 17:42', descricao: 'Respondeu a uma Menção no Slack #growth', resultado: 'Propôs atualizar 14 contas no HubSpot.' },
  { id: 'a4', agenteId: 'oraculum', gatilho: 'rotina', quando: 'Segunda, 09:00', descricao: 'Auditou 12 prompts-alvo em 4 LLMs', resultado: 'Citada em 29 de 48 respostas; a Snowflake apareceu em 33.' },
  { id: 'a5', agenteId: 'oraculum', gatilho: 'conversa', quando: 'Segunda, 11:15', descricao: 'Recomendou conteúdo sobre lakehouse', resultado: '3 pautas enviadas para o Notion.' },
  { id: 'a6', agenteId: 'ethos', gatilho: 'mencao', quando: 'Sexta, 15:03', descricao: 'Foi mencionado pelo Scopus numa Conversa sobre a Stripe', resultado: '4 personas descritas.' },
  { id: 'a7', agenteId: 'rhetor', gatilho: 'conversa', quando: 'Sexta, 10:20', descricao: 'Escreveu uma campanha para Meta Ads', resultado: 'Propôs subir a campanha; aguarda Aprovação.' },
]

export const canais: Canal[] = [
  { id: 'slack', nome: 'Slack', descricao: 'Mencione um Agente em qualquer canal ou thread.', conectado: true },
  { id: 'whatsapp', nome: 'WhatsApp', descricao: 'Converse com os Agentes pelo número do Workspace.', conectado: false },
  { id: 'teams', nome: 'Microsoft Teams', descricao: 'Mencione um Agente em chats e canais do Teams.', conectado: true },
  { id: 'email', nome: 'E-mail', descricao: 'Encaminhe e-mails e receba resumos das Rotinas.', conectado: true },
]

export const integracoes: Integracao[] = [
  { id: 'hubspot', nome: 'HubSpot', categoria: 'CRM', descricao: 'Contas, contatos, negócios e sequências.', conectada: true, escreve: true },
  { id: 'clay', nome: 'Clay', categoria: 'Enriquecimento', descricao: 'Dados firmográficos e de tecnologia.', conectada: true, escreve: false },
  { id: 'apollo', nome: 'Apollo', categoria: 'Enriquecimento', descricao: 'Contatos e sinais de compra.', conectada: true, escreve: false },
  { id: 'lusha', nome: 'Lusha', categoria: 'Enriquecimento', descricao: 'Cargos e contatos do Comitê de compra.', conectada: false, escreve: false },
  { id: 'notion', nome: 'Notion', categoria: 'Conhecimento', descricao: 'Páginas usadas como base de conhecimento.', conectada: true, escreve: false },
  { id: 'meta-ads', nome: 'Meta Ads', categoria: 'Mídia paga', descricao: 'Campanhas no Facebook e no Instagram.', conectada: true, escreve: true },
  { id: 'google-ads', nome: 'Google Ads', categoria: 'Mídia paga', descricao: 'Campanhas de busca e display.', conectada: false, escreve: true },
]

export const integracoesFuturas: IntegracaoFutura[] = [
  { nome: 'Salesforce', categoria: 'CRM' },
  { nome: 'ZoomInfo', categoria: 'Enriquecimento' },
  { nome: 'Google Drive', categoria: 'Conhecimento' },
  { nome: 'LinkedIn Ads', categoria: 'Mídia paga' },
]

const MAPEAMENTO_PADRAO: Record<AgenteId, IntegracaoId[]> = {
  scopus: ['hubspot', 'clay', 'apollo', 'lusha'],
  ethos: ['hubspot', 'apollo', 'lusha', 'notion'],
  rhetor: ['hubspot', 'notion', 'meta-ads', 'google-ads'],
  oraculum: ['notion', 'google-ads'],
}

/** ADR 0002: Ler por padrão; Propor em qualquer Integração que escreve ou gasta. */
function permissoesPadrao(id: AgenteId): Partial<Record<IntegracaoId, Permissao>> {
  return Object.fromEntries(
    MAPEAMENTO_PADRAO[id].map((integracaoId) => {
      const escreve = integracoes.find((i) => i.id === integracaoId)?.escreve
      return [integracaoId, escreve ? 'propor' : 'ler']
    }),
  )
}

export const personalizacoes: Record<AgenteId, Personalizacao> = {
  scopus: {
    instrucoes: 'Priorize contas com time de dados próprio e mais de 2.000 funcionários.',
    tomDeVoz: 'Analítico e objetivo.',
    baseDeConhecimento: [
      { id: 'k1', tipo: 'documento', nome: 'Clientes fechados 2025-2026.csv' },
      { id: 'k2', tipo: 'notion', nome: 'Playbook de segmentação' },
    ],
    canais: ['slack', 'email'],
    permissoes: permissoesPadrao('scopus'),
  },
  ethos: {
    instrucoes: '',
    tomDeVoz: 'Empático e concreto.',
    baseDeConhecimento: [{ id: 'k3', tipo: 'notion', nome: 'Transcrições de discovery' }],
    canais: ['slack'],
    permissoes: permissoesPadrao('ethos'),
  },
  rhetor: {
    instrucoes: 'Nunca use superlativos. Um único pedido por e-mail.',
    tomDeVoz: 'Técnico e direto, como a Databricks fala com engenheiros.',
    baseDeConhecimento: [
      { id: 'k4', tipo: 'url', nome: 'databricks.com/product/data-intelligence-platform' },
      { id: 'k5', tipo: 'notion', nome: 'Guia de marca Databricks' },
    ],
    canais: ['slack', 'email'],
    permissoes: permissoesPadrao('rhetor'),
  },
  oraculum: {
    instrucoes: 'Compare sempre com Snowflake e Google BigQuery.',
    tomDeVoz: 'Factual, com fontes.',
    baseDeConhecimento: [{ id: 'k6', tipo: 'url', nome: 'databricks.com/blog' }],
    canais: ['slack'],
    permissoes: permissoesPadrao('oraculum'),
  },
}

export const aprovacoes: Aprovacao[] = [
  {
    id: 'ap1',
    agenteId: 'rhetor',
    acao: 'Subir campanha no Meta Ads: "Plataforma de dados para IA", Brasil',
    integracaoId: 'meta-ads',
    impacto: 'R$ 12.000 em 14 dias',
    justificativa: 'Três variações de anúncio para VPs de Engenharia, com base nas personas do Ethos.',
    origem: 'althius',
    estado: 'pendente',
  },
  {
    id: 'ap2',
    agenteId: 'scopus',
    acao: 'Atualizar 14 contas no HubSpot com a nova aderência ao ICP',
    integracaoId: 'hubspot',
    impacto: '14 registros alterados',
    justificativa: 'A reavaliação desta manhã mudou a nota de 14 contas prioritárias.',
    origem: 'slack',
    estado: 'pendente',
  },
]

export const previas: PreviaDeCanal[] = [
  {
    canalId: 'slack',
    titulo: '#growth',
    mensagens: [
      { autor: 'Marina Alves', ehAgente: false, texto: '@Scopus atualiza a aderência das contas prioritárias?' },
      { autor: 'Scopus', ehAgente: true, texto: 'Recalculei as 50 contas. 14 mudaram de nota; a Anthropic subiu para 91. Posso atualizar no HubSpot?', aprovacaoId: 'ap2' },
    ],
  },
  {
    canalId: 'whatsapp',
    titulo: 'Althius · Databricks',
    mensagens: [
      { autor: 'Marina Alves', ehAgente: false, texto: 'Rhetor, me manda 2 linhas de assunto para o e-mail da Meta.' },
      { autor: 'Rhetor', ehAgente: true, texto: '1. "Seu lakehouse já treina modelos?"\n2. "Custo de dados por modelo em produção"' },
    ],
  },
  {
    canalId: 'teams',
    titulo: 'Receita · Geral',
    mensagens: [
      { autor: 'Paulo Nunes', ehAgente: false, texto: '@Ethos quem decide a compra na Stripe?' },
      { autor: 'Ethos', ehAgente: true, texto: 'Head de Infraestrutura de Dados decide; o CFO aprova acima de US$ 500 mil por ano.' },
    ],
  },
  {
    canalId: 'email',
    titulo: 'Resumo semanal · Oraculum',
    mensagens: [
      { autor: 'Oraculum', ehAgente: true, texto: 'A Databricks foi citada em 29 de 48 respostas nesta semana. Detalhes no Notion.' },
    ],
  },
]

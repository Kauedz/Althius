// Dados da demonstração (ADR 0003): Workspace da Databricks, Contas-alvo reais com informação
// pública e pessoas com cargos reais e nomes fictícios. Tudo em pt-BR.
import type {
  Agente,
  AgenteId,
  Aprovacao,
  Canal,
  ContaDeUsuario,
  Convite,
  EspecialidadeId,
  Fato,
  DocumentoVigente,
  Habilidade,
  InformacoesDoWorkspace,
  Integracao,
  IntegracaoFutura,
  IntegracaoId,
  ItemDeAtividade,
  Papel,
  Permissao,
  Personalizacao,
  PreviaDeCanal,
  Rotina,
} from './tipos'
import { especialidade } from './especialidades'
import { permissaoPadrao } from './regras'

/** O Workspace aberto na demonstração. */
export const WORKSPACE_ATUAL = 'databricks'

export const workspaces: Record<string, InformacoesDoWorkspace> = {
  databricks: { nome: 'Databricks', descricao: 'Workspace de demonstração', criadoEm: '2026-06-02' },
  'evolut-trading': { nome: 'Evolut Trading', descricao: 'Outro Workspace da Althius', criadoEm: '2026-04-15' },
}

/** O plano atual de cada Workspace: é do Workspace, não da Conta de usuário. Sem preço, franquia nem limite. */
export const planos: Record<string, string> = {
  databricks: 'Demonstração',
}

/** A sessão padrão da demonstração: Marina, Administradora do Workspace da Databricks. */
export const CONTA_DA_SESSAO = 'marina'

/** As Contas de usuário existem por si: a Participação no Workspace é que as liga a cada Workspace. */
export const contasDeUsuario: ContaDeUsuario[] = [
  { id: 'marina', nome: 'Marina Alves', email: 'marina.alves@databricks.com', cargo: 'Head de Growth, LATAM' },
  { id: 'rafael', nome: 'Rafael Couto', email: 'rafael.couto@databricks.com', foto: '/avatars/avatar-8.jpg', cargo: 'Diretor de Vendas, Brasil' },
  { id: 'lucas', nome: 'Lucas Moreira', email: 'lucas.moreira@databricks.com', cargo: 'SDR Enterprise' },
  { id: 'beatriz', nome: 'Beatriz Santos', email: 'beatriz.santos@databricks.com', foto: '/avatars/avatar-5.jpg', cargo: 'Marketing de Produto' },
  { id: 'thiago', nome: 'Thiago Ramos', email: 'thiago.ramos@databricks.com', cargo: 'Consultor de parcerias' },
]

export interface RegistroDeParticipacao {
  contaId: string
  workspaceId: string
  papel: Papel
}

export const participacoes: RegistroDeParticipacao[] = [
  { contaId: 'marina', workspaceId: 'databricks', papel: 'administrador' },
  { contaId: 'rafael', workspaceId: 'databricks', papel: 'administrador' },
  { contaId: 'lucas', workspaceId: 'databricks', papel: 'membro' },
  { contaId: 'beatriz', workspaceId: 'databricks', papel: 'membro' },
  { contaId: 'thiago', workspaceId: 'databricks', papel: 'membro' },
  { contaId: 'thiago', workspaceId: 'evolut-trading', papel: 'membro' },
]

export const convites: Convite[] = [
  { id: 'convite-carla', email: 'carla.nunes@databricks.com', papel: 'membro', registradoEm: '2026-09-22' },
]

/** O ICP vigente na Memória do Workspace da demonstração, aprovado antes da sessão começar. */
export const icpInicial: DocumentoVigente = {
  aprovadoEm: '2026-09-12',
  aprovadoPor: { contaId: 'marina', nome: 'Marina Alves' },
  secoes: [
    { titulo: 'Segmentos', texto: 'Serviços financeiros, varejo e telecomunicações.' },
    { titulo: 'Porte', texto: 'Empresas com 2.000 funcionários ou mais.' },
    { titulo: 'Regiões', texto: 'Brasil e México.' },
    { titulo: 'Tecnologia', texto: 'Nuvem pública (AWS, Azure ou Google Cloud) e data warehouse legado em migração.' },
    { titulo: 'Maturidade de dados', texto: 'Time de dados próprio, com engenharia e ciência de dados.' },
    { titulo: 'Fora do ICP', texto: 'Empresas sem time de dados próprio ou com operação só em servidores locais.' },
  ],
}

/**
 * As definições de Personas vigentes na Memória do Workspace da demonstração, uma por papel do Comitê de compra.
 * Os Contatos de Contas e Contatos são classificados pelo nome delas.
 */
export const personasIniciais: DocumentoVigente = {
  aprovadoEm: '2026-09-05',
  aprovadoPor: { contaId: 'rafael', nome: 'Rafael Couto' },
  secoes: [
    {
      titulo: 'Decisor técnico',
      texto: 'CTO, VP de Engenharia ou Head de Dados. Avalia arquitetura, custo de nuvem e governança antes de recomendar a compra.',
    },
    { titulo: 'Patrocinador executivo', texto: 'CFO, COO ou CDO. Aprova o orçamento e cobra retorno do investimento em dados e IA.' },
    { titulo: 'Líder técnico', texto: 'Gerente de engenharia de dados ou tech lead. Conduz a prova de conceito e a migração.' },
    { titulo: 'Comitê executivo', texto: 'CEO e diretoria. Decide investimentos estratégicos acima do orçamento da área.' },
    {
      titulo: 'Decisor comercial',
      texto: 'Head de Vendas ou diretor comercial. Decide quando a plataforma muda a operação ou a meta do time comercial.',
    },
    {
      titulo: 'Campeão interno',
      texto: 'Gestor de uma área parceira, como canais ou operações. Defende a compra por dentro e abre acesso a quem decide.',
    },
    {
      titulo: 'Usuário-chave',
      texto: 'Líder de uma área que vai usar a plataforma no dia a dia. Valida a prova de conceito e traz os requisitos de uso.',
    },
  ],
}

/**
 * Um Agente como a fonte o guarda: aponta para a Especialidade pelo identificador. A descrição,
 * a Rotina ativa e as Integrações a fonte calcula a partir da Personalização e das Rotinas.
 */
export type RegistroDeAgente = Omit<Agente, 'especialidade' | 'descricao' | 'rotinaAtiva' | 'integracoes'> & {
  especialidadeId: EspecialidadeId
}

export const agentes: RegistroDeAgente[] = [
  { id: 'scopus', nome: 'Scopus', tipo: 'padrao', especialidadeId: 'scopus', estado: 'detectou', execucoes: 312 },
  { id: 'ethos', nome: 'Ethos', tipo: 'padrao', especialidadeId: 'ethos', estado: 'ocioso', execucoes: 187 },
  { id: 'rhetor', nome: 'Rhetor', tipo: 'padrao', especialidadeId: 'rhetor', estado: 'trabalhando', execucoes: 244 },
  { id: 'oraculum', nome: 'Oraculum', tipo: 'padrao', especialidadeId: 'oraculum', estado: 'ocioso', execucoes: 96 },
  { id: 'scopus-enterprise-latam', nome: 'Scopus · Enterprise LATAM', tipo: 'criado', especialidadeId: 'scopus', estado: 'ocioso', execucoes: 58 },
  { id: 'ethos-comite-financeiro', nome: 'Ethos · Comitê financeiro', tipo: 'criado', especialidadeId: 'ethos', estado: 'ocioso', execucoes: 23 },
  { id: 'rhetor-sequencias-outbound', nome: 'Rhetor · Sequências outbound', tipo: 'criado', especialidadeId: 'rhetor', estado: 'ocioso', execucoes: 71 },
  { id: 'rhetor-anuncios-meta', nome: 'Rhetor · Anúncios Meta', tipo: 'criado', especialidadeId: 'rhetor', estado: 'ocioso', execucoes: 17 },
  { id: 'oraculum-concorrencia-snowflake', nome: 'Oraculum · Concorrência Snowflake', tipo: 'criado', especialidadeId: 'oraculum', estado: 'detectou', execucoes: 12 },
]

/**
 * Quantas Execuções os Agentes de cada Especialidade fazem por dia antes de a sessão começar, perto da média das
 * `execucoes` deles desde a criação do Workspace. O mês até hoje soma esse tanto por dia já começado.
 */
export const execucoesPorDia: Record<EspecialidadeId, number> = { scopus: 4, ethos: 2, rhetor: 3, oraculum: 1 }

export const fatos: Fato[] = [
  { id: 'f1', agenteId: 'scopus', texto: 'O ciclo de venda enterprise da Databricks leva em média 6 meses.', origem: 'Aprendido na Conversa de 12/09/2026' },
  { id: 'f2', agenteId: 'scopus', texto: 'Contas-alvo com mais de 2.000 funcionários e time de dados próprio convertem 3 vezes mais.', origem: 'Aprendido no HubSpot em 03/09/2026' },
  { id: 'f3', agenteId: 'scopus', texto: 'Marina prefere a lista de Contas-alvo ordenada por aderência, não por receita.', origem: 'Aprendido na Conversa de 29/08/2026' },
  { id: 'f4', agenteId: 'ethos', texto: 'O Comitê de compra típico tem CDO, VP de Engenharia e alguém de Procurement.', origem: 'Aprendido na Conversa de 10/09/2026' },
  { id: 'f5', agenteId: 'ethos', texto: 'A objeção mais comum de CFOs é o custo de computação imprevisível.', origem: 'Aprendido no Notion em 05/09/2026' },
  { id: 'f6', agenteId: 'rhetor', texto: 'E-mails com até 90 palavras têm a maior taxa de resposta da equipe.', origem: 'Aprendido no HubSpot em 15/09/2026' },
  { id: 'f7', agenteId: 'rhetor', texto: 'O tom da Databricks é técnico e direto, sem superlativos.', origem: 'Aprendido na Configuração em 01/09/2026' },
  { id: 'f8', agenteId: 'oraculum', texto: 'A Snowflake é a concorrente mais citada ao lado da Databricks nos LLMs.', origem: 'Aprendido na Rotina de 15/09/2026' },
  { id: 'f9', agenteId: 'oraculum', texto: 'Os prompts-alvo prioritários são sobre lakehouse e plataforma de dados para IA.', origem: 'Aprendido na Conversa de 02/09/2026' },
  { id: 'f10', agenteId: 'scopus-enterprise-latam', texto: 'As Contas-alvo no México com mais aderência são do setor financeiro, como Banorte e BBVA México.', origem: 'Aprendido na Rotina de 15/09/2026' },
  { id: 'f11', agenteId: 'scopus-enterprise-latam', texto: 'No Brasil, varejo e telecom têm time de dados próprio com mais frequência.', origem: 'Aprendido no Clay em 08/09/2026' },
  { id: 'f12', agenteId: 'ethos-comite-financeiro', texto: 'Em empresas abertas, o controller entra no Comitê de compra quando o contrato passa de US$ 250 mil por ano.', origem: 'Aprendido na Conversa de 11/09/2026' },
  { id: 'f13', agenteId: 'rhetor-sequencias-outbound', texto: 'O terceiro toque é o que mais gera resposta nas sequências da equipe.', origem: 'Aprendido no HubSpot em 17/09/2026' },
  { id: 'f14', agenteId: 'rhetor-anuncios-meta', texto: 'Anúncios com um número no título tiveram o dobro de cliques em VPs de Engenharia.', origem: 'Aprendido no Meta Ads em 16/09/2026' },
  { id: 'f15', agenteId: 'oraculum-concorrencia-snowflake', texto: 'A Snowflake é citada antes da Databricks em 7 dos 12 prompts-alvo no Perplexity.', origem: 'Aprendido na Rotina de 19/09/2026' },
]

export const habilidades: Habilidade[] = [
  { id: 'h1', agenteId: 'scopus', nome: 'Pontuar aderência ao ICP', descricao: 'Cruza firmografia, tecnologia usada e sinais públicos para dar uma nota de 0 a 100.', usos: 148, ultimaMelhoria: '18/09/2026', ativa: true, usaIcp: true },
  { id: 'h2', agenteId: 'scopus', nome: 'Encontrar Contas-alvo parecidas', descricao: 'Parte dos melhores clientes e procura Contas-alvo com o mesmo perfil.', usos: 37, ultimaMelhoria: '09/09/2026', ativa: true },
  { id: 'h3', agenteId: 'ethos', nome: 'Mapear Comitê de compra', descricao: 'Identifica os papéis que influenciam e decidem a compra numa Conta-alvo.', usos: 64, ultimaMelhoria: '14/09/2026', ativa: true },
  { id: 'h4', agenteId: 'ethos', nome: 'Antecipar objeções por cargo', descricao: 'Lista as objeções prováveis de cada papel, com a resposta sugerida.', usos: 29, ultimaMelhoria: '02/09/2026', ativa: false },
  { id: 'h5', agenteId: 'rhetor', nome: 'E-mail frio curto', descricao: 'Escreve e-mails de até 90 palavras com um único pedido claro.', usos: 121, ultimaMelhoria: '19/09/2026', ativa: true },
  { id: 'h6', agenteId: 'rhetor', nome: 'Sequência por persona', descricao: 'Monta sequências de toques adaptadas às dores de cada persona.', usos: 43, ultimaMelhoria: '11/09/2026', ativa: true, usaPersonas: true },
  { id: 'h7', agenteId: 'oraculum', nome: 'Auditar prompts-alvo', descricao: 'Pergunta os prompts-alvo a cada LLM e registra se a marca é citada.', usos: 52, ultimaMelhoria: '15/09/2026', ativa: true },
  { id: 'h8', agenteId: 'oraculum', nome: 'Recomendar conteúdo citável', descricao: 'Sugere páginas e dados que aumentam a chance de a marca ser citada.', usos: 18, ultimaMelhoria: '08/09/2026', ativa: true },
  // Os Agentes criados começaram com uma cópia das Habilidades do Agente padrão e seguiram refinando com o uso.
  { id: 'h9', agenteId: 'scopus-enterprise-latam', nome: 'Pontuar aderência ao ICP', descricao: 'Cruza firmografia, tecnologia usada e sinais públicos para dar uma nota de 0 a 100.', usos: 41, ultimaMelhoria: '15/09/2026', ativa: true, usaIcp: true },
  { id: 'h10', agenteId: 'scopus-enterprise-latam', nome: 'Encontrar Contas-alvo parecidas', descricao: 'Parte dos melhores clientes e procura Contas-alvo com o mesmo perfil.', usos: 9, ultimaMelhoria: '01/09/2026', ativa: true },
  { id: 'h11', agenteId: 'ethos-comite-financeiro', nome: 'Mapear Comitê de compra', descricao: 'Identifica os papéis que influenciam e decidem a compra numa Conta-alvo.', usos: 14, ultimaMelhoria: '11/09/2026', ativa: true },
  { id: 'h12', agenteId: 'ethos-comite-financeiro', nome: 'Antecipar objeções por cargo', descricao: 'Lista as objeções prováveis de cada papel, com a resposta sugerida.', usos: 8, ultimaMelhoria: '11/09/2026', ativa: true },
  { id: 'h13', agenteId: 'rhetor-sequencias-outbound', nome: 'E-mail frio curto', descricao: 'Escreve e-mails de até 90 palavras com um único pedido claro.', usos: 26, ultimaMelhoria: '12/09/2026', ativa: true },
  { id: 'h14', agenteId: 'rhetor-sequencias-outbound', nome: 'Sequência por persona', descricao: 'Monta sequências de toques adaptadas às dores de cada persona.', usos: 38, ultimaMelhoria: '17/09/2026', ativa: true, usaPersonas: true },
  { id: 'h15', agenteId: 'rhetor-anuncios-meta', nome: 'E-mail frio curto', descricao: 'Escreve e-mails de até 90 palavras com um único pedido claro.', usos: 0, ultimaMelhoria: '05/09/2026', ativa: false },
  { id: 'h16', agenteId: 'rhetor-anuncios-meta', nome: 'Sequência por persona', descricao: 'Monta sequências de toques adaptadas às dores de cada persona.', usos: 11, ultimaMelhoria: '16/09/2026', ativa: true, usaPersonas: true },
  { id: 'h17', agenteId: 'oraculum-concorrencia-snowflake', nome: 'Auditar prompts-alvo', descricao: 'Pergunta os prompts-alvo a cada LLM e registra se a marca é citada.', usos: 8, ultimaMelhoria: '19/09/2026', ativa: true },
  { id: 'h18', agenteId: 'oraculum-concorrencia-snowflake', nome: 'Recomendar conteúdo citável', descricao: 'Sugere páginas e dados que aumentam a chance de a marca ser citada.', usos: 3, ultimaMelhoria: '12/09/2026', ativa: true },
]

export const rotinas: Rotina[] = [
  { id: 'r1', agenteId: 'oraculum', tarefa: 'Auditar a presença da Databricks nos LLMs e postar o resumo', frequencia: 'semanal', diaDaSemana: 'segunda', horario: '09:00', canalDestino: 'slack', pausada: false },
  { id: 'r2', agenteId: 'scopus', tarefa: 'Reavaliar a aderência das 50 Contas-alvo prioritárias', frequencia: 'semanal', diaDaSemana: 'terça', horario: '08:00', canalDestino: 'email', pausada: false },
  { id: 'r3', agenteId: 'rhetor', tarefa: 'Sugerir respostas para os e-mails recebidos ontem', frequencia: 'diaria', horario: '07:30', canalDestino: 'slack', pausada: false },
  { id: 'r4', agenteId: 'ethos', tarefa: 'Atualizar as personas com as calls gravadas do mês', frequencia: 'mensal', horario: '10:00', canalDestino: null, pausada: true },
  { id: 'r5', agenteId: 'scopus-enterprise-latam', tarefa: 'Reavaliar a aderência das Contas-alvo enterprise da América Latina', frequencia: 'semanal', diaDaSemana: 'segunda', horario: '08:30', canalDestino: 'slack', pausada: false },
  { id: 'r6', agenteId: 'rhetor-sequencias-outbound', tarefa: 'Montar a sequência da semana para as Contas-alvo novas', frequencia: 'semanal', diaDaSemana: 'quarta', horario: '10:00', canalDestino: 'email', pausada: false },
  { id: 'r7', agenteId: 'oraculum-concorrencia-snowflake', tarefa: 'Comparar as citações da Databricks e da Snowflake nos prompts-alvo', frequencia: 'semanal', diaDaSemana: 'sexta', horario: '09:00', canalDestino: 'slack', pausada: false },
]

const verConversa = (agenteId: string) => ({ rotulo: 'Ver Conversa', para: `/agentes/${agenteId}/conversa` })
const verContas = { rotulo: 'Ver Contas', para: '/contas' }
const verAprovacoes = { rotulo: 'Ver Aprovações', para: '/aprovacoes' }
const verSequencias = { rotulo: 'Ver Sequências', para: '/sequencias' }

export const atividade: ItemDeAtividade[] = [
  { id: 'a1', agenteId: 'scopus', tipo: 'execucao', gatilho: 'rotina', quando: 'Hoje, 08:00', descricao: 'Reavaliou a aderência das 50 Contas-alvo prioritárias', resultado: '14 Contas-alvo mudaram de nota; a Anthropic subiu para 91.', link: verContas },
  { id: 'a2', agenteId: 'rhetor', tipo: 'execucao', gatilho: 'rotina', quando: 'Hoje, 07:30', descricao: 'Sugeriu respostas para os e-mails de ontem', resultado: '6 rascunhos prontos no HubSpot.', link: verConversa('rhetor') },
  { id: 'a3', agenteId: 'scopus', tipo: 'execucao', gatilho: 'canal', quando: 'Ontem, 17:42', descricao: 'Respondeu a uma Menção no Slack #growth', resultado: 'Propôs atualizar 14 Contas-alvo no HubSpot.', link: verAprovacoes },
  { id: 'a4', agenteId: 'oraculum', tipo: 'execucao', gatilho: 'rotina', quando: 'Segunda, 09:00', descricao: 'Auditou 12 prompts-alvo em 4 LLMs', resultado: 'Citada em 29 de 48 respostas; a Snowflake apareceu em 33.', link: verConversa('oraculum') },
  { id: 'a5', agenteId: 'oraculum', tipo: 'execucao', gatilho: 'conversa', quando: 'Segunda, 11:15', descricao: 'Recomendou conteúdo sobre lakehouse', resultado: '3 pautas enviadas para o Notion.', link: verConversa('oraculum') },
  { id: 'a6', agenteId: 'ethos', tipo: 'execucao', gatilho: 'mencao', quando: 'Sexta, 15:03', descricao: 'Foi mencionado pelo Scopus numa Conversa sobre a Stripe', resultado: 'Marina Costa, Paulo Ribeiro e Beatriz Lima, com dores e objeções.', link: verConversa('scopus') },
  { id: 'a7', agenteId: 'rhetor', tipo: 'execucao', gatilho: 'conversa', quando: 'Sexta, 10:20', descricao: 'Escreveu uma campanha para Meta Ads', resultado: 'Propôs subir a campanha; aguarda Aprovação.', link: verAprovacoes },
  { id: 'a8', agenteId: 'scopus-enterprise-latam', tipo: 'execucao', gatilho: 'rotina', quando: 'Segunda, 08:30', descricao: 'Reavaliou 40 Contas-alvo enterprise na América Latina', resultado: '6 Contas-alvo mudaram de nota; o Nubank subiu para 88.', link: verContas },
  { id: 'a9', agenteId: 'ethos-comite-financeiro', tipo: 'execucao', gatilho: 'conversa', quando: 'Quinta, 16:40', descricao: 'Descreveu o Comitê financeiro da Stripe', resultado: 'Beatriz Lima (CFO), o controller e Helena Prado (Procurement), com as objeções de cada um.', link: verConversa('ethos-comite-financeiro') },
  { id: 'a10', agenteId: 'rhetor-sequencias-outbound', tipo: 'execucao', gatilho: 'rotina', quando: 'Quarta, 10:00', descricao: 'Montou a sequência da semana', resultado: '5 toques para 12 Contas-alvo novas, prontos no HubSpot.', link: verSequencias },
  { id: 'a11', agenteId: 'rhetor-anuncios-meta', tipo: 'execucao', gatilho: 'mencao', quando: 'Terça, 14:12', descricao: 'Foi mencionado numa Conversa do Rhetor sobre a campanha de IA', resultado: '3 variações de anúncio por persona.', link: verConversa('rhetor') },
  { id: 'a12', agenteId: 'oraculum-concorrencia-snowflake', tipo: 'execucao', gatilho: 'rotina', quando: 'Sexta, 09:00', descricao: 'Comparou 12 prompts-alvo com a Snowflake', resultado: 'A Snowflake aparece antes em 7; a maior diferença está no Perplexity.', link: verConversa('oraculum-concorrencia-snowflake') },
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
  { id: 'notion', nome: 'Notion', categoria: 'Conhecimento', descricao: 'Páginas usadas como base de conhecimento e pautas.', conectada: true, escreve: true },
  { id: 'meta-ads', nome: 'Meta Ads', categoria: 'Mídia paga', descricao: 'Campanhas no Facebook e no Instagram.', conectada: true, escreve: true },
  { id: 'google-ads', nome: 'Google Ads', categoria: 'Mídia paga', descricao: 'Campanhas de busca e display.', conectada: false, escreve: true },
]

export const integracoesFuturas: IntegracaoFutura[] = [
  { nome: 'Salesforce', categoria: 'CRM' },
  { nome: 'ZoomInfo', categoria: 'Enriquecimento' },
  { nome: 'Google Drive', categoria: 'Conhecimento' },
  { nome: 'LinkedIn Ads', categoria: 'Mídia paga' },
]

function permissoesPadrao(id: EspecialidadeId): Partial<Record<IntegracaoId, Permissao>> {
  return permissoesEm(especialidade(id).integracoesPadrao)
}

/** Permissões padrão só nas Integrações escolhidas, para os Agentes criados que tiraram alguma. */
function permissoesEm(ids: IntegracaoId[]): Partial<Record<IntegracaoId, Permissao>> {
  return Object.fromEntries(
    ids.map((integracaoId) => {
      const integracao = integracoes.find((i) => i.id === integracaoId)
      if (!integracao) throw new Error(`Integração desconhecida: ${integracaoId}`)
      return [integracaoId, permissaoPadrao(integracao)]
    }),
  )
}

export const personalizacoes: Record<AgenteId, Personalizacao> = {
  scopus: {
    instrucoes: 'Priorize Contas-alvo com time de dados próprio e mais de 2.000 funcionários.',
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
  'scopus-enterprise-latam': {
    instrucoes: 'Pontue só Contas-alvo enterprise no Brasil, no México e na Colômbia, com mais de 5.000 funcionários.',
    tomDeVoz: 'Analítico e objetivo.',
    baseDeConhecimento: [
      { id: 'k7', tipo: 'documento', nome: 'Clientes fechados 2025-2026.csv' },
      { id: 'k8', tipo: 'notion', nome: 'Playbook de expansão LATAM' },
    ],
    canais: ['slack', 'email'],
    permissoes: permissoesPadrao('scopus'),
  },
  'ethos-comite-financeiro': {
    instrucoes: 'Descreva só os papéis financeiros do Comitê de compra: CFO, controller e Procurement.',
    tomDeVoz: 'Empático e concreto.',
    baseDeConhecimento: [{ id: 'k9', tipo: 'notion', nome: 'Objeções de CFOs em negócios perdidos' }],
    canais: ['slack'],
    permissoes: permissoesPadrao('ethos'),
  },
  'rhetor-sequencias-outbound': {
    instrucoes: 'Escreva sequências outbound de 4 a 6 toques, com um único pedido por e-mail.',
    tomDeVoz: 'Técnico e direto, como a Databricks fala com engenheiros.',
    baseDeConhecimento: [{ id: 'k10', tipo: 'notion', nome: 'Guia de marca Databricks' }],
    canais: ['slack', 'email'],
    permissoes: permissoesEm(['hubspot', 'notion']),
  },
  'rhetor-anuncios-meta': {
    instrucoes: 'Escreva copy de anúncios para o Meta Ads, com variações por persona e verba de até R$ 15.000 por campanha.',
    tomDeVoz: 'Técnico e direto, com um número no título.',
    baseDeConhecimento: [{ id: 'k11', tipo: 'notion', nome: 'Guia de marca Databricks' }],
    canais: ['slack'],
    permissoes: permissoesEm(['hubspot', 'notion', 'meta-ads']),
  },
  'oraculum-concorrencia-snowflake': {
    instrucoes: 'Compare a presença da Databricks e da Snowflake em cada prompt-alvo e aponte onde a Snowflake ganha.',
    tomDeVoz: 'Factual, com fontes.',
    baseDeConhecimento: [{ id: 'k12', tipo: 'url', nome: 'snowflake.com/blog' }],
    canais: ['slack'],
    permissoes: permissoesEm(['notion']),
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
    gatilho: 'conversa',
    estado: 'pendente',
  },
  {
    id: 'ap2',
    agenteId: 'scopus',
    acao: 'Atualizar 14 Contas-alvo no HubSpot com a nova aderência ao ICP',
    integracaoId: 'hubspot',
    impacto: '14 registros alterados',
    justificativa: 'A reavaliação desta manhã mudou a nota de 14 Contas-alvo prioritárias.',
    origem: 'slack',
    gatilho: 'canal',
    estado: 'pendente',
  },
]

export const previas: PreviaDeCanal[] = [
  {
    canalId: 'slack',
    titulo: '#growth',
    mensagens: [
      { autor: 'Marina Alves', ehAgente: false, texto: '@Scopus atualiza a aderência das Contas-alvo prioritárias?' },
      { autor: 'Scopus', ehAgente: true, texto: 'Recalculei as 50 Contas-alvo. 14 mudaram de nota; a Anthropic subiu para 91. Posso atualizar no HubSpot?', aprovacaoId: 'ap2' },
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

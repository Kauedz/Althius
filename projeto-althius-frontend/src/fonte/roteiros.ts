// Roteiros pré-gravados da Conversa e da Coordenação. Valem só para o protótipo (ADR 0003):
// no produto real, os Agentes respondem de forma robusta a qualquer entrada.
import type { AcaoProposta, AgenteId, Aprovacao, EspecialidadeId, Sugestao } from './tipos'

/**
 * Um passo de roteiro. Os roteiros são escritos por Especialidade (`Ator` = EspecialidadeId), e a fonte
 * troca cada Especialidade pelo Agente que faz o passo. A Aprovação é criada pela fonte no momento
 * em que o passo acontece.
 */
export type PassoDeRoteiro<Ator = EspecialidadeId> =
  | { tipo: 'ferramenta'; agenteId: Ator; descricao: string }
  | { tipo: 'texto'; agenteId: Ator; texto: string }
  | { tipo: 'repasse'; de: Ator; para: Ator; resumo: string }
  | { tipo: 'aprovacao'; agenteId: Ator; aprovacao: Omit<Aprovacao, 'id' | 'estado' | 'agenteId'> }

export const roteiros: Record<string, PassoDeRoteiro[]> = {
  'scopus-aderencia': [
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Consultando HubSpot: negócios ganhos e perdidos nos últimos 18 meses' },
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Buscando no Clay: firmografia e tecnologia da OpenAI' },
    {
      tipo: 'texto',
      agenteId: 'scopus',
      texto:
        'Aderência ao ICP: 87 de 100.\n\nO que pesa a favor:\n- Time de dados e de infraestrutura com mais de 400 pessoas\n- Volume de dados de treino e avaliação que cresce a cada modelo\n- Já usa Spark em parte dos pipelines\n\nO que pesa contra:\n- Infraestrutura própria madura, o que alonga o ciclo de venda\n\nSugiro tratar como Conta-alvo prioritária e começar pelo time de avaliação de modelos.',
    },
  ],
  'scopus-revisar-icp': [
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Consultando HubSpot: 38 negócios ganhos em 2026' },
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Buscando no Apollo: tamanho dos times de dados desses clientes' },
    {
      tipo: 'texto',
      agenteId: 'scopus',
      texto:
        'Revisei o ICP com os 38 clientes que fecharam em 2026.\n\nMudanças propostas:\n- Tamanho mínimo sobe de 1.000 para 2.000 funcionários\n- Entra um critério novo: time de dados próprio com 20 pessoas ou mais\n- Setores com maior conversão: tecnologia, serviços financeiros e saúde\n\nCom o ICP novo, 212 Contas-alvo da base deixam de ser prioritárias e 64 entram.',
    },
  ],
  'colaboracao-openai': [
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Consultando HubSpot: histórico da OpenAI' },
    { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Buscando no Apollo: sinais públicos da OpenAI' },
    { tipo: 'texto', agenteId: 'scopus', texto: 'A OpenAI tem aderência de 87 ao ICP. O sinal mais forte: três vagas abertas para engenharia de dados de avaliação.' },
    { tipo: 'repasse', de: 'scopus', para: 'ethos', resumo: 'Aderência 87 · foco em dados de avaliação de modelos' },
    { tipo: 'ferramenta', agenteId: 'ethos', descricao: 'Buscando no Lusha: cargos do Comitê de compra' },
    {
      tipo: 'texto',
      agenteId: 'ethos',
      texto:
        'Comitê de compra provável:\n- Head de Infraestrutura de Dados (decide): quer menos tempo entre coleta e treino\n- VP de Engenharia (influencia): teme migração longa\n- Procurement (aprova): exige previsibilidade de custo\n\nPrioridade: a Head de Infraestrutura de Dados.',
    },
    { tipo: 'repasse', de: 'ethos', para: 'rhetor', resumo: '3 personas · prioridade: Head de Infraestrutura de Dados' },
    { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultando o tom de voz e a base de conhecimento da Databricks' },
    {
      tipo: 'texto',
      agenteId: 'rhetor',
      texto:
        'Assunto: dados de avaliação em horas, não em dias\n\nOi, Carla. Vi que a OpenAI abriu três vagas para engenharia de dados de avaliação. Times nessa fase costumam perder dias movendo dados entre coleta e treino.\n\nNa Databricks, o mesmo lakehouse serve as duas etapas. Faz sentido uma conversa de 20 minutos na quinta?\n\nPreparei uma sequência de 3 e-mails para os três papéis do Comitê de compra.',
    },
    {
      tipo: 'aprovacao',
      agenteId: 'rhetor',
      aprovacao: {
        acao: 'Criar sequência de 3 e-mails no HubSpot para o Comitê de compra da OpenAI',
        integracaoId: 'hubspot',
        impacto: '3 contatos entram na sequência; nenhum e-mail sai antes da Aprovação',
        justificativa: 'Scopus deu aderência 87 e Ethos priorizou a Head de Infraestrutura de Dados.',
        origem: 'slack',
      },
    },
  ],
  'ethos-comite-stripe': [
    { tipo: 'ferramenta', agenteId: 'ethos', descricao: 'Buscando no Lusha: cargos de dados e engenharia na Stripe' },
    { tipo: 'ferramenta', agenteId: 'ethos', descricao: 'Consultando Notion: transcrições de discovery com fintechs' },
    {
      tipo: 'texto',
      agenteId: 'ethos',
      texto:
        'Personas do Comitê de compra da Stripe:\n\nHead de Infraestrutura de Dados (decide)\n- Dor: pipelines de risco e fraude duplicados\n- Objeção: "já temos um time de plataforma"\n- Gatilho: novo produto que exige dados em tempo real\n- Onde se informa: blogs de engenharia e conferências de dados\n\nVP de Engenharia (influencia)\n- Dor: plataforma interna difícil de manter\n- Objeção: "migrar vai parar o time por meses"\n- Gatilho: saída de engenheiros-chave da plataforma\n- Onde se informa: colegas de outras fintechs e comunidades técnicas\n\nCFO (aprova acima de US$ 500 mil por ano)\n- Dor: custo de computação imprevisível\n- Objeção: "já pagamos por um data warehouse"\n- Gatilho: revisão de orçamento anual\n- Onde se informa: relatórios de analistas e colegas de outras fintechs',
    },
  ],
  'ethos-objecoes-cfo': [
    { tipo: 'ferramenta', agenteId: 'ethos', descricao: 'Consultando HubSpot: motivos de perda com CFO envolvido' },
    {
      tipo: 'texto',
      agenteId: 'ethos',
      texto:
        'As três objeções mais comuns de CFOs, pelos negócios perdidos:\n\n- "O custo de computação é imprevisível." Resposta: mostrar limites de orçamento por workspace.\n- "Já pagamos por um data warehouse." Resposta: comparar o custo total de manter dois sistemas.\n- "O retorno demora." Resposta: começar por um caso de uso com resultado em 90 dias.',
    },
  ],
  'rhetor-email-meta': [
    { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultando o tom de voz e a base de conhecimento da Databricks' },
    { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultando HubSpot: interações anteriores com a Meta' },
    {
      tipo: 'texto',
      agenteId: 'rhetor',
      texto:
        'Assunto: um lakehouse para os dados de recomendação\n\nOi, Renata. Times de recomendação do tamanho do seu costumam manter dados de treino e de análise em sistemas separados, e pagam duas vezes por isso.\n\nA Databricks junta os dois no mesmo lugar, com governança única. Posso mostrar em 20 minutos como a Shell fez essa migração?\n\n(84 palavras, um único pedido.)',
    },
  ],
  'rhetor-sequencia': [
    { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultando as personas do Ethos para VP de Engenharia' },
    {
      tipo: 'texto',
      agenteId: 'rhetor',
      texto:
        'Sequência de 4 toques para VPs de Engenharia:\n\n- Dia 1, e-mail: o custo de manter uma plataforma de dados interna\n- Dia 3, LinkedIn: comentário num post técnico do VP, sem pitch\n- Dia 7, e-mail: caso de migração em 8 semanas, com números\n- Dia 14, e-mail curto: "faz sentido falar agora ou no próximo trimestre?"',
    },
  ],
  'oraculum-auditoria': [
    { tipo: 'ferramenta', agenteId: 'oraculum', descricao: 'Consultando ChatGPT, Perplexity, Gemini e Claude com 12 prompts-alvo' },
    {
      tipo: 'texto',
      agenteId: 'oraculum',
      texto:
        'Para "melhor plataforma de dados para IA":\n\n- ChatGPT: citada em 3 de 3 respostas, sempre em segundo lugar\n- Perplexity: citada em 1 de 3; a Snowflake aparece nas 3\n- Gemini: citada em 2 de 3\n- Claude: citada em 3 de 3, com link para a documentação\n\nO ponto fraco é o Perplexity, que cita comparativos recentes. A Databricks não tem um comparativo publicado em 2026.',
    },
  ],
  'oraculum-conteudo': [
    { tipo: 'ferramenta', agenteId: 'oraculum', descricao: 'Consultando Perplexity: fontes citadas nos prompts-alvo' },
    {
      tipo: 'texto',
      agenteId: 'oraculum',
      texto:
        'O Perplexity cita páginas com dados verificáveis e data recente. Três pautas:\n\n- Benchmark público de custo por consulta, com metodologia aberta\n- Guia "lakehouse vs. data warehouse em 2026", com tabela comparativa\n- Estudo de caso com números de um cliente brasileiro\n\nPosso mandar as pautas para o Notion.',
    },
  ],
}

const FERRAMENTAS_DA_RESPOSTA_GENERICA: Record<EspecialidadeId, string> = {
  scopus: 'Consultando HubSpot e Clay',
  ethos: 'Consultando Lusha e Notion',
  rhetor: 'Consultando o tom de voz e a base de conhecimento',
  oraculum: 'Consultando Perplexity, ChatGPT, Gemini e Claude',
}

const noProduto = (nome: string) => `No produto, ${nome} responderia com os dados das Integrações do Workspace.`

/** Resposta para texto livre: o protótipo não entende pedidos fora do roteiro. `nome` é o do Agente que responde. */
export function respostaGenerica(especialidadeId: EspecialidadeId, nome: string): PassoDeRoteiro[] {
  return [
    { tipo: 'ferramenta', agenteId: especialidadeId, descricao: FERRAMENTAS_DA_RESPOSTA_GENERICA[especialidadeId] },
    {
      tipo: 'texto',
      agenteId: especialidadeId,
      texto: `Ainda não tenho um roteiro para esse pedido nesta demonstração. ${noProduto(nome)} Experimente uma das sugestões abaixo.`,
    },
  ]
}

const COMPLEMENTO_DA_MENCAO: Record<EspecialidadeId, string> = {
  scopus: 'Do lado do ICP: a Conta-alvo desta Conversa tem aderência alta; vale priorizar.',
  ethos: 'Do lado do Comitê de compra: quem decide aqui costuma ser a Head de Infraestrutura de Dados, e a objeção mais provável é o tempo de migração.',
  rhetor: 'Do lado da escrita: sugiro abrir com um dado do próprio cliente e fechar com um único pedido de 20 minutos.',
  oraculum: 'Do lado da presença em IA: a Databricks aparece em 29 de 48 respostas dos LLMs; um comparativo recente ajudaria.',
}

type AgenteDaMencao = { id: AgenteId; nome: string; especialidadeId: EspecialidadeId }

/** Quando outro Agente é mencionado com @ numa Conversa. */
export function respostaDeMencao(de: AgenteId, para: AgenteDaMencao): PassoDeRoteiro<AgenteId>[] {
  return [
    { tipo: 'repasse', de, para: para.id, resumo: 'Contexto da Conversa até aqui' },
    {
      tipo: 'texto',
      agenteId: para.id,
      texto: `${para.nome} entrou na Conversa.\n\n${COMPLEMENTO_DA_MENCAO[para.especialidadeId]}`,
    },
  ]
}

/**
 * Um passo de roteiro coordenado, escrito por Especialidade como os da Conversa: a fonte troca cada
 * Especialidade pelo Agente que a Coordenação chama. A ação vira Aprovação ou não pela Permissão dele.
 */
export type PassoDeRoteiroCoordenado<Ator = EspecialidadeId> =
  | { tipo: 'chamada'; agenteId: Ator }
  | { tipo: 'ferramenta'; agenteId: Ator; descricao: string }
  | { tipo: 'feito'; agenteId: Ator; resumo: string }
  | { tipo: 'resposta'; texto: string }
  | { tipo: 'acao'; agenteId: Ator; acao: AcaoProposta }

export interface RoteiroCoordenado {
  /** O pedido, que também é a sugestão clicável abaixo do composer. */
  pedido: Sugestao
  passos: PassoDeRoteiroCoordenado[]
  /** Pedidos seguintes no mesmo fio, reconhecidos por um termo, que partem do que este roteiro fez. */
  continuacoes?: { termo: string; passos: PassoDeRoteiroCoordenado[] }[]
}

export const roteirosCoordenados: RoteiroCoordenado[] = [
  {
    pedido: { id: 'coordenacao-openai', texto: 'Monte a abordagem completa para a OpenAI' },
    passos: [
      { tipo: 'chamada', agenteId: 'scopus' },
      { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Consultou HubSpot: histórico da OpenAI' },
      { tipo: 'ferramenta', agenteId: 'scopus', descricao: 'Buscou no Apollo: sinais públicos da OpenAI' },
      {
        tipo: 'feito',
        agenteId: 'scopus',
        resumo: 'Deu aderência de 87 ao ICP. Sinal mais forte: três vagas abertas para engenharia de dados de avaliação.',
      },
      { tipo: 'chamada', agenteId: 'ethos' },
      { tipo: 'ferramenta', agenteId: 'ethos', descricao: 'Buscou no Lusha: cargos do Comitê de compra' },
      { tipo: 'feito', agenteId: 'ethos', resumo: 'Mapeou 3 papéis do Comitê de compra e priorizou a Head de Infraestrutura de Dados.' },
      { tipo: 'chamada', agenteId: 'rhetor' },
      { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
      { tipo: 'feito', agenteId: 'rhetor', resumo: 'Escreveu o primeiro e-mail e uma sequência de 3 toques, no tom da Databricks.' },
      {
        tipo: 'resposta',
        texto:
          'A OpenAI é Conta-alvo prioritária (aderência 87). A abordagem começa pela Head de Infraestrutura de Dados, com o argumento de tempo entre coleta e treino.\n\n- Assunto: dados de avaliação em horas, não em dias\n- Sequência de 3 e-mails, um por papel do Comitê de compra\n- Próximo passo: aprovar a sequência no HubSpot',
      },
      {
        tipo: 'acao',
        agenteId: 'rhetor',
        acao: {
          acao: 'Criar sequência de 3 e-mails no HubSpot para o Comitê de compra da OpenAI',
          integracaoId: 'hubspot',
          impacto: '3 contatos entram na sequência; nenhum e-mail sai antes da Aprovação',
          justificativa: 'Scopus deu aderência 87 e Ethos priorizou a Head de Infraestrutura de Dados.',
        },
      },
    ],
    continuacoes: [
      {
        termo: 'cfo',
        passos: [
          { tipo: 'chamada', agenteId: 'rhetor' },
          { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultou HubSpot: o CFO no Comitê de compra da OpenAI' },
          { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
          {
            tipo: 'feito',
            agenteId: 'rhetor',
            resumo: 'Escreveu um e-mail para o CFO da OpenAI, com o argumento de custo, a partir da aderência e do Comitê de compra já levantados no fio.',
          },
          {
            tipo: 'resposta',
            texto:
              'E-mail para o CFO da OpenAI, na mesma abordagem: o argumento técnico fica com a Head de Infraestrutura de Dados, e o CFO recebe o de custo.\n\n- Assunto: o custo de cada ciclo de avaliação\n- Abertura: as três vagas abertas para engenharia de dados de avaliação\n- Argumento: menos tempo entre coleta e treino reduz o custo por modelo avaliado\n- Pedido: 20 minutos com o time financeiro e a Head de Infraestrutura de Dados',
          },
        ],
      },
    ],
  },
  {
    pedido: { id: 'coordenacao-perplexity', texto: 'Como estamos no Perplexity e o que publicar?' },
    passos: [
      { tipo: 'chamada', agenteId: 'oraculum' },
      { tipo: 'ferramenta', agenteId: 'oraculum', descricao: 'Perguntou ao Perplexity os 12 prompts-alvo' },
      { tipo: 'ferramenta', agenteId: 'oraculum', descricao: 'Comparou as fontes citadas com as da Snowflake' },
      {
        tipo: 'feito',
        agenteId: 'oraculum',
        resumo:
          'Auditou 12 prompts-alvo no Perplexity: a Databricks é citada em 5, e a Snowflake aparece antes dela em 7. As fontes citadas são comparativos recentes, e a Databricks não tem um publicado em 2026.',
      },
      { tipo: 'chamada', agenteId: 'rhetor' },
      { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
      { tipo: 'ferramenta', agenteId: 'rhetor', descricao: 'Buscou no Notion: pautas e materiais já publicados' },
      { tipo: 'feito', agenteId: 'rhetor', resumo: 'Propôs 3 conteúdos para as lacunas que o Oraculum encontrou, no tom da Databricks.' },
      {
        tipo: 'resposta',
        texto:
          'No Perplexity, a Databricks é citada em 5 de 12 prompts-alvo, e a Snowflake aparece antes dela em 7. O Perplexity prefere páginas com dados verificáveis e data recente.\n\n- Primeiro: o comparativo "lakehouse vs. data warehouse em 2026", com tabela e metodologia aberta\n- Depois: um benchmark público de custo por consulta\n- Por fim: um estudo de caso com números de um cliente brasileiro',
      },
    ],
  },
]

/** A etapa de um Agente chamado num pedido fora do roteiro: a resposta genérica dele. */
export function etapaGenerica(agente: AgenteDaMencao): PassoDeRoteiroCoordenado<AgenteId>[] {
  return [
    { tipo: 'chamada', agenteId: agente.id },
    { tipo: 'ferramenta', agenteId: agente.id, descricao: FERRAMENTAS_DA_RESPOSTA_GENERICA[agente.especialidadeId] },
    { tipo: 'feito', agenteId: agente.id, resumo: `Ainda sem roteiro para esse pedido nesta demonstração. ${noProduto(agente.nome)}` },
  ]
}

/** A resposta consolidada de um pedido fora do roteiro, que juntaria o trabalho dos Agentes chamados. */
export function consolidadaGenerica(nomes: string[]): PassoDeRoteiroCoordenado<AgenteId> {
  const quem = nomes.length === 1 ? `${nomes[0]} trabalhou` : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} trabalharam`
  return {
    tipo: 'resposta',
    texto: `${quem} neste pedido. Ainda não há um roteiro para ele nesta demonstração; no produto, a resposta juntaria aqui o que cada agente fez.`,
  }
}

/** Um pedido genérico, sem @: a Coordenação responde direto, sem chamar nenhum Agente. */
export const RESPOSTA_DIRETA: PassoDeRoteiroCoordenado<AgenteId> = {
  tipo: 'resposta',
  texto:
    'Ainda não há um roteiro para esse pedido nesta demonstração. No produto, a Althius responderia direto a perguntas gerais como esta, sem chamar nenhum agente, e chamaria os agentes quando o pedido precisasse de uma Especialidade.\n\nPara ver a Coordenação trabalhar, use uma sugestão da página de Agentes ou mencione um agente com @.',
}

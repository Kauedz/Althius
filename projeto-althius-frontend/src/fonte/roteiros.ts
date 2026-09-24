// Roteiros pré-gravados da Conversa e da Coordenação. Valem só para o protótipo (ADR 0003):
// no produto real, os Agentes respondem de forma robusta a qualquer entrada.
import { normalizarNome } from './mencoes'
import type { AcaoProposta, AgenteId, Aprovacao, EspecialidadeId, Sugestao } from './tipos'

/**
 * Um passo de roteiro. Os roteiros são escritos por Especialidade (`ator` guarda um EspecialidadeId),
 * e a fonte troca cada Especialidade pelo Agente que faz o passo (`ator` passa a guardar um AgenteId).
 * A Aprovação é criada pela fonte no momento em que o passo acontece.
 */
export type PassoDeRoteiro<Ator = EspecialidadeId> =
  | { tipo: 'ferramenta'; ator: Ator; descricao: string }
  | { tipo: 'texto'; ator: Ator; texto: string }
  | { tipo: 'repasse'; de: Ator; para: Ator; resumo: string }
  | { tipo: 'aprovacao'; ator: Ator; aprovacao: Omit<Aprovacao, 'id' | 'estado' | 'agenteId' | 'gatilho'> }

export const roteiros: Record<string, PassoDeRoteiro[]> = {
  'scopus-aderencia': [
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultando HubSpot: negócios ganhos e perdidos nos últimos 18 meses' },
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Buscando no Clay: firmografia e tecnologia da OpenAI' },
    {
      tipo: 'texto',
      ator: 'scopus',
      texto:
        'Aderência ao ICP: 87 de 100.\n\nO que pesa a favor:\n- Time de dados e de infraestrutura com mais de 400 pessoas\n- Volume de dados de treino e avaliação que cresce a cada modelo\n- Já usa Spark em parte dos pipelines\n\nO que pesa contra:\n- Infraestrutura própria madura, o que alonga o ciclo de venda\n\nSugiro tratar como Conta-alvo prioritária e começar pelo time de avaliação de modelos.',
    },
  ],
  'scopus-revisar-icp': [
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultando HubSpot: 38 negócios ganhos em 2026' },
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Buscando no Apollo: tamanho dos times de dados desses clientes' },
    {
      tipo: 'texto',
      ator: 'scopus',
      texto:
        'Revisei o ICP com os 38 clientes que fecharam em 2026.\n\nMudanças propostas:\n- Tamanho mínimo sobe de 1.000 para 2.000 funcionários\n- Entra um critério novo: time de dados próprio com 20 pessoas ou mais\n- Setores com maior conversão: tecnologia, serviços financeiros e saúde\n\nCom o ICP novo, 212 Contas-alvo da base deixam de ser prioritárias e 64 entram.',
    },
  ],
  'colaboracao-openai': [
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultando HubSpot: histórico da OpenAI' },
    { tipo: 'ferramenta', ator: 'scopus', descricao: 'Buscando no Apollo: sinais públicos da OpenAI' },
    { tipo: 'texto', ator: 'scopus', texto: 'A OpenAI tem aderência de 87 ao ICP. O sinal mais forte: três vagas abertas para engenharia de dados de avaliação.' },
    { tipo: 'repasse', de: 'scopus', para: 'ethos', resumo: 'Aderência 87 · foco em dados de avaliação de modelos' },
    { tipo: 'ferramenta', ator: 'ethos', descricao: 'Buscando no Lusha: cargos do Comitê de compra' },
    {
      tipo: 'texto',
      ator: 'ethos',
      texto:
        'Comitê de compra da OpenAI: Carla Nogueira (Head de Infraestrutura de Dados), Diego Alves (VP de Engenharia) e Helena Prado (Procurement).\n\n- Carla Nogueira, Head de Infraestrutura de Dados (decide): quer menos tempo entre coleta e treino\n- Diego Alves, VP de Engenharia (influencia): teme migração longa\n- Helena Prado, Procurement (aprova): exige previsibilidade de custo\n\nPrioridade: Carla Nogueira, Head de Infraestrutura de Dados.',
    },
    { tipo: 'repasse', de: 'ethos', para: 'rhetor', resumo: '3 personas · prioridade: Head de Infraestrutura de Dados' },
    { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultando o tom de voz e a base de conhecimento da Databricks' },
    {
      tipo: 'texto',
      ator: 'rhetor',
      texto:
        'Assunto: dados de avaliação em horas, não em dias\n\nOi, Carla Nogueira. Vi que a OpenAI abriu três vagas para engenharia de dados de avaliação. Times nessa fase, no papel de head de infraestrutura de dados, costumam perder dias movendo dados entre coleta e treino.\n\nNa Databricks, o mesmo lakehouse serve as duas etapas. Faz sentido uma conversa de 20 minutos na quinta?\n\nPreparei uma sequência de 3 e-mails: um para você, um para Diego Alves (VP de Engenharia) e um para Helena Prado (Procurement).',
    },
    {
      tipo: 'aprovacao',
      ator: 'rhetor',
      aprovacao: {
        acao: 'Criar sequência de 3 e-mails no HubSpot para o Comitê de compra da OpenAI',
        integracaoId: 'hubspot',
        impacto: '3 contatos entram na sequência; nenhum e-mail sai antes da Aprovação',
        justificativa: 'Scopus deu aderência 87 e Ethos priorizou Carla Nogueira, Head de Infraestrutura de Dados.',
        origem: 'slack',
      },
    },
  ],
  'ethos-comite-stripe': [
    { tipo: 'ferramenta', ator: 'ethos', descricao: 'Buscando no Lusha: cargos de dados e engenharia na Stripe' },
    { tipo: 'ferramenta', ator: 'ethos', descricao: 'Consultando Notion: transcrições de discovery com fintechs' },
    {
      tipo: 'texto',
      ator: 'ethos',
      texto:
        'Personas do Comitê de compra da Stripe:\n\nMarina Costa, Head de Infraestrutura de Dados (decide)\n- Dor: pipelines de risco e fraude duplicados\n- Objeção: "já temos um time de plataforma"\n- Gatilho: novo produto que exige dados em tempo real\n- Onde se informa: blogs de engenharia e conferências de dados\n\nPaulo Ribeiro, VP de Engenharia (influencia)\n- Dor: plataforma interna difícil de manter\n- Objeção: "migrar vai parar o time por meses"\n- Gatilho: saída de engenheiros-chave da plataforma\n- Onde se informa: colegas de outras fintechs e comunidades técnicas\n\nBeatriz Lima, CFO (aprova acima de US$ 500 mil por ano)\n- Dor: custo de computação imprevisível\n- Objeção: "já pagamos por um data warehouse"\n- Gatilho: revisão de orçamento anual\n- Onde se informa: relatórios de analistas e colegas de outras fintechs',
    },
  ],
  'ethos-objecoes-cfo': [
    { tipo: 'ferramenta', ator: 'ethos', descricao: 'Consultando HubSpot: motivos de perda com CFO envolvido' },
    {
      tipo: 'texto',
      ator: 'ethos',
      texto:
        'As três objeções mais comuns de CFOs, pelos negócios perdidos:\n\n- "O custo de computação é imprevisível." Resposta: mostrar limites de orçamento por workspace.\n- "Já pagamos por um data warehouse." Resposta: comparar o custo total de manter dois sistemas.\n- "O retorno demora." Resposta: começar por um caso de uso com resultado em 90 dias.',
    },
  ],
  'rhetor-email-meta': [
    { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultando o tom de voz e a base de conhecimento da Databricks' },
    { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultando HubSpot: interações anteriores com a Meta' },
    {
      tipo: 'texto',
      ator: 'rhetor',
      texto:
        'Assunto: um lakehouse para os dados de recomendação\n\nOi, Renata Vasconcelos. Você lidera recomendação na Meta, e times desse tamanho costumam manter dados de treino e de análise em sistemas separados, pagando duas vezes por isso.\n\nA Databricks junta os dois no mesmo lugar, com governança única. Posso mostrar em 20 minutos como a Shell fez essa migração?\n\n(50 palavras, um único pedido.)',
    },
  ],
  'rhetor-sequencia': [
    { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultando as personas do Ethos para VP de Engenharia' },
    {
      tipo: 'texto',
      ator: 'rhetor',
      texto:
        'Sequência de 4 toques para VPs de Engenharia:\n\n- Dia 1, e-mail: o custo de manter uma plataforma de dados interna\n- Dia 3, LinkedIn: comentário num post técnico do VP, sem pitch\n- Dia 7, e-mail: caso de migração em 8 semanas, com números\n- Dia 14, e-mail curto: "faz sentido falar agora ou no próximo trimestre?"',
    },
  ],
  'oraculum-auditoria': [
    { tipo: 'ferramenta', ator: 'oraculum', descricao: 'Consultando ChatGPT, Perplexity, Gemini e Claude com 12 prompts-alvo' },
    {
      tipo: 'texto',
      ator: 'oraculum',
      texto:
        'Para "melhor plataforma de dados para IA":\n\n- ChatGPT: citada em 3 de 3 respostas, sempre em segundo lugar\n- Perplexity: citada em 1 de 3; a Snowflake aparece nas 3\n- Gemini: citada em 2 de 3\n- Claude: citada em 3 de 3, com link para a documentação\n\nO ponto fraco é o Perplexity, que cita comparativos recentes. A Databricks não tem um comparativo publicado em 2026.',
    },
  ],
  'oraculum-conteudo': [
    { tipo: 'ferramenta', ator: 'oraculum', descricao: 'Consultando Perplexity: fontes citadas nos prompts-alvo' },
    {
      tipo: 'texto',
      ator: 'oraculum',
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

/** O que cada Especialidade responde quando o pedido sai do roteiro, em voz dela. */
const RESPOSTA_DA_ESPECIALIDADE: Record<EspecialidadeId, string> = {
  scopus:
    'ICP é o perfil de quem mais tende a comprar. Para uma Conta-alvo, cruzo firmografia, tecnologia e sinais públicos e devolvo uma nota de 0 a 100. Peça a aderência de uma conta, por exemplo a OpenAI, que eu detalho os prós e os contras.',
  ethos:
    'O Comitê de compra costuma ter quem decide, quem influencia e quem aprova. Numa empresa de dados, a Head de Infraestrutura de Dados decide, o VP de Engenharia influencia e o CFO ou Procurement aprova. Diga a Conta-alvo que eu descrevo dores, objeções e gatilhos de cada pessoa.',
  rhetor:
    'Um e-mail frio da Databricks cabe em até 90 palavras, com um dado do cliente e um único pedido. Diga a persona e a Conta-alvo que eu escrevo o assunto e o corpo.',
  oraculum:
    'Presença em IA é em quantas respostas dos LLMs a marca aparece para os prompts-alvo. Na última leitura desta demonstração, a Databricks apareceu em 29 de 48. Diga o motor, por exemplo o Perplexity, que eu detalho as lacunas.',
}

/** Resposta para texto livre: plausível, na voz da Especialidade. `nome` é o do Agente que responde. */
export function respostaGenerica(especialidadeId: EspecialidadeId, nome: string): PassoDeRoteiro[] {
  return [
    { tipo: 'ferramenta', ator: especialidadeId, descricao: FERRAMENTAS_DA_RESPOSTA_GENERICA[especialidadeId] },
    {
      tipo: 'texto',
      ator: especialidadeId,
      texto: `${nome}: ${RESPOSTA_DA_ESPECIALIDADE[especialidadeId]}`,
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
      ator: para.id,
      texto: `${para.nome} entrou na Conversa.\n\n${COMPLEMENTO_DA_MENCAO[para.especialidadeId]}`,
    },
  ]
}

/**
 * Um passo de roteiro coordenado, escrito por Especialidade como os da Conversa: a fonte troca cada
 * Especialidade pelo Agente que a Coordenação chama. A ação vira Aprovação ou não pela Permissão dele.
 */
export type PassoDeRoteiroCoordenado<Ator = EspecialidadeId> =
  | { tipo: 'chamada'; ator: Ator }
  | { tipo: 'ferramenta'; ator: Ator; descricao: string }
  | { tipo: 'feito'; ator: Ator; resumo: string }
  | { tipo: 'resposta'; texto: string }
  | { tipo: 'acao'; ator: Ator; acao: AcaoProposta }
  | { tipo: 'nascimento-sequencia'; ator: Ator; contaId: string; sinal?: string; sequenciaId?: string }

export interface RoteiroCoordenado {
  /** O pedido, que também é a sugestão clicável abaixo do composer. */
  pedido: Sugestao
  passos: PassoDeRoteiroCoordenado[]
  /** Pedidos seguintes na mesma Conversa, reconhecidos por um termo, que partem do que este roteiro fez. */
  continuacoes?: { termo: string; passos: PassoDeRoteiroCoordenado[] }[]
}

export const roteirosCoordenados: RoteiroCoordenado[] = [
  {
    pedido: { id: 'coordenacao-openai', texto: 'Monte a abordagem completa para a OpenAI' },
    passos: [
      { tipo: 'chamada', ator: 'scopus' },
      { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultou HubSpot: histórico da OpenAI' },
      { tipo: 'ferramenta', ator: 'scopus', descricao: 'Buscou no Apollo: sinais públicos da OpenAI' },
      {
        tipo: 'feito',
        ator: 'scopus',
        resumo: 'Deu aderência de 87 ao ICP. Sinal mais forte: três vagas abertas para engenharia de dados de avaliação.',
      },
      { tipo: 'chamada', ator: 'ethos' },
      { tipo: 'ferramenta', ator: 'ethos', descricao: 'Buscou no Lusha: cargos do Comitê de compra' },
      {
        tipo: 'feito',
        ator: 'ethos',
        resumo: 'Mapeou Carla Nogueira (Head de Infraestrutura de Dados), Diego Alves (VP de Engenharia) e Helena Prado (Procurement), e priorizou Carla Nogueira.',
      },
      { tipo: 'chamada', ator: 'rhetor' },
      { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
      { tipo: 'feito', ator: 'rhetor', resumo: 'Escreveu o primeiro e-mail e uma sequência de 3 toques, no tom da Databricks.' },
      {
        tipo: 'resposta',
        texto:
          'A OpenAI é Conta-alvo prioritária (aderência 87). A abordagem começa por Carla Nogueira, Head de Infraestrutura de Dados, com o argumento de tempo entre coleta e treino.\n\n- Assunto: dados de avaliação em horas, não em dias\n- Sequência de 3 e-mails: Carla Nogueira, Diego Alves (VP de Engenharia) e Helena Prado (Procurement)\n- Próximo passo: aprovar a sequência no HubSpot',
      },
      {
        tipo: 'acao',
        ator: 'rhetor',
        acao: {
          acao: 'Criar sequência de 3 e-mails no HubSpot para o Comitê de compra da OpenAI',
          integracaoId: 'hubspot',
          impacto: '3 contatos entram na sequência; nenhum e-mail sai antes da Aprovação',
          justificativa: 'Scopus deu aderência 87 e Ethos priorizou Carla Nogueira, Head de Infraestrutura de Dados.',
        },
      },
    ],
    continuacoes: [
      {
        termo: 'cfo',
        passos: [
          { tipo: 'chamada', ator: 'rhetor' },
          { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultou HubSpot: o CFO no Comitê de compra da OpenAI' },
          { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
          {
            tipo: 'feito',
            ator: 'rhetor',
            resumo: 'Escreveu um e-mail para o CFO da OpenAI, com o argumento de custo, a partir da aderência e do Comitê de compra já levantados nesta Conversa.',
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
      { tipo: 'chamada', ator: 'oraculum' },
      { tipo: 'ferramenta', ator: 'oraculum', descricao: 'Perguntou ao Perplexity os 12 prompts-alvo' },
      { tipo: 'ferramenta', ator: 'oraculum', descricao: 'Comparou as fontes citadas com as da Snowflake' },
      {
        tipo: 'feito',
        ator: 'oraculum',
        resumo:
          'Auditou 12 prompts-alvo no Perplexity: a Databricks é citada em 5, e a Snowflake aparece antes dela em 7. As fontes citadas são comparativos recentes, e a Databricks não tem um publicado em 2026.',
      },
      { tipo: 'chamada', ator: 'rhetor' },
      { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Consultou o tom de voz e a base de conhecimento' },
      { tipo: 'ferramenta', ator: 'rhetor', descricao: 'Buscou no Notion: pautas e materiais já publicados' },
      { tipo: 'feito', ator: 'rhetor', resumo: 'Propôs 3 conteúdos para as lacunas que o Oraculum encontrou, no tom da Databricks.' },
      {
        tipo: 'resposta',
        texto:
          'No Perplexity, a Databricks é citada em 5 de 12 prompts-alvo, e a Snowflake aparece antes dela em 7. O Perplexity prefere páginas com dados verificáveis e data recente.\n\n- Primeiro: o comparativo "lakehouse vs. data warehouse em 2026", com tabela e metodologia aberta\n- Depois: um benchmark público de custo por consulta\n- Por fim: um estudo de caso com números de um cliente brasileiro',
      },
    ],
  },
  {
    pedido: { id: 'coordenacao-sequencia-sinal', texto: 'Montar sequência para Conta Quente com Sinal' },
    passos: [
      { tipo: 'chamada', ator: 'scopus' },
      { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultou HubSpot e Apollo: identificou Conta Quente com Sinal' },
      {
        tipo: 'feito',
        ator: 'scopus',
        resumo: 'OpenAI é Conta Quente (aderência 87). Sinal mais forte: três vagas abertas para engenharia de dados de avaliação.',
      },
      { tipo: 'chamada', ator: 'ethos' },
      { tipo: 'ferramenta', ator: 'ethos', descricao: 'Mapeou o Comitê de compra da OpenAI' },
      {
        tipo: 'feito',
        ator: 'ethos',
        resumo:
          'Mapeou Carla Nogueira (Head de Infraestrutura de Dados, decide), Diego Alves (VP de Engenharia, influencia) e Helena Prado (Procurement, aprova).',
      },
      {
        tipo: 'resposta',
        texto:
          'A OpenAI tem sinal quente recente e Comitê mapeado. A Coordenação oferece estruturar uma sequência de abordagem multicanal com o Rhetor. Confirme abaixo para iniciar.',
      },
      {
        tipo: 'nascimento-sequencia',
        ator: 'rhetor',
        contaId: 'openai',
        sinal: 'Abriu 3 vagas de engenharia de dados de avaliação',
      },
    ],
  },
  {
    pedido: { id: 'coordenacao-sequencia-okta', texto: 'Montar sequência para Conta com 1 Contato (Okta)' },
    passos: [
      { tipo: 'chamada', ator: 'scopus' },
      { tipo: 'ferramenta', ator: 'scopus', descricao: 'Consultou HubSpot e Apollo: histórico da Okta' },
      {
        tipo: 'feito',
        ator: 'scopus',
        resumo: 'Okta é Conta Quente. Sinal recente: Anunciou nova rodada de expansão em segurança de identidade.',
      },
      { tipo: 'chamada', ator: 'ethos' },
      { tipo: 'ferramenta', ator: 'ethos', descricao: 'Mapeou contatos da Okta' },
      {
        tipo: 'feito',
        ator: 'ethos',
        resumo: 'Identificou 1 contato-chave mapeado: Fernando Guedes (Líder técnico).',
      },
      {
        tipo: 'resposta',
        texto:
          'A Okta tem sinal recente e 1 contato-chave mapeado. Mesmo com um único contato, uma sequência focada é recomendada. A Coordenação oferece montar a sequência com o Rhetor.',
      },
      {
        tipo: 'nascimento-sequencia',
        ator: 'rhetor',
        contaId: 'okta',
        sinal: 'Anunciou nova rodada de expansão em segurança de identidade',
      },
    ],
  },
]

/** A etapa de um Agente chamado num pedido fora do roteiro: a resposta genérica dele. */
export function etapaGenerica(agente: AgenteDaMencao): PassoDeRoteiroCoordenado<AgenteId>[] {
  return [
    { tipo: 'chamada', ator: agente.id },
    { tipo: 'ferramenta', ator: agente.id, descricao: FERRAMENTAS_DA_RESPOSTA_GENERICA[agente.especialidadeId] },
    { tipo: 'feito', ator: agente.id, resumo: `${agente.nome}: ${RESPOSTA_DA_ESPECIALIDADE[agente.especialidadeId]}` },
  ]
}

/** A resposta consolidada de um pedido fora do roteiro, juntando o que cada Agente chamado entregou. */
export function consolidadaGenerica(nomes: string[]): PassoDeRoteiroCoordenado<AgenteId> {
  const quem = nomes.length === 1 ? `${nomes[0]} respondeu` : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} responderam`
  return {
    tipo: 'resposta',
    texto: `${quem} a partir da Especialidade de cada um. O pedido não estava num roteiro, e a resposta junta o que cada agente entregou acima.`,
  }
}

/** Um pedido genérico, sem @: a Coordenação responde direto, sem chamar nenhum Agente. */
export function respostaDireta(texto: string): PassoDeRoteiroCoordenado<AgenteId> {
  const pedido = normalizarNome(texto)
  if (pedido.includes('icp')) {
    return {
      tipo: 'resposta',
      texto:
        'ICP é o perfil da empresa que mais tende a comprar: setor, tamanho, tecnologia e sinais de compra.\n\n- Nesta demonstração, o Scopus dá uma nota de aderência de 0 a 100 a cada Conta-alvo\n- A nota usa clientes que já fecharam, firmografia e sinais públicos\n- Uma pergunta geral como esta eu respondo direto, sem chamar nenhum agente',
    }
  }
  return {
    tipo: 'resposta',
    texto: `Dá para responder "${texto.trim()}" sem chamar um agente.\n\n- ICP é o perfil de quem mais tende a comprar\n- Aderência é a nota de uma Conta-alvo nesse perfil\n- Comitê de compra é quem decide, influencia e aprova\n\nSe o pedido precisar de uma Especialidade, mencione um agente com @ ou use uma sugestão.`,
  }
}

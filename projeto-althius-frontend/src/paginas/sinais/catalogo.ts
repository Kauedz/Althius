// Catálogo do mockup do módulo Sinais (ticket 01). Mostra a abrangência desejada, não promete coleta real:
// tipos da mesma família compartilham o mesmo formulário de critérios.

import type { Criterios, Familia, Formulario, Origem, TipoDeSinal } from '@/fonte/sinais-tipos'

export type { Criterios, Familia, Formulario, Origem, TipoDeSinal }

export const ROTULO_DA_ORIGEM: Record<Origem, string> = {
  externo: 'Externo',
  interno: 'Interno',
  originado: 'Originado',
}

export const ROTULO_DA_ORIGEM_NO_PLURAL: Record<Origem, string> = {
  externo: 'Externos',
  interno: 'Internos',
  originado: 'Originados',
}

export const FAMILIAS: Familia[] = [
  { id: 'vagas-e-equipes', nome: 'Vagas e equipes', origem: 'externo', formulario: 'vagas', descoberta: true },
  { id: 'movimentacao-profissional', nome: 'Movimentação profissional', origem: 'externo', formulario: 'pessoas', descoberta: true },
  { id: 'capital-e-financas', nome: 'Capital e finanças', origem: 'externo', formulario: 'capital', descoberta: true },
  { id: 'expansao-e-registros', nome: 'Expansão e registros', origem: 'externo', formulario: 'expansao', descoberta: true },
  { id: 'tecnologia', nome: 'Tecnologia', origem: 'externo', formulario: 'tecnologia', descoberta: true },
  { id: 'noticias-e-iniciativas', nome: 'Notícias e iniciativas', origem: 'externo', formulario: 'noticias', descoberta: true },
  { id: 'eventos-e-conteudo', nome: 'Eventos e conteúdo', origem: 'externo', formulario: 'eventos', descoberta: true },
  { id: 'anuncios', nome: 'Anúncios', origem: 'externo', formulario: 'anuncios', descoberta: false },
  { id: 'reputacao-e-concorrencia', nome: 'Reputação e concorrência', origem: 'externo', formulario: 'reputacao', descoberta: true },
  { id: 'comunidades-e-intencao', nome: 'Comunidades e intenção', origem: 'externo', formulario: 'comunidade', descoberta: true },
  { id: 'comportamento-no-site', nome: 'Comportamento no site', origem: 'interno', formulario: 'site', descoberta: true },
  { id: 'historico-comercial', nome: 'Histórico comercial', origem: 'interno', formulario: 'historico', descoberta: false },
  { id: 'testes-e-verificacoes', nome: 'Testes e verificações', origem: 'originado', formulario: 'verificacao', descoberta: true },
]

export const TIPOS: TipoDeSinal[] = [
  // Vagas e equipes
  { id: 'abertura-de-vagas', familiaId: 'vagas-e-equipes', nome: 'Abertura de vagas', descricao: 'Acompanha vagas publicadas para as funções que você escolher, com localização e período.' },
  { id: 'vagas-no-indeed', familiaId: 'vagas-e-equipes', nome: 'Vagas no Indeed', descricao: 'Acompanha as vagas que a empresa publica no Indeed; a vaga que também está no LinkedIn conta uma vez.' },
  { id: 'primeira-contratacao', familiaId: 'vagas-e-equipes', nome: 'Primeira contratação de uma função', descricao: 'Avisa quando a empresa abre a primeira vaga de uma função que ainda não tinha, como a primeira pessoa de dados.', padroes: { funcoes: ['Engenharia de dados'], senioridade: 'Liderança' } },
  { id: 'contratacao-gtm-revops', familiaId: 'vagas-e-equipes', nome: 'Contratações de GTM e RevOps', descricao: 'Encontra a primeira liderança de RevOps ou operações de vendas, o momento em que o time começa a sistematizar.', padroes: { funcoes: ['RevOps e GTM'], senioridade: 'Liderança' } },
  { id: 'crescimento-de-equipes', familiaId: 'vagas-e-equipes', nome: 'Crescimento ou redução de equipes', descricao: 'Acompanha o quadro por função a cada trimestre e aponta os times que crescem ou encolhem mais que a empresa.', padroes: { funcoes: ['Engenharia de dados', 'IA e machine learning'], senioridade: 'Qualquer' } },
  { id: 'dores-em-vagas', familiaId: 'vagas-e-equipes', nome: 'Dores e projetos descritos em vagas', descricao: 'Lê como a empresa descreve o problema nas vagas e relaciona o texto às dores que você resolve.', padroes: { funcoes: ['Engenharia de dados'], palavras: 'modernização, migração, gargalos de escala' } },
  // Movimentação profissional
  { id: 'nova-lideranca', familiaId: 'movimentacao-profissional', nome: 'Nova liderança', descricao: 'Detecta a chegada de uma nova liderança nas áreas que decidem a sua compra.', padroes: { cargos: ['CDO', 'CTO'], movimento: ['Chegada'] } },
  { id: 'novas-contratacoes', familiaId: 'movimentacao-profissional', nome: 'Novas contratações', descricao: 'Registra quem entrou nos cargos do seu comitê de compra nos primeiros meses de casa.', padroes: { cargos: ['Head de Dados', 'VP de Engenharia'], movimento: ['Chegada'] } },
  { id: 'promocoes', familiaId: 'movimentacao-profissional', nome: 'Promoções', descricao: 'Avisa quando um Contato é promovido e passa a ter orçamento ou poder de decisão.', padroes: { movimento: ['Promoção'], pessoas: 'Contatos das Contas-alvo' } },
  { id: 'anuncio-de-movimentacao', familiaId: 'movimentacao-profissional', nome: 'Anúncio público de movimentação', descricao: 'Lê os posts do LinkedIn em que alguém da empresa anuncia um novo cargo, uma promoção ou uma chegada.', padroes: { movimento: ['Chegada', 'Promoção'] } },
  { id: 'antigos-compradores', familiaId: 'movimentacao-profissional', nome: 'Antigos compradores em nova empresa', descricao: 'Segue compradores e campeões antigos até o próximo emprego e avisa quando chegam a uma empresa do seu ICP.', padroes: { movimento: ['Mudança de empresa'], pessoas: 'Compradores de negócios ganhos' } },
  // Capital e finanças
  { id: 'rodadas', familiaId: 'capital-e-financas', nome: 'Rodadas de investimento', descricao: 'Capta rodadas anunciadas e discretas e confere o plano de contratação que vem depois.', padroes: { eventos: ['Rodada'], valor: 'US$ 50 mi ou mais' } },
  { id: 'fusoes-aquisicoes', familiaId: 'capital-e-financas', nome: 'Fusões e aquisições', descricao: 'Acompanha compras, fusões e integrações, que costumam reabrir decisões de fornecedor.', padroes: { eventos: ['Fusão ou aquisição'] } },
  { id: 'investimentos-anunciados', familiaId: 'capital-e-financas', nome: 'Investimentos anunciados', descricao: 'Encontra planos de investimento divulgados em fatos relevantes, na imprensa e em relatórios.', padroes: { eventos: ['Investimento anunciado'] } },
  { id: 'situacao-financeira', familiaId: 'capital-e-financas', nome: 'Situação financeira e crédito', descricao: 'Observa mudanças de classificação de crédito, resultados e indicadores financeiros publicados.', padroes: { eventos: ['Mudança de crédito'] } },
  { id: 'reestruturacao', familiaId: 'capital-e-financas', nome: 'Reestruturações', descricao: 'Detecta reestruturações e cortes anunciados, que mudam as prioridades de compra.', padroes: { eventos: ['Reestruturação'] } },
  // Expansão e registros
  { id: 'novo-escritorio', familiaId: 'expansao-e-registros', nome: 'Novo escritório ou unidade', descricao: 'Identifica um novo endereço em vagas e registros, e as contratações que vêm em seguida.', padroes: { eventos: ['Nova unidade'] } },
  { id: 'expansao-geografica', familiaId: 'expansao-e-registros', nome: 'Expansão geográfica', descricao: 'Avisa quando a empresa passa a operar num novo estado ou país.', padroes: { eventos: ['Novo estado ou país'] } },
  { id: 'terrenos-imoveis', familiaId: 'expansao-e-registros', nome: 'Terrenos e imóveis', descricao: 'Acompanha compra e locação de terrenos, galpões e imóveis comerciais.', padroes: { eventos: ['Terreno ou imóvel'] } },
  { id: 'alvaras-de-obras', familiaId: 'expansao-e-registros', nome: 'Licenças e alvarás de obras', descricao: 'Lê publicações municipais de alvarás e licenças de construção e reforma.', padroes: { eventos: ['Alvará de obra'] } },
  { id: 'registros-empresariais', familiaId: 'expansao-e-registros', nome: 'Registros empresariais', descricao: 'Lê alterações na junta comercial: nova atividade, capital social, filiais e sócios.', padroes: { eventos: ['Alteração na junta comercial'] } },
  { id: 'licitacoes', familiaId: 'expansao-e-registros', nome: 'Licitações e contratos públicos', descricao: 'Encontra editais e contratos públicos conquistados que exigem entrega e estrutura.', padroes: { eventos: ['Licitação ou contrato público'] } },
  // Tecnologia
  { id: 'mudanca-de-ferramenta', familiaId: 'tecnologia', nome: 'Adoção, troca ou retirada de ferramenta', descricao: 'Detecta uma ferramenta nova nas vagas, no DNS e no site de uma Conta-alvo, e o que ela substituiu.' },
  { id: 'tecnologia-identificada', familiaId: 'tecnologia', nome: 'Tecnologia identificada', descricao: 'Mapeia a tecnologia citada em registros, vagas e no código público do site.', padroes: { mudanca: ['Adoção'], fontes: ['Site e DNS', 'Vagas', 'Registros públicos'] } },
  { id: 'migracoes', familiaId: 'tecnologia', nome: 'Migrações anunciadas', descricao: 'Encontra anúncios de migração de nuvem, de dados ou de ERP.', padroes: { mudanca: ['Troca'], fontes: ['Notícias'] } },
  { id: 'certificacoes', familiaId: 'tecnologia', nome: 'Certificações', descricao: 'Avisa quando a empresa busca ou conquista certificações como ISO 27001 e SOC 2.', formulario: 'seguranca', padroes: { acontecimentos: ['Certificação em andamento', 'Certificação conquistada'], normas: ['ISO 27001', 'SOC 2'] } },
  { id: 'incidentes', familiaId: 'tecnologia', nome: 'Incidentes públicos de segurança', descricao: 'Acompanha incidentes divulgados publicamente, sempre com fonte e data.', formulario: 'seguranca', padroes: { acontecimentos: ['Incidente divulgado'] } },
  // Notícias e iniciativas
  { id: 'noticias-relevantes', familiaId: 'noticias-e-iniciativas', nome: 'Notícias relevantes', descricao: 'Filtra as notícias sobre a empresa pelos temas que importam para a sua venda.', padroes: { temas: ['Modernização de dados', 'IA generativa'], fontes: ['Imprensa'] } },
  { id: 'lancamentos', familiaId: 'noticias-e-iniciativas', nome: 'Lançamento de produto', descricao: 'Percebe lançamentos que exigem novos dados, integrações ou escala.', padroes: { temas: ['IA generativa'], fontes: ['Comunicados oficiais', 'Imprensa'] } },
  { id: 'novos-projetos', familiaId: 'noticias-e-iniciativas', nome: 'Novo projeto ou mudança estratégica', descricao: 'Encontra projetos e mudanças de estratégia anunciados pela liderança.', padroes: { temas: ['Modernização de dados'], fontes: ['Comunicados oficiais', 'Imprensa'] } },
  { id: 'parcerias', familiaId: 'noticias-e-iniciativas', nome: 'Parcerias', descricao: 'Acompanha parcerias anunciadas com fornecedores, integradores e canais.', padroes: { temas: ['Modernização de dados', 'IA generativa'], fontes: ['Comunicados oficiais', 'Imprensa'] } },
  { id: 'mencao-de-parceiro', familiaId: 'noticias-e-iniciativas', nome: 'Menção por parceiro ou investidor', descricao: 'Percebe quando um parceiro, agência ou investidor cita uma empresa que você deveria conhecer.', padroes: { fontes: ['Parceiros e investidores'] } },
  // Eventos e conteúdo
  { id: 'conferencias', familiaId: 'eventos-e-conteudo', nome: 'Fóruns e conferências', descricao: 'Cruza listas de palestrantes e participantes com contas e cargos do ICP antes do evento.', padroes: { papeis: ['Palestrante', 'Participante'], temas: ['IA generativa'] } },
  { id: 'podcasts-entrevistas', familiaId: 'eventos-e-conteudo', nome: 'Podcasts e entrevistas', descricao: 'Encontra compradores falando em podcasts e entrevistas e traz o trecho que abre a conversa.', padroes: { papeis: ['Entrevistado'], temas: ['Modernização de dados'] } },
  { id: 'publicacoes', familiaId: 'eventos-e-conteudo', nome: 'Publicações sobre dores', descricao: 'Encontra artigos e posts em que a empresa descreve uma dor ou procura uma solução.', padroes: { papeis: ['Autor'], temas: ['IA generativa'] } },
  // Anúncios
  { id: 'anuncios-linkedin', familiaId: 'anuncios', nome: 'Anunciando no LinkedIn', descricao: 'Avisa quando a empresa começa uma campanha, pela biblioteca de anúncios do LinkedIn.' },
  { id: 'anuncios-meta', familiaId: 'anuncios', nome: 'Anunciando na Meta', descricao: 'Avisa quando a empresa começa a anunciar no Facebook e no Instagram, pela biblioteca de anúncios da Meta.' },
  // Reputação e concorrência
  { id: 'avaliacoes', familiaId: 'reputacao-e-concorrencia', nome: 'Avaliações no G2 e outras plataformas', descricao: 'Acompanha avaliações suas e dos concorrentes em busca de dores citadas e papéis de compra.', padroes: { marcas: ['Snowflake', 'Google BigQuery'], plataformas: ['G2', 'Gartner Peer Insights'], nota: 'Até 3 estrelas' } },
  { id: 'avaliacoes-google-maps', familiaId: 'reputacao-e-concorrencia', nome: 'Avaliações no Google Maps', descricao: 'Aponta queda de nota e reclamações repetidas nas avaliações da empresa no Google Maps, sem guardar quem avaliou.', formulario: 'avaliacoes', padroes: { nota: 'Até 2 estrelas' } },
  { id: 'mencoes-a-concorrentes', familiaId: 'reputacao-e-concorrencia', nome: 'Menções a marcas e concorrentes', descricao: 'Reúne menções públicas à sua marca e aos concorrentes feitas por pessoas das Contas-alvo.', padroes: { marcas: ['Snowflake', 'Google BigQuery'], plataformas: ['Redes sociais'] } },
  { id: 'relatos-de-problemas', familiaId: 'reputacao-e-concorrencia', nome: 'Relatos de problemas', descricao: 'Reúne reclamações públicas que indicam um problema que você resolve.', padroes: { marcas: ['Databricks'], plataformas: ['Sites de reclamação', 'Redes sociais'], nota: 'Até 2 estrelas' } },
  { id: 'saida-de-fornecedor', familiaId: 'reputacao-e-concorrencia', nome: 'Saída de fornecedor', descricao: 'Percebe o logo de um concorrente saindo da página de clientes ou uma renovação que não aconteceu.', padroes: { marcas: ['Snowflake', 'Google BigQuery'], plataformas: ['Página de clientes e parceiros', 'Redes sociais'] } },
  // Comunidades e intenção
  { id: 'discussoes', familiaId: 'comunidades-e-intencao', nome: 'Discussões em comunidades', descricao: 'Encontra perguntas e discussões públicas de pessoas das Contas-alvo sobre os seus temas.', padroes: { canais: ['Fóruns técnicos', 'Comunidades profissionais'], temas: ['Modernização de dados'] } },
  { id: 'repositorios', familiaId: 'comunidades-e-intencao', nome: 'Interesse em repositórios', descricao: 'Avalia quem marca e acompanha repositórios monitorados e identifica as empresas.', padroes: { canais: ['GitHub'], temas: ['IA generativa'] } },
  { id: 'pesquisa-de-temas', familiaId: 'comunidades-e-intencao', nome: 'Pesquisa de temas e categorias', descricao: 'Recebe de fornecedores de dados de intenção as empresas que pesquisam os seus temas.', padroes: { canais: ['Fornecedor de dados de intenção'], temas: ['Modernização de dados', 'IA generativa'] } },
  { id: 'interesse-em-concorrentes', familiaId: 'comunidades-e-intencao', nome: 'Interesse em soluções concorrentes', descricao: 'Percebe interesse público em soluções concorrentes, como comparações e avaliações.', padroes: { canais: ['Fornecedor de dados de intenção'], temas: ['IA generativa'] } },
  // Comportamento no site
  { id: 'visitas-ao-site', familiaId: 'comportamento-no-site', nome: 'Visitas ao site', descricao: 'Identifica empresas que visitam o seu site e conta pessoas por empresa, não acessos.', padroes: { paginas: ['Qualquer página'], caminhos: '', pessoas: '2', periodo: 'Últimos 14 dias' } },
  { id: 'pagina-de-precos', familiaId: 'comportamento-no-site', nome: 'Visitas às páginas de preço e produto', descricao: 'Associa visitantes identificados nas páginas de preços e produto às Contas-alvo.', padroes: { paginas: ['Preços', 'Produto'], caminhos: '', pessoas: '2', periodo: 'Últimos 7 dias' } },
  { id: 'paginas-especificas', familiaId: 'comportamento-no-site', nome: 'Páginas específicas', descricao: 'Acompanha as páginas que você escolher, como cases, integrações ou documentação.', padroes: { paginas: ['Cases', 'Integrações'], caminhos: '/cases, /integracoes', pessoas: '2', periodo: 'Últimos 30 dias' } },
  // Histórico comercial
  { id: 'negociacao-parada', familiaId: 'historico-comercial', nome: 'Negociação parada', descricao: 'Aponta negociações sem atividade há o período que você definir e o último assunto tratado.', padroes: { condicao: 'Negociação parada', prazo: '30', etapas: ['Negociação'] } },
  { id: 'sem-resposta', familiaId: 'historico-comercial', nome: 'Ausência de resposta', descricao: 'Retoma Contas-alvo sem resposta há o período que você definir, preservando as Interações.', padroes: { condicao: 'Sem resposta', prazo: '45', etapas: ['Descoberta', 'Proposta'] } },
  { id: 'proposta-recusada', familiaId: 'historico-comercial', nome: 'Proposta recusada', descricao: 'Traz de volta Contas-alvo cuja proposta foi recusada há o tempo que você escolher.', padroes: { condicao: 'Proposta recusada', prazo: '90', etapas: ['Proposta'] } },
  // Testes e verificações
  { id: 'lead-oculto', familiaId: 'testes-e-verificacoes', nome: 'Teste de atendimento (lead oculto)', descricao: 'Simula o contato de um cliente e mede tempo e qualidade da resposta pelos seus critérios.', padroes: { canais: ['WhatsApp', 'Formulário do site'], criterio: 'não houver resposta em 24 horas úteis', prazo: '24 horas úteis', frequencia: 'Uma vez' } },
  { id: 'erros-no-site', familiaId: 'testes-e-verificacoes', nome: 'Erros ou indisponibilidade no site', descricao: 'Verifica páginas fora do ar, lentas ou com erros aparentes.', padroes: { canais: ['Páginas do site'], criterio: 'uma página ficar fora do ar ou exibir erro', prazo: 'Imediato', frequencia: 'Toda semana' } },
  { id: 'formularios', familiaId: 'testes-e-verificacoes', nome: 'Formulários e fluxos públicos', descricao: 'Testa formulários, agendamento e checkout públicos e registra o que falha.', padroes: { canais: ['Formulário do site'], criterio: 'o envio falhar ou não houver confirmação', prazo: 'Imediato', frequencia: 'Toda semana' } },
  { id: 'outras-verificacoes', familiaId: 'testes-e-verificacoes', nome: 'Outras verificações', descricao: 'Descreva uma verificação para investigar uma necessidade específica do seu mercado.', padroes: { canais: ['Formulário do site', 'WhatsApp'], criterio: 'condição personalizada a verificar', prazo: '24 horas úteis', frequencia: 'Uma vez' } },
]

/** O tipo sintético dos sinais personalizados: não aparece como card do catálogo. */
export const TIPO_PERSONALIZADO: TipoDeSinal = {
  id: 'personalizado',
  familiaId: 'personalizado',
  nome: 'Sinais personalizados',
  descricao: 'Descreva em linguagem livre o que quer acompanhar. A Althius prepara critérios para você revisar antes de ativar.',
}

export function familiaDoTipo(tipo: TipoDeSinal): Familia | undefined {
  return FAMILIAS.find((familia) => familia.id === tipo.familiaId)
}

export function formularioDoTipo(tipo: TipoDeSinal): Formulario | undefined {
  return tipo.formulario ?? familiaDoTipo(tipo)?.formulario
}

export function tipoPorId(id: string): TipoDeSinal | undefined {
  if (id === TIPO_PERSONALIZADO.id) return TIPO_PERSONALIZADO
  return TIPOS.find((tipo) => tipo.id === id)
}

// Critérios por formulário. Na demonstração, os campos são ilustrativos.

export type Campo =
  | { id: string; rotulo: string; tipo: 'opcoes'; opcoes: string[]; ajuda?: string }
  | { id: string; rotulo: string; tipo: 'escolha'; opcoes: string[]; ajuda?: string }
  | { id: string; rotulo: string; tipo: 'numero'; sufixo: string; padrao: string; ajuda?: string }
  | { id: string; rotulo: string; tipo: 'texto'; exemplo: string; ajuda?: string }

const LOCALIZACAO: Campo = {
  id: 'localizacao',
  rotulo: 'Localização',
  tipo: 'opcoes',
  opcoes: ['Brasil', 'México', 'Colômbia', 'Argentina', 'Chile', 'Estados Unidos'],
}

const PERIODO: Campo = {
  id: 'periodo',
  rotulo: 'Período observado',
  tipo: 'escolha',
  opcoes: ['Últimos 7 dias', 'Últimos 14 dias', 'Últimos 30 dias', 'Últimos 90 dias'],
  ajuda: 'Só acontecimentos dentro deste período disparam um Sinal.',
}

const TEMAS: Campo = {
  id: 'temas',
  rotulo: 'Temas',
  tipo: 'opcoes',
  opcoes: ['IA generativa', 'Modernização de dados', 'Custo de nuvem', 'Governança e LGPD', 'Analytics em tempo real'],
}

export const CAMPOS: Record<Formulario, Campo[]> = {
  vagas: [
    { id: 'funcoes', rotulo: 'Cargos ou funções', tipo: 'opcoes', opcoes: ['Engenharia de dados', 'IA e machine learning', 'Plataforma e infraestrutura', 'RevOps e GTM', 'Finanças', 'Recursos humanos'] },
    { id: 'senioridade', rotulo: 'Senioridade', tipo: 'escolha', opcoes: ['Qualquer', 'Liderança', 'Especialista', 'Pleno e sênior'] },
    LOCALIZACAO,
    PERIODO,
    { id: 'palavras', rotulo: 'Palavras na descrição da vaga', tipo: 'texto', exemplo: 'lakehouse, migração de data warehouse', ajuda: 'Opcional. Separe por vírgulas.' },
  ],
  pessoas: [
    { id: 'cargos', rotulo: 'Cargos acompanhados', tipo: 'opcoes', opcoes: ['CDO', 'CTO', 'VP de Engenharia', 'Head de Dados', 'CFO', 'Procurement'] },
    { id: 'movimento', rotulo: 'Movimento', tipo: 'opcoes', opcoes: ['Chegada', 'Promoção', 'Mudança de empresa'] },
    { id: 'pessoas', rotulo: 'Pessoas de referência', tipo: 'escolha', opcoes: ['Qualquer pessoa no cargo', 'Contatos das Contas-alvo', 'Compradores de negócios ganhos', 'Campeões de negócios perdidos'] },
    LOCALIZACAO,
    PERIODO,
  ],
  capital: [
    { id: 'eventos', rotulo: 'Acontecimentos', tipo: 'opcoes', opcoes: ['Rodada', 'Fusão ou aquisição', 'Investimento anunciado', 'Mudança de crédito', 'Reestruturação'] },
    { id: 'valor', rotulo: 'Valor mínimo', tipo: 'escolha', opcoes: ['Qualquer valor', 'US$ 10 mi ou mais', 'US$ 50 mi ou mais', 'US$ 100 mi ou mais'] },
    LOCALIZACAO,
    PERIODO,
  ],
  expansao: [
    { id: 'eventos', rotulo: 'Acontecimentos', tipo: 'opcoes', opcoes: ['Nova unidade', 'Novo estado ou país', 'Terreno ou imóvel', 'Alvará de obra', 'Alteração na junta comercial', 'Licitação ou contrato público'] },
    { id: 'regioes', rotulo: 'Regiões', tipo: 'opcoes', opcoes: ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Cidade do México', 'Monterrey'] },
    PERIODO,
  ],
  tecnologia: [
    { id: 'ferramentas', rotulo: 'Ferramentas', tipo: 'opcoes', opcoes: ['Snowflake', 'Amazon Redshift', 'Google BigQuery', 'Hadoop', 'Teradata', 'Azure Synapse'] },
    { id: 'mudanca', rotulo: 'Mudança', tipo: 'opcoes', opcoes: ['Adoção', 'Troca', 'Retirada'] },
    { id: 'fontes', rotulo: 'Onde observar', tipo: 'opcoes', opcoes: ['Vagas', 'Site e DNS', 'Registros públicos', 'Notícias'] },
    PERIODO,
  ],
  noticias: [
    TEMAS,
    { id: 'fontes', rotulo: 'Fontes', tipo: 'opcoes', opcoes: ['Imprensa', 'Comunicados oficiais', 'Blogs corporativos', 'Parceiros e investidores'] },
    PERIODO,
  ],
  eventos: [
    { id: 'eventos', rotulo: 'Eventos ou programas', tipo: 'texto', exemplo: 'Gartner Data & Analytics, Web Summit Rio', ajuda: 'Opcional. Sem eventos, a Althius acompanha os do seu segmento.' },
    { id: 'papeis', rotulo: 'Participação', tipo: 'opcoes', opcoes: ['Palestrante', 'Participante', 'Entrevistado', 'Autor'] },
    TEMAS,
    PERIODO,
  ],
  anuncios: [
    LOCALIZACAO,
    PERIODO,
    { id: 'palavras', rotulo: 'Palavras no anúncio', tipo: 'texto', exemplo: 'lançamento, black friday', ajuda: 'Opcional. Separe por vírgulas.' },
  ],
  avaliacoes: [
    { id: 'nota', rotulo: 'Nota da avaliação', tipo: 'escolha', opcoes: ['Qualquer nota', 'Até 3 estrelas', 'Até 2 estrelas'], ajuda: 'Até que nota uma avaliação conta como reclamação.' },
    PERIODO,
    { id: 'palavras', rotulo: 'Assuntos das reclamações', tipo: 'texto', exemplo: 'fila, estacionamento', ajuda: 'Opcional. Além dos assuntos comuns, como atendimento, demora e preço. Separe por vírgulas.' },
  ],
  reputacao: [
    { id: 'marcas', rotulo: 'Marcas acompanhadas', tipo: 'opcoes', opcoes: ['Databricks', 'Snowflake', 'Google BigQuery', 'Amazon Redshift'] },
    { id: 'plataformas', rotulo: 'Plataformas', tipo: 'opcoes', opcoes: ['G2', 'Gartner Peer Insights', 'Redes sociais', 'Sites de reclamação', 'Página de clientes e parceiros'] },
    { id: 'nota', rotulo: 'Nota da avaliação', tipo: 'escolha', opcoes: ['Qualquer nota', 'Até 3 estrelas', 'Até 2 estrelas'] },
    PERIODO,
  ],
  comunidade: [
    { id: 'canais', rotulo: 'Onde observar', tipo: 'opcoes', opcoes: ['Fóruns técnicos', 'GitHub', 'Comunidades profissionais', 'Fornecedor de dados de intenção'] },
    TEMAS,
    PERIODO,
  ],
  site: [
    { id: 'paginas', rotulo: 'Páginas', tipo: 'opcoes', opcoes: ['Qualquer página', 'Preços', 'Produto', 'Cases', 'Integrações', 'Documentação'] },
    { id: 'caminhos', rotulo: 'URLs ou caminhos específicos', tipo: 'texto', exemplo: '/precos, /cases/enterprise', ajuda: 'Opcional. Separe por vírgulas.' },
    { id: 'pessoas', rotulo: 'Pessoas distintas da mesma empresa', tipo: 'numero', sufixo: 'ou mais', padrao: '2' },
    PERIODO,
  ],
  historico: [
    { id: 'condicao', rotulo: 'Condição', tipo: 'escolha', opcoes: ['Sem resposta', 'Negociação parada', 'Proposta recusada'] },
    { id: 'prazo', rotulo: 'Há pelo menos', tipo: 'numero', sufixo: 'dias', padrao: '45', ajuda: 'Tempo sem atividade ou resposta para detectar o sinal. A validade após o disparo é fixa em 30 dias.' },
    { id: 'etapas', rotulo: 'Etapas do funil', tipo: 'opcoes', opcoes: ['Descoberta', 'Proposta', 'Negociação'] },
  ],
  verificacao: [
    { id: 'canais', rotulo: 'Canais verificados', tipo: 'opcoes', opcoes: ['Formulário do site', 'Páginas do site', 'WhatsApp', 'E-mail', 'Telefone', 'Chat'] },
    { id: 'criterio', rotulo: 'Dispara quando', tipo: 'texto', exemplo: 'não houver resposta em 24 horas úteis', ajuda: 'Condição observada para considerar o sinal disparado.' },
    { id: 'prazo', rotulo: 'Prazo limite ou tolerância', tipo: 'escolha', opcoes: ['Imediato', '24 horas úteis', '48 horas úteis', '7 dias'], ajuda: 'Tempo limite aguardado para resposta ou detecção do problema.' },
    { id: 'frequencia', rotulo: 'Frequência', tipo: 'escolha', opcoes: ['Uma vez', 'Toda semana', 'Todo mês'] },
  ],
  seguranca: [
    { id: 'acontecimentos', rotulo: 'Acontecimentos', tipo: 'opcoes', opcoes: ['Certificação em andamento', 'Certificação conquistada', 'Incidente divulgado'] },
    { id: 'normas', rotulo: 'Normas e certificações', tipo: 'opcoes', opcoes: ['ISO 27001', 'SOC 2', 'PCI DSS', 'LGPD'] },
    { id: 'fontes', rotulo: 'Onde observar', tipo: 'opcoes', opcoes: ['Página de segurança do site', 'Notícias', 'Comunicados oficiais', 'Registros públicos'] },
    PERIODO,
  ],
}

/** Valores iniciais de um Monitoramento novo: os do tipo e, no resto, a primeira opção de cada campo. */
export function criteriosIniciais(tipo: TipoDeSinal): Criterios {
  const formulario = formularioDoTipo(tipo)
  if (!formulario) return {}
  const daFamilia: Criterios = Object.fromEntries(
    CAMPOS[formulario].map((campo) => {
      if (campo.tipo === 'opcoes') return [campo.id, [campo.opcoes[0]]]
      if (campo.tipo === 'escolha') return [campo.id, campo.opcoes[0]]
      if (campo.tipo === 'numero') return [campo.id, campo.padrao]
      return [campo.id, '']
    }),
  )
  return { ...daFamilia, ...tipo.padroes }
}

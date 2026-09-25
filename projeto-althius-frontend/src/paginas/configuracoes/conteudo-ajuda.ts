/**
 * O conteúdo de Ajuda e informações, separado das páginas que o apresentam: o texto definitivo entra aqui, com a mesma
 * forma, sem redesenhar as páginas. Enquanto for provisório, as páginas o identificam como tal.
 */

export interface Orientacao {
  titulo: string
  texto: string
}

/** A Central de ajuda: orientações curtas para as funções que existem no aplicativo. */
export interface CentralDeAjuda {
  /** Enquanto for provisória, a página avisa que o texto definitivo vai substituir estas orientações. */
  provisorio: boolean
  orientacoes: Orientacao[]
}

export const CENTRAL_DE_AJUDA: CentralDeAjuda = {
  provisorio: true,
  orientacoes: [
    {
      titulo: 'Agentes e Especialidades',
      texto:
        'Scopus, Ethos, Rhetor e Oraculum trabalham em frentes fixas. Crie Agentes a partir de uma Especialidade e personalize instruções, tom e ferramentas.',
    },
    {
      titulo: 'Conversa e Menções',
      texto: 'Converse com um Agente na página dele ou mencione outros com @ na Conversa coordenada.',
    },
    {
      titulo: 'Aprovações',
      texto:
        'O que um Agente propõe só acontece depois do seu aceite. Decida na fila de Aprovações ou no Canal de onde veio o pedido.',
    },
    {
      titulo: 'Contas e Contatos',
      texto: 'As Contas-alvo, com a Aderência avaliada pelo Scopus, e os Contatos, com a Persona indicada pelo Ethos.',
    },
    {
      titulo: 'Sequências',
      texto:
        'O plano de abordagem de cada Conta-alvo: passos ordenados, cada um com canal, mensagem e momento de contato. O Rhetor escreve as mensagens.',
    },
    {
      titulo: 'Sinais',
      texto: 'Os Monitoramentos procuram Sinais; um Sinal disparado deixa a Conta-alvo Quente, sem mudar a Aderência dela.',
    },
    {
      titulo: 'Conexões',
      texto: 'Conecte cada ferramenta uma vez para o Workspace e escolha em cada Agente o que ele pode usar.',
    },
    {
      titulo: 'Memória do Workspace',
      texto: 'O ICP e as Personas vigentes. Peça revisões ao Scopus ou ao Ethos; um Administrador decide.',
    },
  ],
}

export interface SecaoDoDocumento {
  /** Âncora da seção no índice da página. */
  id: string
  titulo: string
  paragrafos: string[]
}

/** Termos de serviço ou política de privacidade: a página mostra as seções na ordem, com um índice ao lado. */
export interface DocumentoInstitucional {
  titulo: string
  /** Versão e vigência, logo abaixo do título. */
  versao: string
  /** Enquanto for provisório, a página avisa que o texto não descreve práticas reais da Althius. */
  provisorio: boolean
  secoes: SecaoDoDocumento[]
}

/** Um parágrafo que só diz o assunto da seção, sem afirmar nada como se fosse oficial. */
function textoProvisorio(assunto: string) {
  return [
    `[Texto provisório] Assunto desta seção: ${assunto}. O conteúdo definitivo substitui este parágrafo sem mudar a estrutura da página.`,
  ]
}

export const TERMOS_DE_SERVICO: DocumentoInstitucional = {
  titulo: 'Termos de serviço',
  versao: 'Versão provisória · sem data de vigência',
  provisorio: true,
  secoes: [
    {
      id: 'aceitacao',
      titulo: 'Aceitação dos termos',
      paragrafos: textoProvisorio('quando e como estes termos passam a valer para o Cliente e as pessoas do Workspace'),
    },
    {
      id: 'servico',
      titulo: 'Descrição do serviço',
      paragrafos: textoProvisorio('o que a Althius oferece e o que depende das Conexões do Workspace'),
    },
    {
      id: 'contas',
      titulo: 'Contas de usuário e Workspaces',
      paragrafos: textoProvisorio(
        'a Conta de usuário, a Participação no Workspace e as responsabilidades de Administradores e Membros',
      ),
    },
    {
      id: 'uso',
      titulo: 'Uso aceitável',
      paragrafos: textoProvisorio('o que não é permitido fazer com a Althius e com os Agentes'),
    },
    {
      id: 'conteudo',
      titulo: 'Conteúdo do Cliente',
      paragrafos: textoProvisorio('a quem pertencem os dados e documentos enviados ao Workspace'),
    },
    {
      id: 'alteracoes',
      titulo: 'Disponibilidade e alterações',
      paragrafos: textoProvisorio('como o serviço pode mudar e como o Cliente será avisado'),
    },
    {
      id: 'responsabilidade',
      titulo: 'Limitação de responsabilidade',
      paragrafos: textoProvisorio('os limites de responsabilidade das partes'),
    },
    {
      id: 'encerramento',
      titulo: 'Encerramento',
      paragrafos: textoProvisorio('como o Cliente ou a Althius podem encerrar o uso do serviço'),
    },
    { id: 'contato', titulo: 'Contato', paragrafos: textoProvisorio('por onde falar com a Althius sobre estes termos') },
  ],
}

export const POLITICA_DE_PRIVACIDADE: DocumentoInstitucional = {
  titulo: 'Política de privacidade',
  versao: 'Versão provisória · sem data de vigência',
  provisorio: true,
  secoes: [
    { id: 'quem', titulo: 'Quem somos', paragrafos: textoProvisorio('a identificação do responsável pelo tratamento dos dados') },
    { id: 'dados', titulo: 'Dados tratados', paragrafos: textoProvisorio('quais dados pessoais e do Workspace são tratados') },
    { id: 'finalidades', titulo: 'Finalidades', paragrafos: textoProvisorio('para que esses dados são usados') },
    {
      id: 'compartilhamento',
      titulo: 'Compartilhamento',
      paragrafos: textoProvisorio('com quem os dados podem ser compartilhados, incluindo as Integrações'),
    },
    { id: 'retencao', titulo: 'Retenção', paragrafos: textoProvisorio('por quanto tempo os dados são guardados') },
    {
      id: 'direitos',
      titulo: 'Direitos do titular',
      paragrafos: textoProvisorio('como exercer os direitos previstos na legislação aplicável'),
    },
    { id: 'seguranca', titulo: 'Segurança', paragrafos: textoProvisorio('as medidas de proteção dos dados') },
    { id: 'contato', titulo: 'Contato', paragrafos: textoProvisorio('por onde falar sobre privacidade') },
  ],
}

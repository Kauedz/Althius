// O catálogo fixo dos Canais e das Integrações que os Agentes usam: nome, descrição e o que cada Integração escreve. É
// o que existe de Conexão, com ou sem conexão feita. Se ela está conectada é outra pergunta: a Demonstração responde com
// dados de exemplo, e o Workspace operacional, com o que o banco diz (hoje só o Canal Slack conecta). O
// catálogo de Integrações do banco (private.integration_catalog) tem os mesmos identificadores.
import type { Canal, CanalId, Integracao, IntegracaoId } from './tipos'

export const catalogoDeCanais: Omit<Canal, 'conectado'>[] = [
  { id: 'slack', nome: 'Slack', descricao: 'Mencione um Agente em qualquer canal ou thread.' },
  { id: 'whatsapp', nome: 'WhatsApp', descricao: 'Converse com os Agentes pelo número do Workspace.' },
  { id: 'teams', nome: 'Microsoft Teams', descricao: 'Mencione um Agente em chats e canais do Teams.' },
  { id: 'email', nome: 'E-mail', descricao: 'Encaminhe e-mails e receba resumos das Rotinas.' },
]

export const catalogoDeIntegracoesDosAgentes: Omit<Integracao, 'conectada'>[] = [
  { id: 'hubspot', nome: 'HubSpot', categoria: 'CRM', descricao: 'Contas, contatos, negócios e sequências.', escreve: true },
  { id: 'clay', nome: 'Clay', categoria: 'Enriquecimento', descricao: 'Dados firmográficos e de tecnologia.', escreve: false },
  { id: 'apollo', nome: 'Apollo', categoria: 'Enriquecimento', descricao: 'Contatos e sinais de compra.', escreve: false },
  { id: 'lusha', nome: 'Lusha', categoria: 'Enriquecimento', descricao: 'Cargos e contatos do Comitê de compra.', escreve: false },
  { id: 'notion', nome: 'Notion', categoria: 'Conhecimento', descricao: 'Páginas usadas como base de conhecimento e pautas.', escreve: true },
  { id: 'meta-ads', nome: 'Meta Ads', categoria: 'Mídia paga', descricao: 'Campanhas no Facebook e no Instagram.', escreve: true },
  { id: 'google-ads', nome: 'Google Ads', categoria: 'Mídia paga', descricao: 'Campanhas de busca e display.', escreve: true },
]

/** Integrações disponíveis na tela de Conexões; referências dos Agentes continuam no catálogo completo. */
export const catalogoDeIntegracoes = catalogoDeIntegracoesDosAgentes.filter((i) => i.id === 'hubspot' || i.id === 'notion')

/** O catálogo de Canais com o estado de conexão que a fonte informa: os que ela não lista ficam não conectados. */
export function canaisConectados(conectados: readonly CanalId[]): Canal[] {
  return catalogoDeCanais.map((canal) => ({ ...canal, conectado: conectados.includes(canal.id) }))
}

/** O catálogo de Integrações com o estado de conexão que a fonte informa. */
export function integracoesConectadas(conectadas: readonly IntegracaoId[]): Integracao[] {
  return catalogoDeIntegracoesDosAgentes.map((integracao) => ({ ...integracao, conectada: conectadas.includes(integracao.id) }))
}

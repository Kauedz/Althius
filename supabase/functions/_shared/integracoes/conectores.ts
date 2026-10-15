// Os conectores do catálogo ampliado (conexoes-funcionais, pesquisa-conectores-mcp-todos.md de 2026-10-02): os apps que
// têm servidor MCP remoto OFICIAL e aceitam um cliente de terceiros por OAuth, como os conectores do Claude. Nenhum código
// específico por app: cada um é só DADO (o endereço do servidor e como o cliente OAuth se registra). O que o conector faz
// vem do `tools/list` do próprio servidor, em tempo de execução, e a Permissão de cada ferramenta é do Workspace
// (ADR-0022). Os endereços de autorização e de token vêm da descoberta (RFC 9728 e RFC 8414), nunca escritos aqui.
//
// Ficam de fora, e aparecem "Em breve": quem não tem servidor remoto oficial (Kommo, LinkedIn Ads, Google Ads), quem só
// tem servidor criado na conta de cada cliente (Salesforce, Zoho CRM, Microsoft Teams, RD Station). Os perfis da migration 20261001160000 continuam em `perfis.ts`; `perfilDaIntegracao` lê os dois.
import type { PerfilDeIntegracao } from './perfis.ts'

const GOOGLE = 'https://www.googleapis.com/auth/'

export const CONECTORES: Record<string, PerfilDeIntegracao> = {
  slack: {
    id: 'slack',
    nome: 'Slack',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.slack.com/mcp',
      oauth: {
        // O cliente MCP precisa ser um app Slack registrado (app ID fixo, aprovado pelos administradores do Slack); o
        // servidor não aceita registro dinâmico.
        registro: 'preregistrado',
        segredos: { clientId: 'SLACK_MCP_CLIENT_ID', clientSecret: 'SLACK_MCP_CLIENT_SECRET' },
        // não confirmado: se o Slack aceita o parâmetro `resource` (RFC 8707); fora por segurança.
        enviarRecurso: false,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Se mcp.slack.com publica o metadado de autorização (RFC 9728/8414) ou se os endereços de autorização do app Slack precisam ir no perfil.',
      'Os escopos de usuário que o consentimento pede (a pesquisa lista os escopos por ferramenta) e os nomes exatos das ferramentas.',
    ],
  },
  'google-calendar': {
    id: 'google-calendar',
    nome: 'Google Calendar',
    portalFixo: false,
    mcp: {
      url: 'https://calendarmcp.googleapis.com/mcp/v1',
      oauth: {
        // Um cliente OAuth num projeto do Google Cloud, com a tela de consentimento e estes escopos.
        registro: 'preregistrado',
        segredos: { clientId: 'GOOGLE_CALENDAR_MCP_CLIENT_ID', clientSecret: 'GOOGLE_CALENDAR_MCP_CLIENT_SECRET' },
        escopos: [
          `${GOOGLE}calendar.calendarlist.readonly`,
          `${GOOGLE}calendar.events.freebusy`,
          `${GOOGLE}calendar.events.readonly`,
          `${GOOGLE}calendar.events`,
        ],
        // não confirmado: se o Google aceita o parâmetro `resource`; fora por segurança.
        enviarRecurso: false,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Se o servidor publica o metadado de autorização (RFC 9728) apontando para o OAuth do Google.',
      'Se o refresh token vem sem access_type=offline no consentimento (o cliente OAuth da Althius não manda esse parâmetro).',
      'A verificação do app pelo Google para escopos sensíveis antes de servir a muitos usuários.',
    ],
  },
  'google-sheets': {
    id: 'google-sheets',
    nome: 'Google Sheets',
    portalFixo: false,
    mcp: {
      url: 'https://sheetsmcp.googleapis.com/mcp/v1',
      oauth: {
        registro: 'preregistrado',
        segredos: { clientId: 'GOOGLE_SHEETS_MCP_CLIENT_ID', clientSecret: 'GOOGLE_SHEETS_MCP_CLIENT_SECRET' },
        escopos: [`${GOOGLE}spreadsheets`, `${GOOGLE}drive.file`],
        enviarRecurso: false,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Se o servidor publica o metadado de autorização (RFC 9728) apontando para o OAuth do Google.',
      'Se o refresh token vem sem access_type=offline no consentimento.',
      'Se drive.file basta para achar as planilhas ou se é preciso drive.readonly (escopo restrito).',
    ],
  },
  clay: {
    id: 'clay',
    nome: 'Clay',
    // O token do Clay é por usuário e por workspace do Clay: cada participante conecta a própria conta, e nada identifica
    // com segurança um "portal" único a fixar no Workspace (como o hub do HubSpot). Por isso o portal não fica fixo.
    portalFixo: false,
    mcp: {
      // Fonte oficial: https://university.clay.com/docs/connect-to-clay-mcp (lida em 15/10/2026). HTTP streamable; o
      // metadado do recurso fica no caminho com sufixo (/.well-known/oauth-protected-resource/v3/mcp, RFC 9728), que a
      // descoberta já tenta antes da raiz (a raiz responde 404).
      url: 'https://api.clay.com/v3/mcp',
      oauth: {
        // Registro dinâmico em https://api.clay.com/oauth/register; aceitou o redirect do integration-callback (teste de
        // 15/10/2026). Autorização em app.clay.com, token em api.clay.com, PKCE S256, escopo `mcp`.
        registro: 'dinamico',
        segredos: { clientId: 'CLAY_MCP_CLIENT_ID', clientSecret: 'CLAY_MCP_CLIENT_SECRET' },
        escopos: ['mcp'],
        // não confirmado: se o Clay aceita o parâmetro `resource` (RFC 8707); o metadado anuncia o recurso
        // https://api.clay.com/v3/mcp, e a especificação do MCP o pede.
        enviarRecurso: true,
        // não confirmado: não há endpoint REST público confiável para ler a conta do Clay; a identificação fica mínima.
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Como a conta e o workspace do Clay são identificados para o cartão (sem endpoint REST confirmado).',
      'Se o Clay aceita o parâmetro resource (RFC 8707) no consentimento e na troca do código.',
    ],
  },
  calendly: {
    id: 'calendly',
    nome: 'Calendly',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.calendly.com',
      oauth: {
        // Registro dinâmico em calendly.com/oauth/register, uma vez por ambiente e reaproveitado (a Calendly recomenda).
        registro: 'dinamico',
        segredos: { clientId: 'CALENDLY_MCP_CLIENT_ID', clientSecret: 'CALENDLY_MCP_CLIENT_SECRET' },
        escopos: ['mcp:scheduling:read', 'mcp:scheduling:write'],
        enviarRecurso: true,
        identificacao: {},
      },
    },
    naoConfirmado: ['Como a conta do Calendly é identificada para o cartão (a resposta do token não foi lida).'],
  },
  bitrix24: {
    id: 'bitrix24',
    nome: 'Bitrix24',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.bitrix24.com/mcp/',
      oauth: {
        // não confirmado: se o servidor anuncia registro dinâmico; se não, o app OAuth é criado no Bitrix24 e o client id e
        // o secret entram nestes segredos.
        registro: 'dinamico',
        segredos: { clientId: 'BITRIX24_MCP_CLIENT_ID', clientSecret: 'BITRIX24_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Se o servidor anuncia registro dinâmico de cliente (RFC 7591); se não, o app OAuth é criado no Bitrix24.',
      'Os escopos e os nomes das ferramentas; o administrador do Bitrix24 precisa ligar "Permitir conexão de IAs externas".',
    ],
  },
  'tiktok-ads': {
    id: 'tiktok-ads',
    nome: 'TikTok Ads',
    portalFixo: false,
    mcp: {
      // A variante "layer" (cerca de 40 ferramentas e as demais sob demanda), para a lista caber na conversa dos Agentes.
      url: 'https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer',
      oauth: {
        // não confirmado: a autorização no TikTok Ads Manager dispensa app de desenvolvedor, o que sugere registro dinâmico.
        registro: 'dinamico',
        segredos: { clientId: 'TIKTOK_ADS_MCP_CLIENT_ID', clientSecret: 'TIKTOK_ADS_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'Se o servidor anuncia registro dinâmico de cliente (RFC 7591).',
      'A autorização vale 30 dias: depois, o Acesso aparece "Precisa reconectar".',
      'Os escopos e os nomes das ferramentas (gestão de campanhas e públicos gasta verba: a regra padrão pede Aprovação).',
    ],
  },
}

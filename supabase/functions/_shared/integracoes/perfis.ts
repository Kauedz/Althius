// Os perfis de conexão: um por Integração, como DADOS. Dizem onde fica o servidor MCP oficial, como o OAuth se registra,
// como a chave de API é aceita, como a conta e o portal são identificados e quais ferramentas REST existem onde não há MCP
// utilizável. Escritos a partir da documentação oficial de cada app; o que a documentação acessível não confirmou está
// em `naoConfirmado` e marcado `// não confirmado:` — a conferência real é o ticket 09 (HubSpot) e os "Passos do Nan".
//
// Mantenha os caminhos (`caminhosDe`) iguais ao seed de `private.integration_connection_profiles` na migration
// 20261001160000: o banco decide quem aparece "Não habilitada"/"Habilitada" e quem fixa o portal; este arquivo, como conectar.
import { CONECTORES } from './conectores.ts'
import type { PerfilRest } from './rest.ts'
import type { TipoDeAcesso } from './tipos.ts'

/** Uma chamada HTTP que descobre a conta e o portal (ou só valida a chave). `{credencial}` vira o token ou a chave. */
export interface RequisicaoDeIdentificacao {
  metodo: 'GET' | 'POST'
  url: string
  cabecalhos?: Record<string, string>
  /** Caminhos alternativos no JSON da resposta; vale o primeiro que existir. */
  portal?: string[]
  conta?: string[]
}

export interface Identificacao {
  /** Campos da própria resposta do endpoint de token (ex.: o `hub_id` do HubSpot). */
  daRespostaDoToken?: { portal?: string[]; conta?: string[] }
  /** Chamadas à API do app, tentadas em ordem; a primeira que responde 2xx vale. Numa chave de API, 401/403 é chave recusada. */
  requisicoes?: RequisicaoDeIdentificacao[]
  /** Por último, uma ferramenta do servidor MCP (ex.: `get_user_details` do HubSpot). */
  porFerramentaMcp?: { ferramenta: string; argumentos?: Record<string, unknown>; portal?: string[]; conta?: string[] }
}

export interface PerfilOAuth {
  /**
   * `preregistrado`: o app de autorização é criado à mão no provedor (HubSpot) e o client id e o secret entram como
   * segredos de ambiente; sem eles, a Integração mostra "Precisa configurar". `dinamico`: registro RFC 7591 no primeiro
   * uso; os segredos, se existirem, têm prioridade (para quando o servidor não aceita registro).
   */
  registro: 'preregistrado' | 'dinamico'
  /** Os nomes dos segredos de ambiente (`npx supabase secrets set`) com o client id e o client secret. */
  segredos: { clientId: string; clientSecret: string }
  /** Endereços explícitos: o servidor não publica o metadado de autorização, ou o perfil fixa os que ele publica. */
  autorizacao?: string
  token?: string
  escopos?: string[]
  autenticacaoDoToken?: 'client_secret_post' | 'client_secret_basic'
  /** Manda o parâmetro `resource` (RFC 8707) no consentimento e na troca, como o MCP pede. */
  enviarRecurso: boolean
  identificacao: Identificacao
}

export interface PerfilMcp {
  url: string
  oauth?: PerfilOAuth
  /** Como a chave de API entra no servidor MCP, quando ele aceita (Lusha). */
  chave?: { cabecalho: string; prefixo?: string }
}

export interface PerfilDeChaveDeApi {
  /** `mcp`: o servidor MCP aceita a chave; `rest`: a Althius fala com a API REST do app (ferramentas em `rest`). */
  via: 'mcp' | 'rest'
  /** Como validar a chave e ler a conta (via `rest`). Via `mcp`, a validação é listar as ferramentas. */
  identificacao?: Identificacao
}

export interface PerfilDeIntegracao {
  id: string
  nome: string
  /** Espelha `pins_portal` do banco: o primeiro Acesso fixa o portal do Workspace. */
  portalFixo: boolean
  mcp?: PerfilMcp
  chaveDeApi?: PerfilDeChaveDeApi
  /** A API REST do app, para o caminho de chave de API sem MCP. */
  rest?: PerfilRest
  /** Pontos que a documentação acessível não confirmou; vão para os "Passos do Nan". */
  naoConfirmado: string[]
}

const HUBSPOT_REST: PerfilRest = {
  base: 'https://api.hubapi.com',
  autenticacao: { tipo: 'cabecalho', nome: 'Authorization', prefixo: 'Bearer ' },
  ferramentas: [
    {
      nome: 'search_contacts',
      descricao: 'Busca Contacts do HubSpot por texto.',
      escreve: false,
      metodo: 'POST',
      caminho: '/crm/v3/objects/contacts/search',
      corpo: ['query', 'limit', 'after', 'properties'],
      esquema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a buscar (nome, e-mail, telefone).' },
          limit: { type: 'integer', description: 'Até 200 por página.' },
          after: { type: 'string', description: 'Cursor da página seguinte.' },
          properties: { type: 'array', items: { type: 'string' }, description: 'Propriedades a devolver.' },
        },
      },
    },
    {
      nome: 'search_companies',
      descricao: 'Busca Companies do HubSpot por texto.',
      escreve: false,
      metodo: 'POST',
      caminho: '/crm/v3/objects/companies/search',
      corpo: ['query', 'limit', 'after', 'properties'],
      esquema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a buscar (nome, domínio).' },
          limit: { type: 'integer' },
          after: { type: 'string' },
          properties: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      nome: 'get_record',
      descricao: 'Lê um registro do HubSpot pelo tipo (contacts, companies, deals) e pelo id.',
      escreve: false,
      metodo: 'GET',
      caminho: '/crm/v3/objects/{objeto}/{id}',
      consulta: ['properties'],
      esquema: {
        type: 'object',
        properties: {
          objeto: { type: 'string', enum: ['contacts', 'companies', 'deals'] },
          id: { type: 'string' },
          properties: { type: 'string', description: 'Propriedades separadas por vírgula.' },
        },
        required: ['objeto', 'id'],
      },
    },
    {
      nome: 'list_owners',
      descricao: 'Lista os owners do HubSpot (para achar o dono de uma Company pelo e-mail).',
      escreve: false,
      metodo: 'GET',
      caminho: '/crm/v3/owners',
      consulta: ['email', 'limit', 'after'],
      esquema: { type: 'object', properties: { email: { type: 'string' }, limit: { type: 'integer' }, after: { type: 'string' } } },
    },
    {
      nome: 'create_contact',
      descricao: 'Cria um Contact no HubSpot.',
      escreve: true,
      metodo: 'POST',
      caminho: '/crm/v3/objects/contacts',
      corpo: ['properties', 'associations'],
      esquema: {
        type: 'object',
        properties: {
          properties: { type: 'object', description: 'Propriedades do HubSpot (email, firstname, lastname, jobtitle…).' },
          associations: {
            type: 'array',
            description: 'Associações já na criação: [{ to: { id }, types: [{ associationCategory, associationTypeId }] }].',
          },
        },
        required: ['properties'],
      },
    },
    {
      nome: 'create_company',
      descricao: 'Cria uma Company no HubSpot.',
      escreve: true,
      metodo: 'POST',
      caminho: '/crm/v3/objects/companies',
      corpo: ['properties'],
      esquema: {
        type: 'object',
        properties: { properties: { type: 'object', description: 'Propriedades do HubSpot (name, domain, industry…).' } },
        required: ['properties'],
      },
    },
    {
      nome: 'create_note',
      descricao: 'Cria uma nota no HubSpot, associada a Companies e Contacts.',
      escreve: true,
      metodo: 'POST',
      caminho: '/crm/v3/objects/notes',
      corpo: ['properties', 'associations'],
      esquema: {
        type: 'object',
        properties: {
          properties: { type: 'object', description: 'hs_note_body (o texto) e hs_timestamp (ISO 8601).' },
          // Tipos de associação da documentação de Notes: 190 nota → Company, 202 nota → Contact.
          associations: { type: 'array', description: '[{ to: { id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId }] }].' },
        },
        required: ['properties'],
      },
    },
  ],
}

// A API v1 do Pipedrive aceita o token pessoal no parâmetro api_token (a v2 exige o cabeçalho x-api-token).
const PIPEDRIVE_REST: PerfilRest = {
  base: 'https://api.pipedrive.com/v1',
  autenticacao: { tipo: 'consulta', nome: 'api_token' },
  ferramentas: [
    {
      nome: 'search_persons',
      descricao: 'Busca pessoas do Pipedrive por nome, e-mail ou telefone.',
      escreve: false,
      metodo: 'GET',
      caminho: '/persons/search',
      consulta: ['term', 'limit', 'start'],
      esquema: {
        type: 'object',
        properties: { term: { type: 'string', description: 'Pelo menos 2 caracteres.' }, limit: { type: 'integer' }, start: { type: 'integer' } },
        required: ['term'],
      },
    },
    {
      nome: 'search_organizations',
      descricao: 'Busca organizações do Pipedrive por nome.',
      escreve: false,
      metodo: 'GET',
      caminho: '/organizations/search',
      consulta: ['term', 'limit', 'start'],
      esquema: {
        type: 'object',
        properties: { term: { type: 'string' }, limit: { type: 'integer' }, start: { type: 'integer' } },
        required: ['term'],
      },
    },
    {
      nome: 'list_deals',
      descricao: 'Lista negócios do Pipedrive.',
      escreve: false,
      metodo: 'GET',
      caminho: '/deals',
      consulta: ['status', 'limit', 'start'],
      esquema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'] },
          limit: { type: 'integer' },
          start: { type: 'integer' },
        },
      },
    },
    {
      nome: 'get_person',
      descricao: 'Lê uma pessoa do Pipedrive pelo id.',
      escreve: false,
      metodo: 'GET',
      caminho: '/persons/{id}',
      esquema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
    {
      nome: 'add_person',
      descricao: 'Cria uma pessoa no Pipedrive.',
      escreve: true,
      metodo: 'POST',
      caminho: '/persons',
      corpo: ['name', 'email', 'phone', 'org_id'],
      esquema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, org_id: { type: 'integer' } },
        required: ['name'],
      },
    },
    {
      nome: 'add_organization',
      descricao: 'Cria uma organização no Pipedrive.',
      escreve: true,
      metodo: 'POST',
      caminho: '/organizations',
      corpo: ['name'],
      esquema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    {
      nome: 'add_note',
      descricao: 'Adiciona uma nota a um negócio, pessoa ou organização do Pipedrive.',
      escreve: true,
      metodo: 'POST',
      caminho: '/notes',
      corpo: ['content', 'deal_id', 'person_id', 'org_id'],
      esquema: {
        type: 'object',
        properties: { content: { type: 'string' }, deal_id: { type: 'integer' }, person_id: { type: 'integer' }, org_id: { type: 'integer' } },
        required: ['content'],
      },
    },
  ],
}

// RD Station CRM v1: o token da conta vai no parâmetro `token`; limite de 120 requisições por minuto.
// não confirmado: os nomes dos filtros de busca (`q`) e da paginação (`page`, `limit`) de cada lista.
const RD_STATION_REST: PerfilRest = {
  base: 'https://crm.rdstation.com/api/v1',
  autenticacao: { tipo: 'consulta', nome: 'token' },
  ferramentas: [
    {
      nome: 'list_contacts',
      descricao: 'Lista contatos do RD Station CRM.',
      escreve: false,
      metodo: 'GET',
      caminho: '/contacts',
      consulta: ['page', 'limit', 'q'],
      esquema: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, q: { type: 'string' } } },
    },
    {
      nome: 'list_organizations',
      descricao: 'Lista empresas do RD Station CRM.',
      escreve: false,
      metodo: 'GET',
      caminho: '/organizations',
      consulta: ['page', 'limit', 'q'],
      esquema: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, q: { type: 'string' } } },
    },
    {
      nome: 'list_deals',
      descricao: 'Lista negociações do RD Station CRM.',
      escreve: false,
      metodo: 'GET',
      caminho: '/deals',
      consulta: ['page', 'limit'],
      esquema: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' } } },
    },
    // não confirmado: os envelopes `organization` e `contact` dos corpos de criação e o campo do id na resposta
    // (`_id` ou `id`); a documentação acessível confirmou os campos (name, title, emails, phones, organization_id).
    {
      nome: 'create_organization',
      descricao: 'Cria uma empresa no RD Station CRM.',
      escreve: true,
      metodo: 'POST',
      caminho: '/organizations',
      corpo: ['name'],
      envelope: 'organization',
      esquema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    {
      nome: 'create_contact',
      descricao: 'Cria um contato no RD Station CRM, ligado a uma empresa.',
      escreve: true,
      metodo: 'POST',
      caminho: '/contacts',
      corpo: ['name', 'title', 'emails', 'phones', 'organization_id'],
      envelope: 'contact',
      esquema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          title: { type: 'string' },
          emails: { type: 'array', items: { type: 'object', properties: { email: { type: 'string' } } } },
          phones: { type: 'array', items: { type: 'object', properties: { phone: { type: 'string' } } } },
          organization_id: { type: 'string' },
        },
        required: ['name'],
      },
    },
  ],
}

// Apollo por chave de API: a Althius fala com a API REST (o MCP do Apollo só aceita OAuth). O que gasta crédito do Apollo
// conta como "escreve" para a Permissão do Agente.
// não confirmado: os nomes dos parâmetros de busca e enriquecimento.
const APOLLO_REST: PerfilRest = {
  base: 'https://api.apollo.io/api/v1',
  autenticacao: { tipo: 'cabecalho', nome: 'x-api-key' },
  ferramentas: [
    {
      nome: 'search_people',
      descricao: 'Busca pessoas no Apollo por cargo e domínio da empresa (não gasta crédito; não traz e-mail nem telefone).',
      escreve: false,
      metodo: 'POST',
      caminho: '/mixed_people/api_search',
      corpo: ['person_titles', 'q_organization_domains_list', 'q_keywords', 'per_page', 'page'],
      esquema: {
        type: 'object',
        properties: {
          person_titles: { type: 'array', items: { type: 'string' } },
          q_organization_domains_list: { type: 'array', items: { type: 'string' } },
          q_keywords: { type: 'string' },
          per_page: { type: 'integer' },
          page: { type: 'integer' },
        },
      },
    },
    {
      nome: 'enrich_organization',
      descricao: 'Enriquece uma empresa no Apollo pelo domínio (gasta crédito).',
      escreve: true,
      metodo: 'GET',
      caminho: '/organizations/enrich',
      consulta: ['domain'],
      esquema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] },
    },
    {
      nome: 'match_person',
      descricao: 'Encontra e enriquece uma pessoa no Apollo (gasta crédito).',
      escreve: true,
      metodo: 'POST',
      caminho: '/people/match',
      corpo: ['first_name', 'last_name', 'domain', 'organization_name', 'linkedin_url', 'email'],
      esquema: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          domain: { type: 'string' },
          organization_name: { type: 'string' },
          linkedin_url: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  ],
}

export const PERFIS: Record<string, PerfilDeIntegracao> = {
  hubspot: {
    id: 'hubspot',
    nome: 'HubSpot',
    portalFixo: true,
    mcp: {
      url: 'https://mcp.hubspot.com',
      oauth: {
        registro: 'preregistrado',
        segredos: { clientId: 'HUBSPOT_MCP_CLIENT_ID', clientSecret: 'HUBSPOT_MCP_CLIENT_SECRET' },
        // Os do metadado que o servidor publica (`/.well-known/oauth-authorization-server`, lido em 08/10/2026), fixos
        // aqui para o consentimento não depender de descoberta. O metadado não tem registro dinâmico.
        autorizacao: 'https://mcp.hubspot.com/oauth/authorize/user',
        token: 'https://mcp.hubspot.com/oauth/v3/token',
        autenticacaoDoToken: 'client_secret_post',
        // não confirmado: se o HubSpot aceita o parâmetro `resource` (RFC 8707); fora por segurança.
        enviarRecurso: false,
        identificacao: {
          // O token do OAuth v3 do HubSpot devolve o `hub_id` na própria troca do código.
          // não confirmado: que o servidor do MCP devolve o `hub_id` como o OAuth v3 documentado.
          daRespostaDoToken: { portal: ['hub_id'] },
          // não confirmado: que o token do MCP Auth App vale para esta consulta (a pesquisa só confirmou para OAuth comum).
          requisicoes: [
            { metodo: 'GET', url: 'https://api.hubapi.com/oauth/v1/access-tokens/{credencial}', portal: ['hub_id'], conta: ['user'] },
          ],
          // não confirmado: o formato do resultado de `get_user_details`.
          porFerramentaMcp: {
            ferramenta: 'get_user_details',
            portal: ['hub_id', 'hubId', 'portalId', 'portal_id', 'portal.id'],
            conta: ['email', 'user', 'userEmail', 'user.email'],
          },
        },
      },
    },
    chaveDeApi: {
      via: 'rest',
      identificacao: {
        // não confirmado: que `account-info/v3/details` aceita o token de um Private App; `integrations/v1/me` é a alternativa.
        requisicoes: [
          {
            metodo: 'GET',
            url: 'https://api.hubapi.com/account-info/v3/details',
            cabecalhos: { Authorization: 'Bearer {credencial}' },
            portal: ['portalId'],
          },
          {
            metodo: 'GET',
            url: 'https://api.hubapi.com/integrations/v1/me',
            cabecalhos: { Authorization: 'Bearer {credencial}' },
            portal: ['portalId'],
          },
        ],
      },
    },
    rest: HUBSPOT_REST,
    naoConfirmado: [
      'Se a troca do código no servidor do MCP devolve o hub_id, como o OAuth v3 documentado.',
      'Se o token do MCP vale para a consulta de metadados (hub_id e e-mail) ou se a conta vem de get_user_details.',
      'Se o servidor aceita o parâmetro resource (RFC 8707).',
      'Escopos do MCP Auth App para Companies, Contacts e owners.',
      'Tipo de associação 279 (Contact → Company) na criação do Contact; 190 e 202 (nota → Company e Contact) vêm da documentação de Notes.',
      'Escopos de escrita do Private App: crm.objects.companies.write, crm.objects.contacts.write (as notas usam o escopo de contacts ou companies).',
    ],
  },
  notion: {
    id: 'notion',
    nome: 'Notion',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.notion.com/mcp',
      oauth: {
        registro: 'dinamico',
        segredos: { clientId: 'NOTION_MCP_CLIENT_ID', clientSecret: 'NOTION_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {
          // A troca do código devolve só `user_id`, `workspace_id` e `email_domain` ("Build an MCP client for Notion");
          // a conta vem da ferramenta, com `user_id: "self"` (formato lido em 08/10/2026).
          porFerramentaMcp: { ferramenta: 'notion-get-users', argumentos: { user_id: 'self' }, conta: ['results.0.email', 'results.0.name'] },
        },
      },
    },
    naoConfirmado: [
      // O metadado (lido em 08/10/2026) lista https://mcp.notion.com/mcp entre os recursos protegidos; o guia não manda `resource`.
      'Se o Notion aceita o parâmetro resource (RFC 8707) no consentimento e na troca do código.',
    ],
  },
  apollo: {
    id: 'apollo',
    nome: 'Apollo',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.apollo.io/mcp',
      oauth: {
        // O metadado de autorização do Apollo é público (mcp.apollo.io/.well-known/oauth-authorization-server).
        // não confirmado: se o Apollo aceita registro dinâmico de cliente de terceiros; se não, o app é registrado à mão
        // e o client id e o secret entram nos segredos abaixo.
        registro: 'dinamico',
        segredos: { clientId: 'APOLLO_MCP_CLIENT_ID', clientSecret: 'APOLLO_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {},
      },
    },
    chaveDeApi: {
      via: 'rest',
      identificacao: {
        // não confirmado: o endereço de verificação da chave.
        requisicoes: [{ metodo: 'GET', url: 'https://api.apollo.io/v1/auth/health', cabecalhos: { 'x-api-key': '{credencial}' } }],
      },
    },
    rest: APOLLO_REST,
    naoConfirmado: [
      // Pesquisa de 2026-10-02: quem integra como parceiro registra um app OAuth antes (APOLLO_MCP_CLIENT_ID e _SECRET).
      'Registro do cliente OAuth no Apollo (dinâmico ou pré-registrado como app de parceiro).',
      'Endereço de verificação da chave de API e nomes dos parâmetros de busca e enriquecimento da API REST.',
    ],
  },
  lusha: {
    id: 'lusha',
    nome: 'Lusha',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.lusha.com',
      // A documentação oficial manda a chave no cabeçalho x-api-key (e diz que Authorization: Bearer é recusado).
      chave: { cabecalho: 'x-api-key' },
    },
    chaveDeApi: { via: 'mcp' },
    naoConfirmado: ['OAuth do Lusha para cliente de terceiros (o blog oficial fala em OAuth; a documentação só mostra a chave).'],
  },
  'meta-ads': {
    id: 'meta-ads',
    nome: 'Meta Ads',
    portalFixo: false,
    mcp: {
      url: 'https://mcp.facebook.com/ads',
      oauth: {
        // não confirmado: se a Meta aceita OAuth de cliente de terceiros e como registrar (pode exigir revisão do app).
        registro: 'dinamico',
        segredos: { clientId: 'META_ADS_MCP_CLIENT_ID', clientSecret: 'META_ADS_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {},
      },
    },
    naoConfirmado: [
      'OAuth do servidor MCP da Meta para cliente de terceiros e a revisão do app, se exigida.',
      // Pesquisa de 2026-10-02: a Meta deixa conectar qualquer agente com o próprio app de desenvolvedor (Facebook Login
      // for Business). Sem registro dinâmico, o app é criado à mão e entra em META_ADS_MCP_CLIENT_ID e _SECRET.
      'Se o servidor aceita registro dinâmico; a pesquisa indica app de desenvolvedor Meta próprio (pré-registrado).',
    ],
  },
  pipedrive: {
    id: 'pipedrive',
    nome: 'Pipedrive',
    portalFixo: true,
    // O conector oficial do Pipedrive, o mesmo que o Claude usa (migration 20261002111000): o servidor MCP em
    // mcp.pipedrive.ai (pesquisa-conectores-mcp-todos.md), com OAuth no próprio Pipedrive. Os endereços de autorização e
    // de token vêm da descoberta (RFC 9728 e 8414), como no Notion. A chave de API continua como alternativa (ADR-0021).
    mcp: {
      url: 'https://mcp.pipedrive.ai/mcp',
      oauth: {
        // não confirmado: se o servidor anuncia registro dinâmico (RFC 7591). Se não anunciar, o app OAuth é criado à mão
        // no Developer Hub do Pipedrive e o client id e o secret entram nestes segredos, como no HubSpot.
        registro: 'dinamico',
        segredos: { clientId: 'PIPEDRIVE_MCP_CLIENT_ID', clientSecret: 'PIPEDRIVE_MCP_CLIENT_SECRET' },
        enviarRecurso: true,
        identificacao: {
          // A mesma consulta da chave de API, com o token no cabeçalho. não confirmado: que o token emitido para o MCP vale
          // na API REST (api.pipedrive.com); se não valer, a identificação segue para a ferramenta abaixo.
          requisicoes: [
            {
              metodo: 'GET',
              url: 'https://api.pipedrive.com/v1/users/me',
              cabecalhos: { Authorization: 'Bearer {credencial}' },
              portal: ['data.company_id'],
              conta: ['data.email', 'data.name'],
            },
          ],
          // O nome da ferramenta vem do conector (pesquisa). não confirmado: os campos do usuário no resultado dela.
          porFerramentaMcp: {
            ferramenta: 'getAccountContext',
            portal: ['user.company_id', 'user.companyId', 'company_id', 'data.user.company_id'],
            conta: ['user.email', 'user.name', 'email', 'data.user.email'],
          },
        },
      },
    },
    chaveDeApi: {
      via: 'rest',
      identificacao: {
        // não confirmado: os nomes dos campos da resposta de /users/me (company_id, email).
        requisicoes: [
          {
            metodo: 'GET',
            url: 'https://api.pipedrive.com/v1/users/me?api_token={credencial}',
            portal: ['data.company_id'],
            conta: ['data.email', 'data.name'],
          },
        ],
      },
    },
    rest: PIPEDRIVE_REST,
    naoConfirmado: [
      'Campos da resposta de /users/me que identificam a conta e a empresa do Pipedrive.',
      'Se o servidor MCP (mcp.pipedrive.ai) anuncia registro dinâmico de cliente; se não, o app OAuth é criado no Developer Hub.',
      'Se o token OAuth do MCP vale na API REST (/v1/users/me) e os campos do usuário no resultado de getAccountContext.',
    ],
  },
  'rd-station': {
    id: 'rd-station',
    nome: 'RD Station CRM',
    portalFixo: false,
    chaveDeApi: {
      via: 'rest',
      identificacao: {
        // não confirmado: que uma listagem de contatos com `limit=1` serve de verificação do token.
        requisicoes: [{ metodo: 'GET', url: 'https://crm.rdstation.com/api/v1/contacts?limit=1&token={credencial}' }],
      },
    },
    rest: RD_STATION_REST,
    naoConfirmado: [
      'Verificação do token e nomes dos filtros de busca e paginação das listas.',
      'Servidor MCP oficial do RD Station.',
      'Os envelopes organization e contact na criação de empresa e contato, e o campo do id na resposta (_id ou id).',
      'Endpoint de nota/anotação numa empresa (a v1 só confirma anotações em negociações): o Envio ao CRM não leva nota ao RD Station.',
    ],
  },
}

/** O perfil de uma Integração: os de 20261001160000 (`PERFIS`) ou os conectores do catálogo ampliado (`CONECTORES`). */
export function perfilDaIntegracao(id: string): PerfilDeIntegracao | null {
  if (Object.hasOwn(PERFIS, id)) return PERFIS[id]
  return Object.hasOwn(CONECTORES, id) ? CONECTORES[id] : null
}

/** Os caminhos de conexão que o perfil oferece; devem ser iguais aos `kinds` do banco. */
export function caminhosDe(perfil: PerfilDeIntegracao): TipoDeAcesso[] {
  const caminhos: TipoDeAcesso[] = []
  if (perfil.mcp?.oauth) caminhos.push('oauth_mcp')
  if (perfil.chaveDeApi) caminhos.push('api_key')
  return caminhos
}

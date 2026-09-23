const icons = {
  building: '<path d="M3 21h18M6 21V5l6-2v18M18 21V9l-6-2M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01"/>',
  bot: '<rect width="18" height="14" x="3" y="6" rx="2"/><path d="M12 2v4M8 12h.01M16 12h.01M9 17h6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4M12 18h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  sort: '<path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6ZM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>',
  signal: '<path d="M4 14a8 8 0 0 1 16 0M7.5 14a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="14" r="1"/><path d="M12 15v6"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.3 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
}

function icon(name, label = '') {
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'
  return `<svg viewBox="0 0 24 24" ${aria}>${icons[name] ?? ''}</svg>`
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon)
  })
}

const accounts = [
  { id: 'openai', name: 'OpenAI', domain: 'openai.com', slug: 'openai', adherence: 'quente', contacts: 6, segment: 'Inteligência artificial', signal: 'Abriu três vagas de engenharia de dados de avaliação', signalDays: 0, signalSource: 'LinkedIn Jobs', lastContact: 'Hoje', lastContactDays: 0, website: 'https://openai.com', linkedin: 'https://www.linkedin.com/company/openai', origin: 'Recomendada pela Althius' },
  { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com', slug: 'anthropic', adherence: 'quente', contacts: 5, segment: 'Inteligência artificial', signal: 'Nova liderança de receita para América Latina', signalDays: 1, signalSource: 'LinkedIn', lastContact: 'Ontem', lastContactDays: 1, website: 'https://anthropic.com', linkedin: 'https://www.linkedin.com/company/anthropicresearch', origin: 'Recomendada pela Althius' },
  { id: 'stripe', name: 'Stripe', domain: 'stripe.com', slug: 'stripe', adherence: 'quente', contacts: 4, segment: 'Serviços financeiros', signal: 'Expansão da operação enterprise no Brasil', signalDays: 2, signalSource: 'Valor Econômico', lastContact: 'Há 2 dias', lastContactDays: 2, website: 'https://stripe.com', linkedin: 'https://www.linkedin.com/company/stripe', origin: 'Recomendada pela Althius' },
  { id: 'nubank', name: 'Nubank', domain: 'nubank.com.br', slug: 'nubank', adherence: 'quente', contacts: 5, segment: 'Serviços financeiros', signal: 'Contratando liderança de IA para atendimento', signalDays: 3, signalSource: 'LinkedIn Jobs', lastContact: 'Há 3 dias', lastContactDays: 3, website: 'https://nubank.com.br', linkedin: 'https://www.linkedin.com/company/nubank', origin: 'Recomendada pela Althius' },
  { id: 'databricks', name: 'Databricks', domain: 'databricks.com', slug: 'databricks', adherence: 'quente', contacts: 4, segment: 'Dados e analytics', signal: 'Anunciou novo hub de dados na América Latina', signalDays: 4, signalSource: 'Sala de imprensa', lastContact: 'Há 4 dias', lastContactDays: 4, website: 'https://databricks.com', linkedin: 'https://www.linkedin.com/company/databricks', origin: 'Recomendada pela Althius' },
  { id: 'snowflake', name: 'Snowflake', domain: 'snowflake.com', slug: 'snowflake', adherence: 'quente', contacts: 3, segment: 'Dados e analytics', signal: 'Novo programa de parceiros para o mercado brasileiro', signalDays: 5, signalSource: 'Portal de parceiros', lastContact: 'Há 5 dias', lastContactDays: 5, website: 'https://snowflake.com', linkedin: 'https://www.linkedin.com/company/snowflake-computing', origin: 'Recomendada pela Althius' },
  { id: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com', slug: 'cloudflare', adherence: 'quente', contacts: 4, segment: 'Infraestrutura', signal: 'Equipe comercial LATAM cresceu 18% no trimestre', signalDays: 6, signalSource: 'LinkedIn', lastContact: 'Há 1 semana', lastContactDays: 7, website: 'https://cloudflare.com', linkedin: 'https://www.linkedin.com/company/cloudflare', origin: 'Recomendada pela Althius' },
  { id: 'gitlab', name: 'GitLab', domain: 'gitlab.com', slug: 'gitlab', adherence: 'quente', contacts: 3, segment: 'DevOps', signal: 'Publicou plano de expansão para contas enterprise', signalDays: 7, signalSource: 'Relatório trimestral', lastContact: 'Há 1 semana', lastContactDays: 8, website: 'https://gitlab.com', linkedin: 'https://www.linkedin.com/company/gitlab-com', origin: 'Recomendada pela Althius' },
  { id: 'figma', name: 'Figma', domain: 'figma.com', slug: 'figma', adherence: 'quente', contacts: 4, segment: 'Produtividade', signal: 'Duas vagas abertas para go-to-market enterprise', signalDays: 8, signalSource: 'LinkedIn Jobs', lastContact: 'Há 1 semana', lastContactDays: 9, website: 'https://figma.com', linkedin: 'https://www.linkedin.com/company/figma', origin: 'Recomendada pela Althius' },
  { id: 'notion', name: 'Notion', domain: 'notion.so', slug: 'notion', adherence: 'quente', contacts: 3, segment: 'Produtividade', signal: 'Lançou pacote corporativo com recursos de IA', signalDays: 9, signalSource: 'Blog da empresa', lastContact: 'Há 2 semanas', lastContactDays: 11, website: 'https://notion.so', linkedin: 'https://www.linkedin.com/company/notionhq', origin: 'Recomendada pela Althius' },
  { id: 'canva', name: 'Canva', domain: 'canva.com', slug: 'canva', adherence: 'quente', contacts: 5, segment: 'Produtividade', signal: 'Novo escritório e liderança comercial em São Paulo', signalDays: 10, signalSource: 'Exame', lastContact: 'Há 2 semanas', lastContactDays: 12, website: 'https://canva.com', linkedin: 'https://www.linkedin.com/company/canva', origin: 'Recomendada pela Althius' },
  { id: 'mongodb', name: 'MongoDB', domain: 'mongodb.com', slug: 'mongodb', adherence: 'quente', contacts: 4, segment: 'Dados e analytics', signal: 'Abriu programa de migração para grandes contas', signalDays: 11, signalSource: 'Blog da empresa', lastContact: 'Há 2 semanas', lastContactDays: 14, website: 'https://mongodb.com', linkedin: 'https://www.linkedin.com/company/mongodbinc', origin: 'Recomendada pela Althius' },
  { id: 'hubspot', name: 'HubSpot', domain: 'hubspot.com', slug: 'hubspot', adherence: 'quente', contacts: 6, segment: 'CRM e marketing', signal: 'Time de alianças busca parceiros de IA generativa', signalDays: 12, signalSource: 'LinkedIn Jobs', lastContact: 'Há 2 semanas', lastContactDays: 15, website: 'https://hubspot.com', linkedin: 'https://www.linkedin.com/company/hubspot', origin: 'Recomendada pela Althius' },
  { id: 'rippling', name: 'Rippling', domain: 'rippling.com', slug: 'rippling', adherence: 'quente', contacts: 3, segment: 'Gestão de pessoas', signal: 'Entrada oficial no mercado latino-americano', signalDays: 13, signalSource: 'Reuters', lastContact: 'Há 2 semanas', lastContactDays: 16, website: 'https://rippling.com', linkedin: 'https://www.linkedin.com/company/rippling', origin: 'Recomendada pela Althius' },
  { id: 'deel', name: 'Deel', domain: 'deel.com', slug: 'deel', adherence: 'quente', contacts: 5, segment: 'Gestão de pessoas', signal: 'Aquisição amplia portfólio de folha global', signalDays: 14, signalSource: 'TechCrunch', lastContact: 'Há 3 semanas', lastContactDays: 18, website: 'https://deel.com', linkedin: 'https://www.linkedin.com/company/deel', origin: 'Recomendada pela Althius' },
  { id: 'vercel', name: 'Vercel', domain: 'vercel.com', slug: 'vercel', adherence: 'quente', contacts: 3, segment: 'Infraestrutura', signal: 'Nova área de vendas para plataformas de IA', signalDays: 16, signalSource: 'LinkedIn Jobs', lastContact: 'Há 3 semanas', lastContactDays: 21, website: 'https://vercel.com', linkedin: 'https://www.linkedin.com/company/vercel', origin: 'Recomendada pela Althius' },
  { id: 'brex', name: 'Brex', domain: 'brex.com', slug: 'brex', adherence: 'quente', contacts: 4, segment: 'Serviços financeiros', signal: 'Equipe de produto B2B anuncia nova plataforma', signalDays: 19, signalSource: 'Blog da empresa', lastContact: 'Há 3 semanas', lastContactDays: 24, website: 'https://brex.com', linkedin: 'https://www.linkedin.com/company/brexhq', origin: 'Recomendada pela Althius' },
  { id: 'ramp', name: 'Ramp', domain: 'ramp.com', slug: 'ramp', adherence: 'quente', contacts: 4, segment: 'Serviços financeiros', signal: 'Rodada de investimento acelera expansão internacional', signalDays: 24, signalSource: 'Bloomberg', lastContact: '12 ago.', lastContactDays: 42, website: 'https://ramp.com', linkedin: 'https://www.linkedin.com/company/ramp', origin: 'Recomendada pela Althius' },
  { id: 'sap', name: 'SAP', domain: 'sap.com', slug: 'sap', adherence: 'fit', contacts: 4, segment: 'Software corporativo', signal: 'Integração de IA anunciada para a suíte de dados', signalDays: 31, signalSource: 'Sala de imprensa', lastContact: '18 jul.', lastContactDays: 67, website: 'https://sap.com', linkedin: 'https://www.linkedin.com/company/sap', origin: 'Recomendada pela Althius' },
  { id: 'twilio', name: 'Twilio', domain: 'twilio.com', slug: 'twilio', adherence: 'fit', contacts: 3, segment: 'Comunicação', signal: 'Nova liderança global de parcerias estratégicas', signalDays: 38, signalSource: 'LinkedIn', lastContact: '4 jul.', lastContactDays: 81, website: 'https://twilio.com', linkedin: 'https://www.linkedin.com/company/twilio-inc-', origin: 'Recomendada pela Althius' },
  { id: 'zendesk', name: 'Zendesk', domain: 'zendesk.com', slug: 'zendesk', adherence: 'fit', contacts: 2, segment: 'Atendimento', signal: 'Pesquisa revela avanço do uso de IA em suporte', signalDays: 45, signalSource: 'Relatório próprio', lastContact: '26 jun.', lastContactDays: 89, website: 'https://zendesk.com', linkedin: 'https://www.linkedin.com/company/zendesk', origin: 'Recomendada pela Althius' },
  { id: 'asana', name: 'Asana', domain: 'asana.com', slug: 'asana', adherence: 'fit', contacts: 3, segment: 'Produtividade', signal: 'Lançou recursos de coordenação por agentes', signalDays: 49, signalSource: 'Blog da empresa', lastContact: '12 jun.', lastContactDays: 103, website: 'https://asana.com', linkedin: 'https://www.linkedin.com/company/asana', origin: 'Recomendada pela Althius' },
  { id: 'monday', name: 'monday.com', domain: 'monday.com', slug: 'mondaydotcom', adherence: 'fit', contacts: 3, segment: 'Produtividade', signal: 'Crescimento de 22% na carteira enterprise', signalDays: 57, signalSource: 'Resultados trimestrais', lastContact: '29 mai.', lastContactDays: 117, website: 'https://monday.com', linkedin: 'https://www.linkedin.com/company/mondaydotcom', origin: 'Recomendada pela Althius' },
  { id: 'okta', name: 'Okta', domain: 'okta.com', slug: 'okta', adherence: 'fit', contacts: 2, segment: 'Segurança', signal: 'Programa global de parceiros foi reformulado', signalDays: 68, signalSource: 'Portal de parceiros', lastContact: 'Nunca', lastContactDays: null, website: 'https://okta.com', linkedin: 'https://www.linkedin.com/company/okta-inc-', origin: 'Recomendada pela Althius' },
  { id: 'oracle', name: 'Oracle', domain: 'oracle.com', slug: 'oracle', adherence: 'fit', contacts: 4, segment: 'Software corporativo', signal: null, signalDays: null, signalSource: null, lastContact: '8 abr.', lastContactDays: 168, website: 'https://oracle.com', linkedin: 'https://www.linkedin.com/company/oracle', origin: 'Recomendada pela Althius' },
  { id: 'miro', name: 'Miro', domain: 'miro.com', slug: null, adherence: 'fit', contacts: 0, segment: 'Produtividade', signal: null, signalDays: null, signalSource: null, lastContact: 'Nunca', lastContactDays: null, website: null, linkedin: null, origin: 'Recomendada pela Althius' },
  { id: 'mercadolivre', name: 'Mercado Livre', domain: 'mercadolivre.com.br', slug: 'mercadopago', adherence: 'nao-fit', contacts: 3, segment: 'Comércio eletrônico', signal: 'Consolidou operações de tecnologia na região', signalDays: 73, signalSource: 'Estadão', lastContact: '22 mar.', lastContactDays: 185, website: 'https://mercadolivre.com.br', linkedin: 'https://www.linkedin.com/company/mercadolivre-com', origin: 'Importada por Marina em 12 set.' },
  { id: 'rappi', name: 'Rappi', domain: 'rappi.com.br', slug: null, adherence: 'nao-fit', contacts: 0, segment: null, signal: 'Reorganização da operação B2B no Brasil', signalDays: 84, signalSource: 'NeoFeed', lastContact: 'Nunca', lastContactDays: null, website: null, linkedin: null, origin: 'Importada por Marina em 12 set.' },
  { id: 'banorte', name: 'Banorte', domain: 'banorte.com', slug: null, adherence: 'nao-fit', contacts: 0, segment: 'Serviços financeiros', signal: null, signalDays: null, signalSource: null, lastContact: 'Nunca', lastContactDays: null, website: 'https://banorte.com', linkedin: null, origin: 'Importada por Marina em 12 set.' },
  { id: 'bbva', name: 'BBVA México', domain: 'bbva.mx', slug: null, adherence: null, contacts: 2, segment: null, signal: 'Nova unidade de inovação para serviços corporativos', signalDays: 91, signalSource: 'El Economista', lastContact: 'Nunca', lastContactDays: null, website: null, linkedin: null, origin: 'Importada por Marina em 12 set.' },
]

const firstNames = ['Aline', 'Bruno', 'Camila', 'Daniel', 'Elisa', 'Felipe', 'Giovana', 'Henrique', 'Isabela', 'João', 'Karen', 'Lucas', 'Mariana', 'Nicolas', 'Olívia', 'Paulo', 'Renata', 'Samuel', 'Talita', 'Vicente']
const lastNames = ['Almeida', 'Barros', 'Cardoso', 'Duarte', 'Esteves', 'Freitas', 'Gomes', 'Haddad', 'Ibrahim', 'Junqueira', 'Klein', 'Lemos', 'Moraes', 'Nogueira', 'Oliveira', 'Prado', 'Queiroz', 'Ramos', 'Siqueira', 'Tavares']
const roles = ['VP de Receita', 'Diretora de Growth', 'Head de Dados', 'Gerente de RevOps', 'Líder de Engenharia de Dados', 'Diretora Comercial']
const areas = ['Receita', 'Marketing', 'Dados', 'Operações', 'Tecnologia', 'Vendas']
const personas = ['Patrocinador executivo', 'Campeão interno', 'Líder técnico', 'Usuário-chave', null]

let contactIndex = 0
const contacts = accounts.flatMap((account, accountIndex) => Array.from({ length: account.contacts }, (_, localIndex) => {
  const index = contactIndex++
  const hasPhoto = (index % 5 !== 3) && (localIndex !== 2 || index % 2 === 0)
  const photoId = ((index * 3 + localIndex) % 16) + 1
  return {
    id: `${account.id}-${localIndex + 1}`,
    accountId: account.id,
    name: `${firstNames[(index * 3 + accountIndex) % firstNames.length]} ${lastNames[(index * 7 + localIndex) % lastNames.length]}`,
    role: index % 11 === 0 ? null : roles[(accountIndex + localIndex) % roles.length],
    area: index % 13 === 0 ? null : areas[(index + 2) % areas.length],
    persona: personas[(index + accountIndex) % personas.length],
    email: index % 5 !== 0,
    phone: index % 3 === 0,
    linkedin: index % 4 !== 1,
    avatarUrl: hasPhoto ? `./avatars/avatar-${photoId}.jpg` : null,
    lastContact: localIndex === 0 ? account.lastContact : index % 7 === 0 ? 'Nunca' : account.lastContact,
  }
}))

const segments = [...new Set(accounts.map((account) => account.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const state = {
  view: 'accounts',
  selectedAccountId: null,
  detailAnchor: null,
  search: '',
  sort: 'priority',
  filterOpen: true,
  filters: {
    adherence: new Set(['quente', 'fit', 'nao-fit']),
    segments: new Set(),
    signal: 'todos',
    contacts: 'todos',
  },
  contactSearch: '',
  contactFilterOpen: false,
  contactFilters: { adherence: new Set(), withData: false },
}

const previewParams = new URLSearchParams(window.location.search)
if (previewParams.get('theme') === 'claro') document.documentElement.dataset.theme = 'claro'
if (previewParams.get('view') === 'contacts') {
  state.view = 'contacts'
  state.filterOpen = false
}
if (previewParams.get('account')) {
  state.view = 'detail'
  state.selectedAccountId = previewParams.get('account')
  state.filterOpen = false
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function accountById(id) {
  return accounts.find((account) => account.id === id)
}

function adherenceRank(value) {
  return { quente: 0, fit: 1, 'nao-fit': 2, null: 3 }[value] ?? 3
}

function filteredAccounts() {
  const query = normalize(state.search)
  return accounts
    .filter((account) => !query || normalize(account.name).includes(query) || normalize(account.domain).includes(query))
    .filter((account) => state.filters.adherence.size === 0 || state.filters.adherence.has(account.adherence))
    .filter((account) => state.filters.segments.size === 0 || state.filters.segments.has(account.segment))
    .filter((account) => state.filters.signal === 'todos' || (state.filters.signal === 'com' ? account.signal : !account.signal))
    .filter((account) => state.filters.contacts === 'todos' || (state.filters.contacts === 'com' ? account.contacts > 0 : account.contacts === 0))
    .sort((a, b) => {
      if (state.sort === 'signal') return (a.signalDays ?? Infinity) - (b.signalDays ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR')
      if (state.sort === 'contacts') return b.contacts - a.contacts || a.name.localeCompare(b.name, 'pt-BR')
      if (state.sort === 'last-contact') return (a.lastContactDays ?? Infinity) - (b.lastContactDays ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR')
      return adherenceRank(a.adherence) - adherenceRank(b.adherence) || (a.signalDays ?? Infinity) - (b.signalDays ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR')
    })
}

function activeFilterCount() {
  return state.filters.adherence.size + state.filters.segments.size + (state.filters.signal === 'todos' ? 0 : 1) + (state.filters.contacts === 'todos' ? 0 : 1)
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

const svgLogos = new Set([
  'openai', 'anthropic', 'stripe', 'nubank', 'databricks',
  'snowflake', 'cloudflare', 'gitlab', 'figma', 'notion',
  'mongodb', 'hubspot', 'vercel', 'brex', 'sap',
  'twilio', 'zendesk', 'asana', 'okta', 'oracle', 'mercadolivre'
])

function getLogoUrl(account) {
  if (svgLogos.has(account.id)) {
    return `./logos/${account.id}.svg`
  }
  return `./logos/${account.id}.png`
}

function logo(account, extraClass = '') {
  const logoUrl = getLogoUrl(account)
  return `<span class="company-logo ${extraClass}" aria-hidden="true"><img src="${logoUrl}" alt="${account.name}" loading="lazy" onerror="this.remove();this.parentElement.classList.add('fallback');this.parentElement.textContent='${initials(account.name)}'" /></span>`
}

function avatar(target, index = 0) {
  let name = ''
  let avatarUrl = null
  if (typeof target === 'object' && target !== null) {
    name = target.name || ''
    avatarUrl = target.avatarUrl || null
  } else {
    name = String(target || '')
    const found = contacts.find((c) => c.name === name)
    if (found) avatarUrl = found.avatarUrl
  }
  const hues = [345, 22, 165, 204, 262, 43]
  const bg = `hsl(${hues[index % hues.length]} 34% 24%)`

  if (avatarUrl) {
    return `<span class="avatar has-photo" aria-hidden="true" title="${name} (foto do LinkedIn)"><img src="${avatarUrl}" alt="${name}" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-photo');this.parentElement.style.background='${bg}';this.parentElement.style.color='#fff';this.parentElement.textContent='${initials(name)}'" /></span>`
  }
  return `<span class="avatar" style="background:${bg};color:#fff" aria-hidden="true" title="${name}">${initials(name)}</span>`
}

function adherence(value) {
  if (value === 'quente') return '<span class="adherence hot">🔥 Quente</span>'
  if (value === 'fit') return '<span class="adherence">Fit</span>'
  if (value === 'nao-fit') return '<span class="adherence not-fit">Não fit</span>'
  return '<span class="muted" title="Aderência ainda não avaliada" aria-label="Aderência ainda não avaliada">—</span>'
}

function companyPopover(account) {
  if (!account.website && !account.linkedin) return ''
  const links = [
    account.website ? `<a href="${account.website}" target="_blank" rel="noreferrer" data-external>${icon('globe')}Site${icon('external')}</a>` : '',
    account.linkedin ? `<a href="${account.linkedin}" target="_blank" rel="noreferrer" data-external>${icon('linkedin')}LinkedIn${icon('external')}</a>` : '',
  ].join('')
  return `<aside class="company-popover" aria-label="Links de ${account.name}">
    <div class="popover-heading">${logo(account)}<span><strong>${account.name}</strong>${account.domain ?? 'Domínio não informado'}</span></div>
    <div class="popover-links">${links}</div>
  </aside>`
}

function companyCell(account, preview = false) {
  return `<div class="company-cell${preview ? ' is-previewing' : ''}">
    ${logo(account)}
    <span class="company-copy">
      <button class="company-name" type="button" data-open-detail="${account.id}">${account.name}</button>
      <span class="company-domain">${account.domain ?? 'Domínio não informado'}</span>
    </span>
    ${companyPopover(account)}
  </div>`
}

function contactPreview(account) {
  if (account.contacts === 0) return '<span class="muted">Nenhum contato</span>'
  const accountContacts = contacts.filter((contact) => contact.accountId === account.id).slice(0, 3)
  const label = `${account.contacts} ${account.contacts === 1 ? 'contato' : 'contatos'}`
  return `<div class="contact-stack">${accountContacts.map((contact, index) => avatar(contact, index)).join('')}<button class="contact-count" type="button" data-open-contacts="${account.id}">${label}</button></div>`
}

function signalCell(account) {
  if (!account.signal) return '<span class="muted">Nenhum sinal</span>'
  const date = account.signalDays === 0 ? 'hoje' : account.signalDays === 1 ? 'ontem' : account.signalDays < 7 ? `há ${account.signalDays} dias` : account.signalDays < 30 ? `há ${Math.floor(account.signalDays / 7)} semanas` : `${account.signalDays} dias atrás`
  return `<span class="signal-cell" title="${account.signal} · ${date}"><span class="signal-icon">${icon('signal')}</span><span class="signal-copy">${account.signal}</span><span class="signal-date">· ${date}</span></span>`
}

function filterPanel() {
  const adherenceOptions = [
    ['quente', 'Quente', 18],
    ['fit', 'Fit', 8],
    ['nao-fit', 'Não fit', 3],
  ]
  return `<section class="filter-panel${state.filterOpen ? ' open' : ''}" aria-label="Filtros de contas">
    <div class="filter-panel-header"><strong>Filtrar contas</strong><button class="text-button" type="button" data-clear-filters>Limpar tudo</button></div>
    <div class="filter-groups">
      <div class="filter-group"><span class="filter-group-title">Aderência</span>${adherenceOptions.map(([value, label, count]) => `<label class="check-option"><input type="checkbox" data-filter="adherence" value="${value}" ${state.filters.adherence.has(value) ? 'checked' : ''}/><span>${label}</span><small>${count}</small></label>`).join('')}</div>
      <div class="filter-group"><span class="filter-group-title">Segmento</span>${segments.slice(0, 5).map((segment) => `<label class="check-option"><input type="checkbox" data-filter="segment" value="${segment}" ${state.filters.segments.has(segment) ? 'checked' : ''}/><span>${segment}</span></label>`).join('')}</div>
      <div class="filter-group"><span class="filter-group-title">Sinal</span><label class="check-option"><input type="radio" name="signal" data-filter="signal" value="com" ${state.filters.signal === 'com' ? 'checked' : ''}/><span>Com sinal</span></label><label class="check-option"><input type="radio" name="signal" data-filter="signal" value="sem" ${state.filters.signal === 'sem' ? 'checked' : ''}/><span>Sem sinal</span></label></div>
      <div class="filter-group"><span class="filter-group-title">Contatos</span><label class="check-option"><input type="radio" name="contacts" data-filter="contacts" value="com" ${state.filters.contacts === 'com' ? 'checked' : ''}/><span>Com contatos</span></label><label class="check-option"><input type="radio" name="contacts" data-filter="contacts" value="sem" ${state.filters.contacts === 'sem' ? 'checked' : ''}/><span>Sem contatos</span></label></div>
    </div>
  </section>`
}

function activeFilterChips() {
  const adherenceLabels = { quente: 'Quente', fit: 'Fit', 'nao-fit': 'Não fit' }
  const chips = [
    ...[...state.filters.adherence].map((value) => [`Aderência: ${adherenceLabels[value]}`, 'adherence', value]),
    ...[...state.filters.segments].map((value) => [`Segmento: ${value}`, 'segment', value]),
    ...(state.filters.signal !== 'todos' ? [[state.filters.signal === 'com' ? 'Com sinal' : 'Sem sinal', 'signal', state.filters.signal]] : []),
    ...(state.filters.contacts !== 'todos' ? [[state.filters.contacts === 'com' ? 'Com contatos' : 'Sem contatos', 'contacts', state.filters.contacts]] : []),
  ]
  if (chips.length === 0) return ''
  return `${chips.map(([label, group, value]) => `<span class="filter-chip">${label}<button type="button" aria-label="Remover filtro ${label}" data-remove-filter="${group}" data-value="${value}">${icon('x')}</button></span>`).join('')}<button class="text-button clear-filters" type="button" data-clear-filters>Limpar filtros</button>`
}

function accountsTableRows(items) {
  return items.map((account, index) => `<tr data-account-row="${account.id}">
    <td>${companyCell(account, index === 0 && state.filterOpen && !state.search)}</td>
    <td>${adherence(account.adherence)}</td>
    <td>${contactPreview(account)}</td>
    <td>${signalCell(account)}</td>
    <td>${account.segment ?? '<span class="muted">—</span>'}</td>
    <td class="nowrap ${account.lastContact === 'Nunca' ? 'muted' : ''}">${account.lastContact}</td>
  </tr>`).join('')
}

function renderAccounts() {
  const items = filteredAccounts()
  const constrained = Boolean(state.search || activeFilterCount())
  const countText = constrained ? `<strong>${items.length}</strong> de ${accounts.length} contas` : `<strong>${accounts.length}</strong> contas`
  return `<header class="page-heading">
      <div><h2>Contas</h2><p>Empresas do seu mercado organizadas pelo momento de abordagem.</p></div>
      <span class="result-count">${countText}</span>
    </header>
    <div class="table-toolbar">
      <label class="search-control">${icon('search')}<input type="search" value="${state.search}" placeholder="Buscar por empresa ou domínio" aria-label="Buscar contas" data-account-search /></label>
      <span class="toolbar-spacer"></span>
      <button class="button ${activeFilterCount() ? 'active-control' : ''}" type="button" data-toggle-filters>${icon('filter')}Filtros${activeFilterCount() ? `<span class="filter-count">${activeFilterCount()}</span>` : ''}</button>
      <label class="sr-only" for="account-sort">Ordenar por</label>
      <select id="account-sort" class="select-control" data-account-sort aria-label="Ordenar por">
        <option value="priority" ${state.sort === 'priority' ? 'selected' : ''}>Ordenar por: Prioridade</option>
        <option value="signal" ${state.sort === 'signal' ? 'selected' : ''}>Ordenar por: Último sinal</option>
        <option value="contacts" ${state.sort === 'contacts' ? 'selected' : ''}>Ordenar por: Contatos</option>
        <option value="last-contact" ${state.sort === 'last-contact' ? 'selected' : ''}>Ordenar por: Último contato</option>
      </select>
      ${filterPanel()}
    </div>
    <div class="active-filters">${activeFilterChips()}</div>
    ${items.length ? `<div class="table-frame"><table class="data-table accounts-table"><thead><tr><th>Empresa</th><th>Aderência</th><th>Contatos</th><th>Último sinal</th><th>Segmento</th><th>Último contato</th></tr></thead><tbody>${accountsTableRows(items)}</tbody></table></div>` : `<div class="empty-table"><div><strong>Nenhuma conta encontrada</strong><p>Tente remover a busca ou os filtros ativos.</p><button class="button" type="button" data-reset-accounts>Limpar busca e filtros</button></div></div>`}`
}

function channelIcon(channel, available) {
  const labels = { mail: 'E-mail', phone: 'Telefone', linkedin: 'LinkedIn' }
  return `<span class="channel ${available ? '' : 'unavailable'}" title="${labels[channel]} ${available ? 'disponível' : 'indisponível'}">${icon(channel, `${labels[channel]} ${available ? 'disponível' : 'indisponível'}`)}</span>`
}

function filteredContacts() {
  const query = normalize(state.contactSearch)
  return contacts
    .filter((contact) => {
      const account = accountById(contact.accountId)
      return !query || [contact.name, contact.role, account.name].some((value) => normalize(value).includes(query))
    })
    .filter((contact) => {
      const account = accountById(contact.accountId)
      return state.contactFilters.adherence.size === 0 || state.contactFilters.adherence.has(account.adherence)
    })
    .filter((contact) => !state.contactFilters.withData || contact.email || contact.phone || contact.linkedin)
    .sort((a, b) => {
      const accountA = accountById(a.accountId)
      const accountB = accountById(b.accountId)
      return adherenceRank(accountA.adherence) - adherenceRank(accountB.adherence) || accountA.name.localeCompare(accountB.name, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR')
    })
}

function contactFilterPanel() {
  return `<section class="filter-panel${state.contactFilterOpen ? ' open' : ''}" style="right:0;width:390px" aria-label="Filtros de contatos">
    <div class="filter-panel-header"><strong>Filtrar contatos</strong><button class="text-button" type="button" data-clear-contact-filters>Limpar tudo</button></div>
    <div class="filter-groups" style="grid-template-columns:1.2fr 1fr">
      <div class="filter-group"><span class="filter-group-title">Aderência da empresa</span>${[['quente', 'Quente'], ['fit', 'Fit'], ['nao-fit', 'Não fit']].map(([value, label]) => `<label class="check-option"><input type="checkbox" data-contact-filter="adherence" value="${value}" ${state.contactFilters.adherence.has(value) ? 'checked' : ''}/><span>${label}</span></label>`).join('')}</div>
      <div class="filter-group"><span class="filter-group-title">Dados de contato</span><label class="check-option"><input type="checkbox" data-contact-filter="with-data" ${state.contactFilters.withData ? 'checked' : ''}/><span>Com algum canal</span></label></div>
    </div>
  </section>`
}

function renderContacts() {
  const items = filteredContacts()
  const filterCount = state.contactFilters.adherence.size + (state.contactFilters.withData ? 1 : 0)
  return `<header class="page-heading">
      <div><h2>Contatos</h2><p>Pessoas das Contas-alvo, organizadas para a próxima abordagem.</p></div>
      <span class="result-count"><strong>${items.length}</strong>${items.length !== contacts.length ? ` de ${contacts.length}` : ''} contatos</span>
    </header>
    <div class="table-toolbar">
      <label class="search-control">${icon('search')}<input type="search" value="${state.contactSearch}" placeholder="Buscar por nome, cargo ou empresa" aria-label="Buscar contatos" data-contact-search /></label>
      <span class="toolbar-spacer"></span>
      <button class="button ${filterCount ? 'active-control' : ''}" type="button" data-toggle-contact-filters>${icon('filter')}Filtros${filterCount ? `<span class="filter-count">${filterCount}</span>` : ''}</button>
      ${contactFilterPanel()}
    </div>
    <div class="table-frame"><table class="data-table contacts-table"><thead><tr><th>Nome</th><th>Cargo</th><th>Empresa</th><th>Área</th><th>Persona</th><th>Dados de contato</th><th>Último contato</th></tr></thead><tbody>
      ${items.map((contact, index) => {
        const account = accountById(contact.accountId)
        return `<tr><td><div class="company-cell">${avatar(contact, index)}<span class="company-copy"><strong class="company-name">${contact.name}</strong></span></div></td><td>${contact.role ?? '<span class="muted">—</span>'}</td><td><button class="company-name" type="button" data-open-detail="${account.id}">${account.name}</button></td><td>${contact.area ?? '<span class="muted">—</span>'}</td><td>${contact.persona ?? '<span class="muted">—</span>'}</td><td><span class="channel-icons">${channelIcon('mail', contact.email)}${channelIcon('phone', contact.phone)}${channelIcon('linkedin', contact.linkedin)}</span></td><td class="${contact.lastContact === 'Nunca' ? 'muted' : ''}">${contact.lastContact}</td></tr>`
      }).join('')}
    </tbody></table></div>`
}

function renderDetail(account) {
  const accountContacts = contacts.filter((contact) => contact.accountId === account.id)
  const hasInteractions = account.lastContactDays !== null
  const historicSignals = account.signal ? [
    ['Equipe de operações de receita cresceu no último trimestre', 'há 3 semanas · LinkedIn'],
    ['Liderança mencionou eficiência comercial como prioridade', '12 ago. · Entrevista'],
  ] : []
  return `<button class="breadcrumb" type="button" data-back-accounts>${icon('back')}Contas / ${account.name}</button>
    <header class="detail-header">
      ${logo(account)}
      <div class="detail-heading"><h2>${account.name}</h2><div class="detail-meta">
        ${account.website ? `<a href="${account.website}" target="_blank" rel="noreferrer" data-external>${account.domain}${icon('external')}</a>` : `<span>${account.domain ?? 'Domínio não informado'}</span>`}
        ${account.linkedin ? `<a href="${account.linkedin}" target="_blank" rel="noreferrer" data-external>${icon('linkedin')}LinkedIn</a>` : ''}
        <span>${account.segment ?? 'Segmento não informado'}</span>${adherence(account.adherence)}
      </div><p class="origin">${account.origin}</p></div>
    </header>
    <div class="detail-sections">
      <div class="detail-main">
        <section class="detail-section" id="signals"><div class="section-heading"><h3>Sinais</h3><span>${account.signal ? `${historicSignals.length + 1} sinais` : '0 sinais'}</span></div>
          ${account.signal ? `<article class="featured-signal"><p>${account.signal}</p><div class="signal-meta"><span>Hoje, 09:42</span><span>Fonte: ${account.signalSource}</span><span>Detectado por Scopus</span></div></article><div class="timeline" style="margin-top:22px">${historicSignals.map(([text, meta]) => `<div class="timeline-item"><p>${text}</p><small>${meta}</small></div>`).join('')}</div>` : '<div class="section-empty">Nenhum sinal</div>'}
        </section>
        <section class="detail-section" id="contacts"><div class="section-heading"><h3>Contatos</h3><span>${accountContacts.length} ${accountContacts.length === 1 ? 'contato' : 'contatos'}</span></div>
          ${accountContacts.length ? `<table class="mini-table"><thead><tr><th>Nome</th><th>Cargo</th><th>Persona</th><th>Dados</th></tr></thead><tbody>${accountContacts.map((contact, index) => `<tr><td><div class="person-cell">${avatar(contact, index)}<span>${contact.name}</span></div></td><td>${contact.role ?? '<span class="muted">—</span>'}</td><td>${contact.persona ?? '<span class="muted">—</span>'}</td><td><span class="channel-icons">${channelIcon('mail', contact.email)}${channelIcon('phone', contact.phone)}${channelIcon('linkedin', contact.linkedin)}</span></td></tr>`).join('')}</tbody></table>` : '<div class="section-empty">Nenhum contato</div>'}
        </section>
        <section class="detail-section" id="interactions"><div class="section-heading"><h3>Interações</h3><span>${hasInteractions ? '3 interações' : '0 interações'}</span></div>
          ${hasInteractions ? `<div class="timeline"><div class="timeline-item"><p>E-mail enviado para ${accountContacts[0]?.name ?? 'Contato principal'}</p><small>${account.lastContact} · Marina Costa · Althius</small></div><div class="timeline-item"><p>Reunião de descoberta</p><small>há 3 semanas · HubSpot</small></div><div class="timeline-item"><p>Mensagem enviada no LinkedIn</p><small>12 ago. · Marina Costa</small></div></div>` : '<div class="section-empty">Nenhuma interação registrada</div>'}
        </section>
      </div>
      <aside class="detail-aside">
        <div class="aside-block"><h3>Visão geral</h3><dl class="fact-list"><dt>Aderência</dt><dd>${adherence(account.adherence)}</dd><dt>Segmento</dt><dd>${account.segment ?? '—'}</dd><dt>Contatos</dt><dd>${account.contacts || 'Nenhum'}</dd><dt>Último contato</dt><dd>${account.lastContact}</dd></dl></div>
        <div class="aside-block"><h3>Próxima ação</h3><p class="muted" style="margin:0 0 14px">Use os Sinais recentes para contextualizar a abordagem.</p><button class="button" type="button">Abrir conversa com Rhetor ${icon('arrow')}</button></div>
      </aside>
    </div>`
}

function setActiveView(view) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view))
  document.getElementById('module-tabs').hidden = view === 'detail'
}

function render() {
  const view = document.getElementById('view')
  setActiveView(state.view)
  if (state.view === 'accounts') view.innerHTML = renderAccounts()
  else if (state.view === 'contacts') view.innerHTML = renderContacts()
  else view.innerHTML = renderDetail(accountById(state.selectedAccountId))
  hydrateIcons(view)
  if (state.view === 'detail' && state.detailAnchor) {
    requestAnimationFrame(() => document.getElementById(state.detailAnchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    state.detailAnchor = null
  }
}

function resetAccountFilters() {
  state.search = ''
  state.filters.adherence.clear()
  state.filters.segments.clear()
  state.filters.signal = 'todos'
  state.filters.contacts = 'todos'
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a, tr')
  if (!target) return
  if (target.matches('[data-external]')) return
  if (target.matches('[data-view]')) {
    state.view = target.dataset.view
    state.filterOpen = false
    state.contactFilterOpen = false
    render()
    return
  }
  if (target.matches('[data-nav]')) {
    state.view = target.dataset.nav
    render()
    return
  }
  if (target.matches('[data-toggle-filters]')) {
    state.filterOpen = !state.filterOpen
    render()
    return
  }
  if (target.matches('[data-toggle-contact-filters]')) {
    state.contactFilterOpen = !state.contactFilterOpen
    render()
    return
  }
  if (target.matches('[data-clear-filters]')) {
    resetAccountFilters()
    render()
    return
  }
  if (target.matches('[data-reset-accounts]')) {
    resetAccountFilters()
    render()
    return
  }
  if (target.matches('[data-clear-contact-filters]')) {
    state.contactFilters.adherence.clear()
    state.contactFilters.withData = false
    render()
    return
  }
  if (target.matches('[data-remove-filter]')) {
    const group = target.dataset.removeFilter
    const value = target.dataset.value
    if (group === 'adherence') state.filters.adherence.delete(value)
    if (group === 'segment') state.filters.segments.delete(value)
    if (group === 'signal') state.filters.signal = 'todos'
    if (group === 'contacts') state.filters.contacts = 'todos'
    render()
    return
  }
  if (target.matches('[data-open-contacts]')) {
    state.selectedAccountId = target.dataset.openContacts
    state.detailAnchor = 'contacts'
    state.view = 'detail'
    render()
    return
  }
  if (target.matches('[data-open-detail]')) {
    state.selectedAccountId = target.dataset.openDetail
    state.view = 'detail'
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (target.matches('[data-account-row]')) {
    state.selectedAccountId = target.dataset.accountRow
    state.view = 'detail'
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (target.matches('[data-back-accounts]')) {
    state.view = 'accounts'
    render()
  }
})

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-account-search]')) {
    state.search = event.target.value
    state.filterOpen = false
    render()
    document.querySelector('[data-account-search]')?.focus()
  }
  if (event.target.matches('[data-contact-search]')) {
    state.contactSearch = event.target.value
    state.contactFilterOpen = false
    render()
    document.querySelector('[data-contact-search]')?.focus()
  }
})

document.addEventListener('change', (event) => {
  const target = event.target
  if (target.matches('[data-account-sort]')) {
    state.sort = target.value
    render()
    return
  }
  if (target.matches('[data-filter="adherence"]')) {
    target.checked ? state.filters.adherence.add(target.value) : state.filters.adherence.delete(target.value)
    render()
    return
  }
  if (target.matches('[data-filter="segment"]')) {
    target.checked ? state.filters.segments.add(target.value) : state.filters.segments.delete(target.value)
    render()
    return
  }
  if (target.matches('[data-filter="signal"]')) {
    state.filters.signal = target.value
    render()
    return
  }
  if (target.matches('[data-filter="contacts"]')) {
    state.filters.contacts = target.value
    render()
    return
  }
  if (target.matches('[data-contact-filter="adherence"]')) {
    target.checked ? state.contactFilters.adherence.add(target.value) : state.contactFilters.adherence.delete(target.value)
    render()
    return
  }
  if (target.matches('[data-contact-filter="with-data"]')) {
    state.contactFilters.withData = target.checked
    render()
  }
})

document.getElementById('theme-toggle').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme === 'claro'
  document.documentElement.dataset.theme = light ? 'escuro' : 'claro'
  const button = document.getElementById('theme-toggle')
  button.setAttribute('aria-label', light ? 'Alternar para tema claro' : 'Alternar para tema escuro')
  button.innerHTML = icon(light ? 'sun' : 'moon')
})

document.getElementById('accounts-tab-count').textContent = String(accounts.length)
document.getElementById('contacts-tab-count').textContent = String(contacts.length)
hydrateIcons()
render()

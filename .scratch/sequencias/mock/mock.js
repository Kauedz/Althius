// Mock descartável do módulo Sequências. Não entra no app nem nos testes.
// Estado só em memória: lista, bloco da Conta e documento leem o mesmo objeto.

const icons = {
  building: '<path d="M3 21h18M6 21V5l6-2v18M18 21V9l-6-2M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01"/>',
  bot: '<rect width="18" height="14" x="3" y="6" rx="2"/><path d="M12 2v4M8 12h.01M16 12h.01M9 17h6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8Z"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4M12 18h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
  linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6ZM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>',
  whatsapp: '<path d="M3 21l1.65-4.95A9 9 0 1 1 8 20.1Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2Z"/>',
  sms: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.3 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>',
  task: '<rect width="18" height="18" x="3" y="3"/><path d="m8 12 3 3 5-6"/>',
  image: '<rect width="18" height="18" x="3" y="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect width="15" height="14" x="2" y="5"/><path d="m17 10 5-3v10l-5-3Z"/>',
  play: '<path d="M7 4v16l13-8Z" fill="currentColor"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  calendar: '<rect width="18" height="18" x="3" y="4"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
}

function icon(name, label = '') {
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'
  return `<svg viewBox="0 0 24 24" ${aria}>${icons[name] ?? ''}</svg>`
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon) })
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------- Dados simulados (Contas-alvo reais, pessoas fictícias) ----------

const ASSETS = '../../contas-e-contatos/mock'
const SENDER = 'Marina Costa'
const TODAY = new Date(2026, 8, 23) // qua., 23 set. 2026

const accounts = [
  { id: 'openai', name: 'OpenAI', domain: 'openai.com', adherence: 'Quente', segment: 'inteligência artificial', signal: 'Abriu três vagas de engenharia de dados de avaliação' },
  { id: 'anthropic', name: 'Anthropic', domain: 'anthropic.com', adherence: 'Quente', segment: 'inteligência artificial', signal: 'Nova liderança de receita para América Latina' },
  { id: 'stripe', name: 'Stripe', domain: 'stripe.com', adherence: 'Quente', segment: 'serviços financeiros', signal: 'Expansão da operação enterprise no Brasil' },
  { id: 'nubank', name: 'Nubank', domain: 'nubank.com.br', adherence: 'Quente', segment: 'serviços financeiros', signal: 'Contratando liderança de IA para atendimento' },
  { id: 'snowflake', name: 'Snowflake', domain: 'snowflake.com', adherence: 'Quente', segment: 'dados e analytics', signal: 'Novo programa de parceiros para o mercado brasileiro' },
  { id: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com', adherence: 'Quente', segment: 'infraestrutura', signal: 'Equipe comercial LATAM cresceu 18% no trimestre' },
  { id: 'gitlab', name: 'GitLab', domain: 'gitlab.com', adherence: 'Quente', segment: 'DevOps', signal: 'Publicou plano de expansão para contas enterprise' },
  { id: 'figma', name: 'Figma', domain: 'figma.com', adherence: 'Quente', segment: 'produtividade', signal: 'Duas vagas abertas para go-to-market enterprise' },
  { id: 'notion', name: 'Notion', domain: 'notion.so', adherence: 'Quente', segment: 'produtividade', signal: 'Lançou pacote corporativo com recursos de IA' },
  { id: 'miro', name: 'Miro', domain: 'miro.com', adherence: 'Fit', segment: 'produtividade', signal: null },
]

const contacts = [
  ['openai', 'oa1', 'Camila Duarte', 'VP de Receita', 'Patrocinador executivo', 3],
  ['openai', 'oa2', 'Felipe Moraes', 'Líder de Engenharia de Dados', 'Líder técnico', 6],
  ['openai', 'oa3', 'Renata Klein', 'Gerente de RevOps', 'Campeão interno', 5],
  ['openai', 'oa4', 'Bruno Tavares', 'Head de Dados', 'Usuário-chave', null],
  ['openai', 'oa5', 'Isabela Prado', 'Diretora de Growth', null, 9],
  ['anthropic', 'an1', 'Lucas Haddad', 'VP de Receita LATAM', 'Patrocinador executivo', 8],
  ['anthropic', 'an2', 'Olívia Ramos', 'Diretora Comercial', 'Campeão interno', 11],
  ['anthropic', 'an3', 'Samuel Barros', 'Head de Dados', 'Líder técnico', null],
  ['stripe', 'st1', 'Mariana Gomes', 'Diretora Comercial', 'Patrocinador executivo', 12],
  ['stripe', 'st2', 'Henrique Lemos', 'Gerente de RevOps', 'Campeão interno', 7],
  ['nubank', 'nu1', 'Talita Nogueira', 'Head de IA', 'Patrocinador executivo', 14],
  ['nubank', 'nu2', 'Paulo Freitas', 'Líder de Engenharia de Dados', 'Líder técnico', 2],
  ['nubank', 'nu3', 'Aline Siqueira', 'Gerente de Operações', 'Usuário-chave', 15],
  ['snowflake', 'sn1', 'Vicente Queiroz', 'Diretor de Parcerias', 'Patrocinador executivo', 4],
  ['snowflake', 'sn2', 'Karen Almeida', 'Gerente de Alianças', 'Campeão interno', null],
  ['cloudflare', 'cf1', 'João Esteves', 'VP de Vendas LATAM', 'Patrocinador executivo', 10],
  ['gitlab', 'gl1', 'Giovana Oliveira', 'Diretora de Growth', 'Patrocinador executivo', 13],
  ['gitlab', 'gl2', 'Nicolas Ibrahim', 'Head de Dados', 'Líder técnico', 16],
  ['figma', 'fg1', 'Daniel Cardoso', 'VP de Receita', 'Patrocinador executivo', 6],
  ['figma', 'fg2', 'Elisa Junqueira', 'Gerente de RevOps', 'Campeão interno', null],
  ['figma', 'fg3', 'Paulo Prado', 'Head de Dados', 'Líder técnico', 3],
  ['notion', 'no1', 'Karen Barros', 'Diretora Comercial', 'Campeão interno', 5],
].map(([accountId, id, name, role, persona, photo]) => ({ accountId, id, name, role, persona, avatarUrl: photo ? `${ASSETS}/avatars/avatar-${photo}.jpg` : null }))

const channels = {
  email: { label: 'E-mail', icon: 'mail', title: 'E-mail' },
  linkedin: { label: 'LinkedIn', icon: 'linkedin', title: 'Convite no LinkedIn' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp', title: 'Mensagem no WhatsApp' },
  sms: { label: 'SMS', icon: 'sms', title: 'SMS' },
  ligacao: { label: 'Ligação', icon: 'phone', title: 'Ligação' },
  tarefa: { label: 'Tarefa', icon: 'task', title: 'Tarefa' },
}

const variables = [
  ['conta.nome', 'Conta'],
  ['conta.sinal', 'Conta'],
  ['conta.segmento', 'Conta'],
  ['contato.primeiro_nome', 'Contato'],
  ['contato.cargo', 'Contato'],
  ['persona', 'Persona'],
  ['remetente.nome', 'Você'],
]

const copy = {
  opening: {
    subject: '{{conta.nome}}: as vagas de avaliação de dados',
    body: 'Oi {{contato.primeiro_nome}},\n\nVi o sinal mais recente da {{conta.nome}} — {{conta.sinal}} — e imaginei que dados de avaliação viraram prioridade no seu time.\n\nTimes de {{conta.segmento}} nesse momento costumam perder semanas montando pipeline antes de medir qualquer coisa. Na Databricks a gente encurta isso para dias.\n\nFaz sentido 20 minutos na próxima semana para eu mostrar como outros líderes com o cargo de {{contato.cargo}} estão fazendo?\n\n{{remetente.nome}}',
  },
  invite: 'Oi {{contato.primeiro_nome}}, acompanho o trabalho da {{conta.nome}} em {{conta.segmento}} e vi a novidade recente por lá. Adoraria trocar ideias sobre como times de dados estão estruturando avaliação. Abraço!',
  followUp: {
    subject: 'Re: {{conta.nome}}: as vagas de avaliação de dados',
    body: '{{contato.primeiro_nome}}, gravei um vídeo curto (menos de 1 minuto) mostrando como ficaria o fluxo de avaliação da {{conta.nome}} na prática. Está em anexo.\n\nSe não for com você, quem seria a melhor pessoa para conversar sobre isso?\n\n{{remetente.nome}}',
  },
  call: 'Objetivo: validar se avaliação de modelos já tem dono e orçamento.\n\nAbertura: "{{contato.primeiro_nome}}, aqui é {{remetente.nome}}, da Databricks. Liguei por causa do movimento recente da {{conta.nome}} — posso tomar 30 segundos?"\n\nPerguntas:\n• Como vocês medem a qualidade dos modelos hoje?\n• O que acontece se as vagas demorarem a ser preenchidas?\n\nSe ninguém atender: deixar recado curto e registrar a tentativa.',
  whatsapp: 'Oi {{contato.primeiro_nome}}! Aqui é {{remetente.nome}}, da Databricks. Te mandei um e-mail sobre avaliação de dados na {{conta.nome}} — segue um print de como outros times acompanham isso. Faz sentido conversarmos?',
  sms: '{{contato.primeiro_nome}}, aqui é {{remetente.nome}} (Databricks). Te enviei um e-mail sobre dados na {{conta.nome}}. Posso te ligar amanhã às 10h?',
  task: 'Revisar o perfil de {{contato.primeiro_nome}} no LinkedIn e comentar o último post antes do próximo step.',
  breakup: {
    subject: 'Fecho por aqui, {{contato.primeiro_nome}}',
    body: '{{contato.primeiro_nome}}, não quero lotar sua caixa. Vou assumir que avaliação de dados não é prioridade para a {{conta.nome}} agora.\n\nSe mudar, é só responder este e-mail — ele chega direto em mim.\n\n{{remetente.nome}}',
  },
}

let stepSeq = 0
function step(channel, contactId, delay, fields = {}) {
  return {
    id: `s${++stepSeq}`,
    channel,
    contactId,
    delay,
    title: fields.title ?? channels[channel].title,
    subject: fields.subject ?? '',
    body: fields.body ?? '',
    mode: fields.mode ?? 'auto',
    linkedinKind: fields.linkedinKind ?? 'convite',
    window: fields.window ?? null,
    goal: fields.goal ?? '',
    attachments: fields.attachments ?? [],
    metrics: fields.metrics ?? null,
  }
}

// Rascunho que o Rhetor sugere para qualquer Conta-alvo nova.
function rhetorDraft(participantIds) {
  const [lead, second = lead] = participantIds
  return [
    step('email', lead, 0, { title: 'Abertura pelo Sinal', ...copy.opening, goal: 'Conectar o Sinal a uma dor concreta' }),
    step('linkedin', second, 1, { title: 'Convite no LinkedIn', body: copy.invite, goal: 'Abrir segundo canal no Comitê' }),
    step('email', lead, 2, { title: 'Follow-up com vídeo', ...copy.followUp, goal: 'Prova visual em menos de 1 minuto' }),
    step('ligacao', second, 2, { title: 'Ligação de descoberta', body: copy.call, window: { from: '10:00', to: '12:00' }, goal: 'Qualificar dono e orçamento' }),
    step('email', lead, 3, { title: 'Encerramento', ...copy.breakup, goal: 'Última chance sem pressão' }),
  ]
}

const videoDemo = { kind: 'video', name: 'walkthrough-avaliacao.mp4', duration: '0:48' }
const printDemo = { kind: 'image', name: 'print-painel-avaliacao.png' }

const sequences = [
  {
    id: 'openai', accountId: 'openai', status: 'ativa', done: 0, startOffset: 0,
    participants: ['oa1', 'oa2', 'oa3'],
    window: { from: '09:00', to: '17:00' },
    steps: [
      step('email', 'oa1', 0, { title: 'Abertura pelo Sinal', ...copy.opening, goal: 'Conectar o Sinal a uma dor concreta' }),
      step('linkedin', 'oa2', 1, { title: 'Convite no LinkedIn', body: copy.invite, goal: 'Abrir canal com o Líder técnico' }),
      step('email', 'oa1', 2, { title: 'Follow-up com vídeo', ...copy.followUp, attachments: [videoDemo], goal: 'Prova visual em menos de 1 minuto' }),
      step('ligacao', 'oa3', 2, { title: 'Ligação para o Campeão', body: copy.call, window: { from: '10:00', to: '12:00' }, goal: 'Qualificar dono e orçamento' }),
      step('whatsapp', 'oa3', 1, { title: 'WhatsApp com print', body: copy.whatsapp, attachments: [printDemo], goal: 'Reforço leve depois da ligação' }),
      step('email', 'oa1', 3, { title: 'Encerramento', ...copy.breakup, goal: 'Última chance sem pressão' }),
    ],
  },
  {
    id: 'anthropic', accountId: 'anthropic', status: 'pausada', done: 2, startOffset: -4,
    pauseReason: 'Olívia Ramos respondeu no LinkedIn em 22 set.',
    participants: ['an1', 'an2', 'an3'],
    window: { from: '09:00', to: '17:00' },
    steps: rhetorDraft(['an1', 'an2']),
  },
  {
    id: 'stripe', accountId: 'stripe', status: 'reuniao', done: 4, startOffset: -9,
    pauseReason: 'Mariana Gomes aceitou reunião para 25 set.',
    participants: ['st1', 'st2'],
    window: { from: '09:00', to: '17:00' },
    steps: [
      step('tarefa', 'st1', 0, { title: 'Aquecer no LinkedIn', body: copy.task, goal: 'Ser reconhecida antes do 1º e-mail' }),
      ...rhetorDraft(['st1', 'st2']).slice(0, 4),
    ],
  },
  {
    id: 'nubank', accountId: 'nubank', status: 'ativa', done: 2, startOffset: -3,
    participants: ['nu1', 'nu2'],
    window: { from: '08:30', to: '18:00' },
    steps: [
      ...rhetorDraft(['nu1', 'nu2']).slice(0, 3),
      step('sms', 'nu1', 1, { title: 'SMS antes da ligação', body: copy.sms, goal: 'Avisar da ligação' }),
      step('ligacao', 'nu1', 1, { title: 'Ligação para a Patrocinadora', body: copy.call, goal: 'Marcar reunião' }),
    ],
  },
  {
    id: 'snowflake', accountId: 'snowflake', status: 'esgotada', done: 5, startOffset: -14,
    participants: ['sn1', 'sn2'],
    window: { from: '09:00', to: '17:00' },
    steps: rhetorDraft(['sn1', 'sn2']),
  },
  {
    id: 'cloudflare', accountId: 'cloudflare', status: 'ativa', done: 1, startOffset: -1,
    participants: ['cf1'],
    window: { from: '09:00', to: '17:00' },
    steps: rhetorDraft(['cf1']),
  },
  {
    id: 'gitlab', accountId: 'gitlab', status: 'ativa', done: 0, startOffset: 1,
    participants: ['gl1', 'gl2'],
    window: { from: '09:00', to: '17:00' },
    steps: rhetorDraft(['gl1', 'gl2']),
  },
]

// Métricas de demonstração nos steps já concluídos.
sequences.forEach((sequence) => sequence.steps.forEach((item, index) => {
  if (index >= sequence.done) return
  const replied = (sequence.status === 'pausada' || sequence.status === 'reuniao') && index === sequence.done - 1
  item.metrics = item.channel === 'ligacao' || item.channel === 'tarefa'
    ? { outcome: replied ? 'Conversou' : 'Sem resposta' }
    : { opened: item.channel === 'email' ? 2 + (index % 3) : null, replied }
}))

// ---------- Utilidades ----------

const weekdays = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']

function addBusinessDays(date, amount) {
  const result = new Date(date)
  const direction = amount < 0 ? -1 : 1
  let left = Math.abs(amount)
  while (left > 0) {
    result.setDate(result.getDate() + direction)
    if (result.getDay() !== 0 && result.getDay() !== 6) left--
  }
  return result
}

function formatDay(date) {
  const diff = Math.round((date - TODAY) / 86400000)
  const base = `${date.getDate()} ${months[date.getMonth()]}`
  if (diff === 0) return `Hoje, ${base}`
  if (diff === 1) return `Amanhã, ${base}`
  if (diff === -1) return `Ontem, ${base}`
  return `${weekdays[date.getDay()]}, ${base}`
}

function stepDates(sequence) {
  let cursor = addBusinessDays(TODAY, sequence.startOffset)
  return sequence.steps.map((item, index) => {
    if (index > 0) cursor = addBusinessDays(cursor, item.delay)
    return cursor
  })
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const accountById = (id) => accounts.find((account) => account.id === id)
const contactById = (id) => contacts.find((contact) => contact.id === id)
const sequenceById = (id) => sequences.find((sequence) => sequence.id === id)
const sequenceForAccount = (accountId) => sequences.find((sequence) => sequence.accountId === accountId)
const contactsOf = (accountId) => contacts.filter((contact) => contact.accountId === accountId)
const firstName = (name) => name.split(' ')[0]

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function logo(account) {
  const ext = account.id === 'miro' ? 'png' : 'svg'
  return `<span class="company-logo" aria-hidden="true"><img src="${ASSETS}/logos/${account.id}.${ext}" alt="" onerror="this.remove();this.parentElement.classList.add('fallback');this.parentElement.textContent='${initials(account.name)}'" /></span>`
}

function avatar(contact, index = 0) {
  const hues = [345, 22, 165, 204, 262, 43]
  const bg = `hsl(${hues[index % hues.length]} 34% 24%)`
  if (contact.avatarUrl) {
    return `<span class="avatar has-photo" title="${esc(contact.name)}"><img src="${contact.avatarUrl}" alt="" onerror="this.remove();this.parentElement.style.background='${bg}';this.parentElement.style.color='#fff';this.parentElement.textContent='${initials(contact.name)}'" /></span>`
  }
  return `<span class="avatar" style="background:${bg};color:#fff" title="${esc(contact.name)}">${initials(contact.name)}</span>`
}

const statusLabels = { ativa: 'Ativa', pausada: 'Pausada', reuniao: 'Reunião', esgotada: 'Esgotada' }
const statusPill = (status) => `<span class="status-pill ${status}">${statusLabels[status]}</span>`

function channelBadge(channel, large = false) {
  return `<span class="channel-badge ${large ? 'large' : ''}" title="${channels[channel].label}">${icon(channels[channel].icon)}</span>`
}

function resolveVariable(name, sequence, item) {
  const account = accountById(sequence.accountId)
  const contact = contactById(item.contactId)
  const values = {
    'conta.nome': account.name,
    'conta.sinal': account.signal ? account.signal[0].toLowerCase() + account.signal.slice(1) : null,
    'conta.segmento': account.segment,
    'contato.primeiro_nome': contact && firstName(contact.name),
    'contato.cargo': contact?.role,
    persona: contact?.persona,
    'remetente.nome': SENDER,
  }
  return values[name]
}

function renderPreview(text, sequence, item) {
  return esc(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name) => {
    const value = resolveVariable(name, sequence, item)
    return value ? `<mark title="{{${name}}}">${esc(value)}</mark>` : `<mark class="missing" title="Sem dado para {{${name}}}">{{${name}}}</mark>`
  })
}

// ---------- Estado da tela ----------

const params = new URLSearchParams(window.location.search)
if (params.get('theme') === 'claro') document.documentElement.dataset.theme = 'claro'
if (params.get('empty') === '1') sequences.length = 0

const state = {
  view: params.get('view') ?? 'list',
  sequenceId: params.get('seq') ?? 'openai',
  accountId: params.get('account') ?? 'openai',
  stepId: null,
  search: '',
  status: 'todos',
  preview: false,
  addingStep: false,
  approvals: 3,
  modal: null,
}

function currentSequence() {
  return sequenceById(state.sequenceId)
}

function currentStep(sequence = currentSequence()) {
  return sequence.steps.find((item) => item.id === state.stepId) ?? sequence.steps[Math.min(sequence.done, sequence.steps.length - 1)]
}

// ---------- Lista global ----------

function nextStepCell(sequence) {
  if (sequence.status === 'pausada') return `<span class="next-step muted">${icon('pause')}<span class="next-step-copy">Pausada · aguardando análise humana</span></span>`
  if (sequence.status === 'reuniao') return `<span class="next-step muted">${icon('calendar')}<span class="next-step-copy">Reunião marcada · 25 set.</span></span>`
  const item = sequence.steps[sequence.done]
  if (!item) return '<span class="next-step muted"><span class="next-step-copy">Todos os steps concluídos, sem resposta</span></span>'
  const contact = contactById(item.contactId)
  return `<span class="next-step">${channelBadge(item.channel)}<span class="next-step-copy">Step ${sequence.done + 1} · ${esc(item.title)} para ${esc(contact?.name ?? '—')}</span><span class="next-step-date">${formatDay(stepDates(sequence)[sequence.done])}</span></span>`
}

function coverageCell(sequence) {
  const people = sequence.participants.map(contactById)
  return `<span class="contact-stack">${people.slice(0, 3).map(avatar).join('')}<span class="contact-count">${people.length} ${people.length === 1 ? 'Contato' : 'Contatos'} de ${contactsOf(sequence.accountId).length}</span></span>`
}

function renderList() {
  const query = normalize(state.search)
  const visible = sequences
    .filter((sequence) => !query || normalize(accountById(sequence.accountId).name).includes(query))
    .filter((sequence) => state.status === 'todos' || sequence.status === state.status)
  const counts = Object.fromEntries(Object.keys(statusLabels).map((status) => [status, sequences.filter((sequence) => sequence.status === status).length]))

  const heading = `<div class="page-heading">
      <div><h2>Sequências</h2><p>Planos de abordagem por Conta-alvo. Uma sequência por Conta; qualquer resposta pausa a Conta inteira.</p></div>
      <div style="display:flex;align-items:center;gap:16px"><span class="result-count">Exibindo <strong>${visible.length}</strong> de ${sequences.length} ${sequences.length === 1 ? 'sequência' : 'sequências'}</span>
      <button class="button primary" type="button" data-new>${icon('plus')}Nova sequência</button></div>
    </div>`

  if (!sequences.length) {
    return `${heading}<div class="empty-table"><div><strong>Nenhuma sequência ainda</strong><p>Crie a partir de uma Conta-alvo aqui ou peça à Coordenação numa Conversa.</p><button class="button primary" type="button" data-new>${icon('plus')}Nova sequência</button></div></div>`
  }

  const rows = visible.map((sequence) => {
    const account = accountById(sequence.accountId)
    return `<tr data-open-seq="${sequence.id}">
      <td><div class="company-cell">${logo(account)}<div class="company-copy"><button class="company-name" type="button" data-open-account="${account.id}">${account.name}</button><span class="company-domain">${account.domain}</span></div></div></td>
      <td>${statusPill(sequence.status)}</td>
      <td>${coverageCell(sequence)}</td>
      <td>${nextStepCell(sequence)}</td>
      <td><span class="progress-cell"><span class="progress-bar"><span style="width:${(sequence.done / sequence.steps.length) * 100}%"></span></span>${sequence.done}/${sequence.steps.length} steps</span></td>
    </tr>`
  }).join('')

  return `${heading}
    <div class="table-toolbar">
      <label class="search-control">${icon('search')}<input id="seq-search" type="search" placeholder="Buscar por Conta-alvo" value="${esc(state.search)}" /></label>
      <select id="status-filter" class="select-control" aria-label="Filtrar por status">
        <option value="todos">Todos os status</option>
        ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label} (${counts[value]})</option>`).join('')}
      </select>
      <span class="toolbar-spacer"></span>
    </div>
    <div class="table-frame">
      ${visible.length ? `<table class="data-table sequences-table"><thead><tr><th>Conta-alvo</th><th>Status</th><th>Cobertura</th><th>Próximo step</th><th>Progresso</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty-table"><div><strong>Nenhuma sequência encontrada</strong><p>Ajuste a busca ou o filtro de status.</p></div></div>'}
    </div>`
}

// ---------- Documento da sequência ----------

function pauseRule(sequence) {
  const account = accountById(sequence.accountId)
  if (sequence.status === 'pausada') {
    return `<div class="pause-rule is-paused"><span class="side-icon">${icon('pause')}</span><span><strong>Sequência pausada.</strong> ${esc(sequence.pauseReason)} Toda a sequência da ${account.name} está parada — nenhum Contato recebe o próximo step até alguém analisar.<br /><span class="muted">Regra: qualquer resposta de qualquer Contato — positiva ou negativa, em qualquer canal — pausa a sequência inteira da Conta-alvo.</span></span>
      <span class="pause-rule-actions"><button class="button small" type="button" data-resume>Retomar</button><button class="button small" type="button" data-meeting>Marcar reunião</button></span></div>`
  }
  if (sequence.status === 'reuniao') {
    return `<div class="pause-rule is-meeting"><span class="side-icon" style="color:var(--al-accent)">${icon('calendar')}</span><span><strong>Reunião marcada.</strong> ${esc(sequence.pauseReason)} A sequência da ${account.name} foi encerrada para todos os Contatos.<br /><span class="muted">Regra: qualquer resposta de qualquer Contato — positiva ou negativa, em qualquer canal — pausa a sequência inteira da Conta-alvo.</span></span></div>`
  }
  return `<div class="pause-rule"><span class="side-icon">${icon('pause')}</span><span><strong>Regra de pause:</strong> qualquer resposta de qualquer Contato da ${account.name} — positiva ou negativa, em qualquer canal — pausa a sequência inteira da Conta-alvo para análise humana.</span></div>`
}

function settings(sequence) {
  const people = sequence.participants.map(contactById)
  const others = contactsOf(sequence.accountId).filter((contact) => !sequence.participants.includes(contact.id))
  const hours = ['07:00', '08:00', '08:30', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '17:00', '18:00', '19:00']
  const hourSelect = (key) => `<select class="mini-select" data-window="${key}">${hours.map((hour) => `<option ${sequence.window[key] === hour ? 'selected' : ''}>${hour}</option>`).join('')}</select>`
  return `<div class="seq-settings">
    <div class="seq-setting"><span class="setting-label">Participantes · ${people.length} de ${contactsOf(sequence.accountId).length} Contatos</span>
      <div class="participants">
        ${people.map((contact, index) => `<span class="participant-chip">${avatar(contact, index)}${esc(contact.name)}${contact.persona ? `<small>${esc(contact.persona)}</small>` : ''}${people.length > 1 ? `<button type="button" data-remove-participant="${contact.id}" aria-label="Tirar ${esc(contact.name)}">${icon('x')}</button>` : ''}</span>`).join('')}
        ${others.length ? `<select class="add-select" data-add-participant><option value="">+ Adicionar Contato</option>${others.map((contact) => `<option value="${contact.id}">${esc(contact.name)}${contact.persona ? ` · ${esc(contact.persona)}` : ''}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <div class="seq-setting"><span class="setting-label">Janela padrão</span>
      <div class="window-row">Seg a sex, dias úteis · ${hourSelect('from')} até ${hourSelect('to')} <span class="muted">horário de Brasília</span></div>
    </div>
  </div>`
}

function timeline(sequence) {
  const dates = stepDates(sequence)
  const selected = currentStep(sequence)
  const items = sequence.steps.map((item, index) => {
    const contact = contactById(item.contactId)
    const done = index < sequence.done
    const next = index === sequence.done && sequence.status === 'ativa'
    const wait = index > 0 ? `<li class="tl-wait"><span class="clock">${icon('clock')}</span><span>Aguardar ${item.delay} ${item.delay === 1 ? 'dia útil' : 'dias úteis'}${item.window ? ` <small>· ${item.window.from}–${item.window.to}</small>` : ''}</span></li>` : ''
    return `${wait}<li><button class="tl-step ${item.id === selected.id ? 'selected' : ''} ${done ? 'done' : ''} ${next ? 'next' : ''}" type="button" data-step="${item.id}">
      <span class="tl-num">${done ? icon('check') : index + 1}</span>
      <span class="tl-copy"><span class="tl-title" data-title-of="${item.id}">${esc(item.title)}</span><span class="tl-date">${formatDay(dates[index])}</span></span>
      <span class="tl-channel">${icon(channels[item.channel].icon)}</span>${contact ? avatar(contact, sequence.participants.indexOf(contact.id)) : ''}
    </button></li>`
  }).join('')
  const menu = state.addingStep ? `<div class="channel-menu">${Object.entries(channels).map(([key, channel]) => `<button type="button" data-add-step="${key}">${icon(channel.icon)}${channel.label}</button>`).join('')}</div>` : ''
  return `<div class="seq-timeline">
    <div class="timeline-head"><span>${sequence.steps.length} steps · ${sequence.steps.reduce((sum, item, index) => sum + (index ? item.delay : 0), 0)} dias úteis</span></div>
    <ol class="tl-list">${items}</ol>
    <button class="tl-add" type="button" data-toggle-add><span class="tl-num">${icon('plus')}</span>Adicionar step</button>
    ${menu}
  </div>`
}

function attachmentsRow(item) {
  const tiles = item.attachments.map((file, index) => {
    const thumb = file.kind === 'video'
      ? (file.url ? `<video src="${file.url}" muted></video>` : '') + `<span class="play" style="position:absolute">${icon('play')}</span>${file.duration ? `<span class="duration">${file.duration}</span>` : ''}`
      : (file.url ? `<img src="${file.url}" alt="" />` : icon('image'))
    const cls = file.url ? '' : file.kind === 'video' ? 'fake-video' : 'fake-image'
    return `<div class="attachment"><div class="thumb ${cls}">${thumb}</div><span class="name">${esc(file.name)}</span><button class="remove" type="button" data-remove-attachment="${index}" aria-label="Remover anexo">${icon('x')}</button></div>`
  }).join('')
  return `<div class="attachments">${tiles}
      <label class="attach-add"><span class="side-icon">${icon('image')}</span>Imagem ou print<input type="file" accept="image/*" data-attach="image" hidden /></label>
      <label class="attach-add"><span class="side-icon">${icon('video')}</span>Vídeo<input type="file" accept="video/*" data-attach="video" hidden /></label>
    </div>
    <p class="attach-note">O arquivo fica só neste mock — nada é enviado.</p>`
}

function varBar() {
  return `<div class="var-bar"><span>Inserir variável</span>
    ${variables.map(([name, group]) => `<button class="var-chip" type="button" data-var="${name}"><em>${group}</em>{{${name}}}</button>`).join('')}
    <span class="seg mode"><button type="button" class="${state.preview ? '' : 'on'}" data-preview="0">${icon('pencil')}</button><button type="button" class="${state.preview ? 'on' : ''}" data-preview="1">${icon('eye')}Pré-visualizar</button></span>
  </div>`
}

function composer(sequence) {
  const item = currentStep(sequence)
  const index = sequence.steps.indexOf(item)
  const contact = contactById(item.contactId)
  const participants = sequence.participants.map(contactById)
  const limit = item.channel === 'sms' ? 160 : item.channel === 'linkedin' && item.linkedinKind === 'convite' ? 300 : null
  const hasSubject = item.channel === 'email' || (item.channel === 'linkedin' && item.linkedinKind === 'inmail')
  const isNote = item.channel === 'ligacao' || item.channel === 'tarefa'
  const bodyLabel = isNote ? (item.channel === 'ligacao' ? 'Roteiro:' : 'Nota:') : 'Mensagem:'

  const channelOptions = {
    email: `<span class="seg"><button type="button" class="${item.mode === 'auto' ? 'on' : ''}" data-mode="auto">Automático</button><button type="button" class="${item.mode === 'manual' ? 'on' : ''}" data-mode="manual">Manual — revisar antes</button></span>`,
    linkedin: `<span class="seg">${[['convite', 'Convite com nota'], ['mensagem', 'Mensagem'], ['inmail', 'InMail']].map(([key, label]) => `<button type="button" class="${item.linkedinKind === key ? 'on' : ''}" data-linkedin="${key}">${label}</button>`).join('')}</span>`,
    whatsapp: '<span class="muted">Enviado do número do vendedor · sem envio neste protótipo</span>',
    sms: '<span class="muted">Até 160 caracteres</span>',
    ligacao: '<span class="muted">Vira uma tarefa de ligação na data do step</span>',
    tarefa: '<span class="muted">Tarefa manual para quem é dono da Conta-alvo</span>',
  }

  const bodyField = state.preview
    ? `<div class="preview">${hasSubject ? `<div class="preview-subject">${renderPreview(item.subject, sequence, item)}</div>` : ''}${item.channel === 'whatsapp' ? `<div class="wa-preview"><div class="wa-bubble">${renderPreview(item.body, sequence, item)}<small>10:02 ✓✓</small></div></div>` : renderPreview(item.body, sequence, item)}</div>`
    : `<textarea class="c-textarea ${limit ? 'short' : ''}" data-field="body" placeholder="${isNote ? 'Escreva o roteiro ou a nota da tarefa…' : 'Escreva a mensagem…'}">${esc(item.body)}</textarea>${limit ? `<span class="counter ${item.body.length > limit ? 'over' : ''}" data-counter data-limit="${limit}">${item.body.length}/${limit}</span>` : ''}`

  const metrics = item.metrics
    ? `<span class="demo-tag">Demonstração</span>${item.metrics.outcome ? `<span>Resultado: <strong>${item.metrics.outcome}</strong></span>` : `<span>Enviado em <strong>${formatDay(stepDates(sequence)[index])}</strong></span>${item.metrics.opened ? `<span>Aberto <strong>${item.metrics.opened}×</strong></span>` : ''}<span><strong>${item.metrics.replied ? '1 resposta' : '0 respostas'}</strong></span>`}`
    : '<span class="demo-tag">Demonstração</span><span>Ainda não enviado · nada sai deste protótipo</span>'

  return `<div class="seq-editor"><div class="composer">
    <div class="composer-head">${channelBadge(item.channel, true)}
      <input class="composer-title" data-field="title" value="${esc(item.title)}" aria-label="Nome do step" />
      <span class="muted" style="font-size:12px">Step ${index + 1} de ${sequence.steps.length}</span>
      <button class="icon-button" type="button" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover para cima">${icon('up')}</button>
      <button class="icon-button" type="button" data-move="1" ${index === sequence.steps.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo">${icon('down')}</button>
      <button class="icon-button" type="button" data-delete-step ${sequence.steps.length === 1 ? 'disabled' : ''} aria-label="Excluir step">${icon('trash')}</button>
    </div>
    <div class="channel-tabs" role="tablist">${Object.entries(channels).map(([key, channel]) => `<button class="channel-tab ${item.channel === key ? 'active' : ''}" type="button" role="tab" data-channel="${key}">${icon(channel.icon)}${channel.label}</button>`).join('')}</div>
    <div class="c-row"><span class="c-label">Para:</span><div class="c-value recipient">${contact ? avatar(contact, participants.indexOf(contact)) : ''}
      <select data-recipient>${participants.map((person) => `<option value="${person.id}" ${person.id === item.contactId ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}</select>
      <small>${esc([contact?.role, contact?.persona].filter(Boolean).join(' · '))}</small></div></div>
    <div class="c-row"><span class="c-label">Envio:</span><div class="c-value">${channelOptions[item.channel]}</div></div>
    ${hasSubject && !state.preview ? `<div class="c-row"><span class="c-label">Assunto:</span><div class="c-value"><input class="c-input" data-field="subject" value="${esc(item.subject)}" placeholder="Assunto do e-mail" /></div></div>` : ''}
    ${varBar()}
    <div class="c-row top"><span class="c-label">${state.preview ? 'Como chega:' : bodyLabel}</span><div class="c-value">${bodyField}</div></div>
    <div class="c-row top"><span class="c-label">${isNote ? 'Material:' : 'Anexos:'}</span><div class="c-value">${attachmentsRow(item)}</div></div>
    <div class="c-row"><span class="c-label">Quando:</span><div class="c-value timing">
      ${index === 0 ? '<span>Começa assim que a sequência for aprovada</span>' : `Aguardar <input class="mini-input" type="number" min="0" max="30" value="${item.delay}" data-delay /> dias úteis após o step ${index}`}
      <span class="muted">·</span>
      <select class="mini-select" data-step-window><option value="herdar" ${item.window ? '' : 'selected'}>Janela da sequência (${sequence.window.from}–${sequence.window.to})</option><option value="manha" ${item.window?.from === '10:00' ? 'selected' : ''}>Manhã (10:00–12:00)</option><option value="tarde" ${item.window?.from === '14:00' ? 'selected' : ''}>Tarde (14:00–17:00)</option></select>
    </div></div>
    <div class="c-row"><span class="c-label">Objetivo:</span><div class="c-value"><input class="c-input" style="font-size:15px" data-field="goal" value="${esc(item.goal)}" placeholder="O que este step precisa conseguir" /></div></div>
    <div class="composer-foot">${metrics}</div>
  </div></div>`
}

function renderSequence() {
  const sequence = currentSequence()
  if (!sequence) { state.view = 'list'; return renderList() }
  const account = accountById(sequence.accountId)
  return `<button class="breadcrumb" type="button" data-nav="list">${icon('back')}Sequências / ${account.name}</button>
    <header class="seq-header">${logo(account)}
      <div class="seq-heading"><h2>${account.name} <small>sequência</small></h2>
        <div class="seq-meta">${statusPill(sequence.status)}<span>${sequence.participants.length} ${sequence.participants.length === 1 ? 'Contato' : 'Contatos'} · ${sequence.steps.length} steps</span>
          <span>Escrita por Rhetor · editada por ${SENDER}</span>
          <button class="linkish" type="button" data-open-account="${account.id}">Ver Conta-alvo</button>
          ${sequence.approval ? '<span class="status-pill pausada">Aprovação pendente</span>' : ''}</div>
      </div>
      <div class="seq-actions">
        ${sequence.status === 'ativa' ? `<button class="button ghost" type="button" data-simulate-reply title="Demonstração">${icon('sms')}Simular resposta</button>` : ''}
        <button class="button primary" type="button" data-approval ${sequence.approval ? 'disabled' : ''}>${icon('send')}${sequence.approval ? 'Em aprovação' : 'Enviar para aprovação'}</button>
      </div>
    </header>
    ${pauseRule(sequence)}
    ${settings(sequence)}
    <div class="seq-body">${timeline(sequence)}${composer(sequence)}</div>`
}

// ---------- Detalhe da Conta-alvo (bloco Sequência) ----------

function sequenceBlock(account) {
  const sequence = sequenceForAccount(account.id)
  const people = contactsOf(account.id)
  if (!sequence) {
    return `<div class="section-empty with-action"><div><p>Nenhuma sequência nesta Conta-alvo</p>
      ${people.length ? `<p class="muted" style="font-size:13px;margin:4px 0 12px">O Rhetor sugere os Contatos e você confirma quem entra.</p><button class="button" type="button" data-new="${account.id}">${icon('plus')}Criar sequência</button>` : '<p class="muted" style="font-size:13px;margin-top:4px">Mapeie ao menos um Contato para criar uma sequência.</p>'}</div></div>`
  }
  const nextItem = sequence.steps[sequence.done]
  return `<div class="seq-block">
    <div class="seq-block-head">${icon('route')}<strong>Sequência da ${account.name}</strong>${statusPill(sequence.status)}<button class="button small" type="button" data-open-seq="${sequence.id}">Abrir sequência ${icon('arrow')}</button></div>
    <dl class="seq-block-facts">
      <div><dt>Cobertura</dt><dd>${coverageCell(sequence)}</dd></div>
      <div><dt>Próximo step</dt><dd>${sequence.status === 'ativa' && nextItem ? `${channelBadge(nextItem.channel)}${formatDay(stepDates(sequence)[sequence.done])}` : '<span class="muted">—</span>'}</dd></div>
      <div><dt>Pause</dt><dd style="font-size:13px">${sequence.status === 'pausada' ? esc(sequence.pauseReason) : 'Qualquer resposta pausa a Conta inteira'}</dd></div>
    </dl>
    <div class="mini-steps">${sequence.steps.map((item, index) => `<span class="${index < sequence.done ? 'done' : index === sequence.done && sequence.status === 'ativa' ? 'next' : ''}" title="${esc(item.title)}">${icon(channels[item.channel].icon)}</span>`).join('')}</div>
  </div>`
}

function renderAccount() {
  const account = accountById(state.accountId) ?? accounts[0]
  const people = contactsOf(account.id)
  const sequence = sequenceForAccount(account.id)
  const demoAccounts = ['openai', 'anthropic', 'cloudflare', 'figma', 'miro']
  return `<div class="demo-switch">Mock · ver Conta-alvo: ${demoAccounts.map((id) => `<button type="button" class="${id === account.id ? 'on' : ''}" data-open-account="${id}">${accountById(id).name}${sequenceForAccount(id) ? '' : ' · sem sequência'}</button>`).join('')}</div>
    <button class="breadcrumb" type="button">${icon('back')}Contas / ${account.name}</button>
    <header class="detail-header">${logo(account)}<div class="detail-heading"><h2>${account.name}</h2><div class="detail-meta"><span>${account.domain}</span><span>${account.segment}</span><span>${account.adherence}</span></div></div></header>
    <div class="detail-sections"><div class="detail-main">
      <section class="detail-section"><div class="section-heading"><h3>Sinais</h3><span>${account.signal ? '1 sinal' : '0 sinais'}</span></div>
        ${account.signal ? `<article class="featured-signal"><p>${account.signal}</p><div class="signal-meta"><span>Hoje, 09:42</span><span>Detectado por Scopus</span></div></article>` : '<div class="section-empty">Nenhum sinal</div>'}</section>
      <section class="detail-section" id="sequencia"><div class="section-heading"><h3>Sequência</h3><span>${sequence ? '1 sequência' : 'Nenhuma'}</span></div>${sequenceBlock(account)}</section>
      <section class="detail-section"><div class="section-heading"><h3>Contatos</h3><span>${people.length} ${people.length === 1 ? 'contato' : 'contatos'}</span></div>
        ${people.length ? `<table class="mini-table"><thead><tr><th>Nome</th><th>Cargo</th><th>Persona</th><th>Sequência</th></tr></thead><tbody>${people.map((contact, index) => `<tr><td><div class="person-cell">${avatar(contact, index)}<span>${esc(contact.name)}</span></div></td><td>${esc(contact.role)}</td><td>${esc(contact.persona ?? '—')}</td><td>${sequence?.participants.includes(contact.id) ? 'Participa' : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="section-empty">Nenhum contato</div>'}</section>
    </div>
    <aside class="detail-aside"><div class="aside-block"><h3>Visão geral</h3><dl class="fact-list"><dt>Aderência</dt><dd>${account.adherence}</dd><dt>Contatos</dt><dd>${people.length || 'Nenhum'}</dd><dt>Sequência</dt><dd>${sequence ? statusLabels[sequence.status] : 'Nenhuma'}</dd></dl></div></aside>
    </div>`
}

// ---------- Criar sequência (2 passos) ----------

function suggestedParticipants(accountId) {
  const rank = { 'Patrocinador executivo': 0, 'Campeão interno': 1, 'Líder técnico': 2, 'Usuário-chave': 3 }
  return [...contactsOf(accountId)].sort((a, b) => (rank[a.persona] ?? 9) - (rank[b.persona] ?? 9)).slice(0, 2).map((contact) => contact.id)
}

function renderModal() {
  const root = document.getElementById('modal-root')
  const modal = state.modal
  if (!modal) { root.innerHTML = ''; return }
  let body
  if (modal.step === 'account') {
    body = `<div class="modal-body"><div class="pick-list">${accounts.map((account) => {
      const existing = sequenceForAccount(account.id)
      const people = contactsOf(account.id).length
      const note = existing ? 'Já tem sequência — no máximo uma por Conta-alvo' : people ? `${people} ${people === 1 ? 'Contato' : 'Contatos'} · ${account.signal ?? 'sem Sinal recente'}` : 'Sem Contatos mapeados'
      return `<button class="pick-item ${modal.accountId === account.id ? 'on' : ''}" type="button" data-pick-account="${account.id}" ${existing || !people ? 'disabled' : ''}>${logo(account)}<span class="pick-copy"><strong>${account.name}</strong><small>${esc(note)}</small></span></button>`
    }).join('')}</div></div>
      <div class="modal-foot"><button class="button" type="button" data-close-modal>Cancelar</button><button class="button primary" type="button" data-modal-next ${modal.accountId ? '' : 'disabled'}>Continuar ${icon('arrow')}</button></div>`
  } else {
    const account = accountById(modal.accountId)
    const people = contactsOf(account.id)
    const suggested = suggestedParticipants(account.id)
    body = `<div class="modal-body">
      <div class="rhetor-note"><span class="agent-dot violet"></span><span><strong>Rhetor:</strong> sugiro começar por ${suggested.map((id) => esc(contactById(id).name)).join(' e ')}. Confirme quem entra — o Comitê inteiro não entra no automático. Depois eu escrevo os steps.</span></div>
      <div class="pick-list">${people.map((contact, index) => `<label class="pick-item ${modal.selected.includes(contact.id) ? 'on' : ''}"><input type="checkbox" data-pick-contact="${contact.id}" ${modal.selected.includes(contact.id) ? 'checked' : ''} />${avatar(contact, index)}<span class="pick-copy"><strong>${esc(contact.name)}</strong><small>${esc(contact.role)}${contact.persona ? ` · ${esc(contact.persona)}` : ''}</small></span>${suggested.includes(contact.id) ? '<span class="suggest-tag">Sugerido</span>' : ''}</label>`).join('')}</div>
    </div>
    <div class="modal-foot"><button class="button" type="button" ${modal.fromAccount ? 'data-close-modal' : 'data-modal-back'}>${modal.fromAccount ? 'Cancelar' : 'Voltar'}</button><button class="button primary" type="button" data-create ${modal.selected.length ? '' : 'disabled'}>Criar sequência com ${modal.selected.length} ${modal.selected.length === 1 ? 'Contato' : 'Contatos'}</button></div>`
  }
  root.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-label="Nova sequência" data-stop>
    <div class="modal-head"><div><strong>Nova sequência</strong><small>${modal.step === 'account' ? 'Passo 1 de 2 · escolha a Conta-alvo' : `Passo 2 de 2 · participantes da ${accountById(modal.accountId).name}`}</small></div><button class="icon-button" type="button" data-close-modal aria-label="Fechar">${icon('x')}</button></div>
    ${body}</div></div>`
}

function openCreate(accountId = null) {
  state.modal = accountId
    ? { step: 'participants', accountId, fromAccount: true, selected: suggestedParticipants(accountId) }
    : { step: 'account', accountId: null, selected: [] }
  renderModal()
}

function createSequence() {
  const { accountId, selected } = state.modal
  const sequence = { id: accountId, accountId, status: 'ativa', done: 0, startOffset: 0, participants: [...selected], window: { from: '09:00', to: '17:00' }, steps: rhetorDraft(selected) }
  sequences.unshift(sequence)
  state.modal = null
  renderModal()
  go('sequence', { sequenceId: sequence.id, stepId: null })
  toast(`Rhetor escreveu ${sequence.steps.length} steps para a ${accountById(accountId).name}. Revise e envie para aprovação.`)
}

// ---------- Render e eventos ----------

function toast(message) {
  const element = document.getElementById('toast')
  element.textContent = message
  element.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { element.hidden = true }, 4200)
}

function go(view, patch = {}) {
  Object.assign(state, { view, addingStep: false }, patch)
  render()
  window.scrollTo({ top: 0 })
}

function render() {
  const view = document.getElementById('view')
  const inAccounts = state.view === 'account'
  document.getElementById('topbar-heading').textContent = inAccounts ? 'Contas e Contatos' : 'Sequências'
  document.getElementById('topbar-icon').dataset.icon = inAccounts ? 'building' : 'route'
  document.querySelectorAll('.sidebar [data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === (inAccounts ? 'account' : 'list')))
  document.getElementById('approvals-count').textContent = state.approvals
  view.innerHTML = state.view === 'sequence' ? renderSequence() : inAccounts ? renderAccount() : renderList()
  hydrateIcons()
}

let lastField = null

document.addEventListener('focusin', (event) => {
  if (event.target.matches('[data-field="body"], [data-field="subject"]')) lastField = event.target
})

document.addEventListener('mousedown', (event) => {
  if (event.target.closest('[data-var]')) event.preventDefault() // mantém o cursor no campo
})

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, [data-open-seq], [data-close-modal], [data-stop]')
  if (!target) return
  const sequence = state.view === 'sequence' ? currentSequence() : null
  const data = target.dataset

  if (data.stop !== undefined && target === event.target.closest('[data-stop]') && !event.target.closest('button')) return
  if (data.closeModal !== undefined) { if (target.classList.contains('modal-backdrop') && event.target !== target) return; state.modal = null; renderModal(); return }
  if (data.nav) return go(data.nav)
  if (data.openAccount) { event.stopPropagation(); return go('account', { accountId: data.openAccount }) }
  if (data.openSeq) return go('sequence', { sequenceId: data.openSeq, stepId: null, preview: false })
  if (data.new !== undefined) return openCreate(data.new || null)
  if (data.pickAccount) { state.modal.accountId = data.pickAccount; return renderModal() }
  if (data.modalNext !== undefined) { Object.assign(state.modal, { step: 'participants', selected: suggestedParticipants(state.modal.accountId) }); return renderModal() }
  if (data.modalBack !== undefined) { state.modal.step = 'account'; return renderModal() }
  if (data.create !== undefined) return createSequence()
  if (target.id === 'theme-toggle') {
    const next = document.documentElement.dataset.theme === 'claro' ? 'escuro' : 'claro'
    document.documentElement.dataset.theme = next
    target.querySelector('[data-icon]').dataset.icon = next === 'claro' ? 'moon' : 'sun'
    hydrateIcons(target)
    return
  }
  if (!sequence) return

  const item = currentStep(sequence)
  if (data.step) { state.stepId = data.step; return render() }
  if (data.toggleAdd !== undefined) { state.addingStep = !state.addingStep; return render() }
  if (data.addStep) {
    const lead = sequence.participants[0]
    const added = step(data.addStep, lead, 2, { body: '' })
    sequence.steps.push(added)
    return go('sequence', { stepId: added.id })
  }
  if (data.channel) {
    if (Object.values(channels).some((channel) => channel.title === item.title)) item.title = channels[data.channel].title
    item.channel = data.channel
    return render()
  }
  if (data.mode) { item.mode = data.mode; return render() }
  if (data.linkedin) { item.linkedinKind = data.linkedin; return render() }
  if (data.preview) { state.preview = data.preview === '1'; return render() }
  if (data.var) {
    const field = lastField && document.body.contains(lastField) ? lastField : document.querySelector('[data-field="body"]')
    if (!field) return
    const token = `{{${data.var}}}`
    const start = field.selectionStart ?? field.value.length
    const end = field.selectionEnd ?? start
    field.value = field.value.slice(0, start) + token + field.value.slice(end)
    field.focus()
    field.setSelectionRange(start + token.length, start + token.length)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  if (data.removeAttachment) { item.attachments.splice(Number(data.removeAttachment), 1); return render() }
  if (data.move) {
    const from = sequence.steps.indexOf(item)
    const to = from + Number(data.move)
    const [a, b] = [sequence.steps[from], sequence.steps[to]]
    ;[a.delay, b.delay] = [b.delay, a.delay] // o delay pertence à posição na timeline
    sequence.steps.splice(to, 0, sequence.steps.splice(from, 1)[0])
    return render()
  }
  if (data.deleteStep !== undefined) {
    const index = sequence.steps.indexOf(item)
    sequence.steps.splice(index, 1)
    state.stepId = sequence.steps[Math.max(0, index - 1)].id
    return render()
  }
  if (data.removeParticipant) {
    sequence.participants = sequence.participants.filter((id) => id !== data.removeParticipant)
    sequence.steps.forEach((each) => { if (each.contactId === data.removeParticipant) each.contactId = sequence.participants[0] })
    return render()
  }
  if (data.simulateReply !== undefined) {
    const touched = sequence.steps[Math.max(0, sequence.done - 1)]
    const contact = contactById(touched.contactId)
    Object.assign(sequence, { status: 'pausada', pauseReason: `${contact.name} respondeu via ${channels[touched.channel].label} hoje.` })
    toast(`Resposta registrada como Interação. A sequência inteira da ${accountById(sequence.accountId).name} foi pausada.`)
    return render()
  }
  if (data.resume !== undefined) { sequence.status = 'ativa'; return render() }
  if (data.meeting !== undefined) { Object.assign(sequence, { status: 'reuniao', pauseReason: 'Reunião marcada para 25 set.' }); return render() }
  if (data.approval !== undefined) {
    sequence.approval = true
    state.approvals += 1
    toast(`Aprovação criada: sequência da ${accountById(sequence.accountId).name}. Nada é enviado neste protótipo.`)
    return render()
  }
})

document.addEventListener('input', (event) => {
  const target = event.target
  if (target.id === 'seq-search') {
    state.search = target.value
    render()
    const input = document.getElementById('seq-search')
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    return
  }
  if (state.view !== 'sequence') return
  const sequence = currentSequence()
  const item = currentStep(sequence)
  const field = target.dataset.field
  if (field) {
    item[field] = target.value
    if (field === 'title') document.querySelector(`[data-title-of="${item.id}"]`).textContent = target.value || 'Sem nome'
    const counter = document.querySelector('[data-counter]')
    if (field === 'body' && counter) {
      const limit = Number(counter.dataset.limit)
      counter.textContent = `${target.value.length}/${limit}`
      counter.classList.toggle('over', target.value.length > limit)
    }
  }
})

document.addEventListener('change', (event) => {
  const target = event.target
  if (target.id === 'status-filter') { state.status = target.value; return render() }
  if (target.dataset.pickContact) {
    const id = target.dataset.pickContact
    state.modal.selected = target.checked ? [...state.modal.selected, id] : state.modal.selected.filter((each) => each !== id)
    return renderModal()
  }
  if (state.view !== 'sequence' || target.dataset.field) return
  const sequence = currentSequence()
  const item = currentStep(sequence)
  if (target.dataset.recipient !== undefined) item.contactId = target.value
  if (target.dataset.delay !== undefined) item.delay = Math.max(0, Number(target.value) || 0)
  if (target.dataset.window) sequence.window[target.dataset.window] = target.value
  if (target.dataset.stepWindow !== undefined) item.window = { herdar: null, manha: { from: '10:00', to: '12:00' }, tarde: { from: '14:00', to: '17:00' } }[target.value]
  if (target.dataset.addParticipant !== undefined && target.value) sequence.participants.push(target.value)
  if (target.dataset.attach) {
    const file = target.files[0]
    if (file) item.attachments.push({ kind: target.dataset.attach, name: file.name, url: URL.createObjectURL(file) })
  }
  render()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) { state.modal = null; renderModal() }
})

render()

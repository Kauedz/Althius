// Validação automatizada ponta a ponta da primeira Cadência de e-mail (cadencia-pela-ia, ticket 03).
// Exercita em sequência os caminhos reais de código de ponta a ponta sem fabricar resultados por fora:
// 1. Conversa coordenada ("Gerar Sequência") -> o Rhetor lê a Conta-alvo e os Contatos e chama `propor_sequencia`.
// 2. O responsável aprova a proposta (`decide_approval`): nasce a Sequência em rascunho, sem disparo automático.
// 3. O responsável confirma os passos e ativa os envios: nasce o Envio pendente com variáveis interpoladas e token.
// 4. O Executor (`sequence-runner` + `sendStep` + `unsubscribeLinksFrom`) envia o passo 1 com variáveis preenchidas,
//    rodapé de descadastro e cabeçalho `List-Unsubscribe`.
// 5. A resposta recebida pausa a Sequência (`Resposta recebida`) e o `reply-proposal-runner` gera a Proposta de
//    resposta em Aprovações.
// 6. Em cenário separado (outro Contato e outra Sequência), o clique e a confirmação no endpoint `descadastro`
//    registram a Supressão e pausam a Sequência com motivo `Descadastro`.
import { assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1'
import { RODAPE_DE_DESCADASTRO, unsubscribeLinksFrom } from '../_shared/descadastro.ts'
import type { BancoDasFerramentas } from '../_shared/ferramentas-dos-agentes.ts'

type EntradaDaSequenciaProposta = Parameters<NonNullable<BancoDasFerramentas['proporSequencia']>>[2]
import type { AgenteDoWorkspace, Reserva } from '../_shared/orquestracao.ts'
import type { OutgoingEmail } from '../_shared/send-step.ts'
import { createHandler as criarDescadastro, type UnsubscribeOutcome } from '../descadastro/handler.ts'
import {
  createHandler as criarReplyProposalRunner,
  type RunnerDb as ReplyRunnerDb,
} from '../reply-proposal-runner/handler.ts'
import {
  createHandler as criarSequenceRunner,
  type RunnerDb as SequenceRunnerDb,
} from '../sequence-runner/handler.ts'
import { createWorker, type FilaDb, type FimDoHermes, type Hermes } from './worker.ts'

const WORKSPACE_ID = '667e38aa-0b74-4b6d-9d66-42e760a82955'
const USER_ID = 'bbbb0aff-ca2a-43d9-a38a-f97a3f15fe91'
const CONTA_ALVO_ID = 'b22386fc-0552-47c5-bd7e-cdf8c6f1443d'
const CONTATO_RESPOSTA_ID = 'a7716f35-4725-4f9c-a54e-20026e18121c'
const CONTATO_DESCADASTRO_ID = 'a7716f35-4725-4f9c-a54e-20026e18121d'
const SUPABASE_URL = 'https://ycbdilsmydvzezhlymty.supabase.co'
const APP_URL = 'https://app.althius.com'
const RUNNER_TOKEN = 't'.repeat(48)

const RHETOR: AgenteDoWorkspace = {
  id: '00000000-0000-4000-8000-000000000105',
  name: 'Rhetor',
  specialty: 'rhetor',
  kind: 'padrao',
  instructions: '',
  voice_tone: 'direto',
}

function interpolar(modelo: string, variaveis: Record<string, string>): string {
  return modelo
    .replaceAll('{{primeiro_nome}}', variaveis.primeiro_nome)
    .replaceAll('{{nome}}', variaveis.nome)
    .replaceAll('{{cargo}}', variaveis.cargo)
    .replaceAll('{{empresa}}', variaveis.empresa)
    .replaceAll('{{remetente.nome}}', variaveis.remetente_nome)
}

Deno.test('Cadência de e-mail ponta a ponta: Conversa com o Rhetor -> Aprovação -> Ativar envios -> Envio pelo Executor -> Resposta pausa e gera Proposta de resposta', async () => {
  // --- Estado em memória que reflete o ciclo de vida das tabelas do banco ---
  const aprovacoes = new Map<string, {
    id: string
    kind: 'sequencia' | 'resposta'
    status: 'pendente' | 'aprovada' | 'recusada'
    proposta?: EntradaDaSequenciaProposta
    sequenceId?: string
    replyDraft?: string
  }>()
  const sequencias = new Map<string, {
    id: string
    name: string
    status: 'rascunho' | 'ativa' | 'pausada' | 'concluida'
    motivoPausa: string | null
    contactIds: string[]
    targetAccountId: string
    steps: { order: number; channel: string; waitDays: number; subject: string; body: string; confirmed: boolean }[]
  }>()
  const envios = new Map<string, {
    id: string
    sequenceId: string
    stepOrder: number
    status: 'pending' | 'sending' | 'sent' | 'cancelled'
    subject: string
    body: string
    unsubscribeToken: string
    providerMessageId: string | null
  }>()

  // --- 1. Conversa coordenada ("Gerar Sequência") -> o Rhetor lê a Conta-alvo e os Contatos e chama `propor_sequencia` ---
  const reserva: Reserva = {
    run_id: '11111111-2222-4333-8444-555555555551',
    kind: 'coordenada',
    workspace_name: 'Teste real - Workspace B',
    request_text: 'Monte uma Sequência de prospecção por e-mail para a Conta Althius B (Contato Althius).',
    agent_id: null,
    mentions: [],
    agents: [RHETOR],
    history: [],
  }

  let sequenciaPropostaId = ''
  const fechamentos: { status: string; errorCode: string | null }[] = []
  const db: FilaDb = {
    listQueued: () => Promise.resolve([reserva.run_id]),
    claim: () => Promise.resolve(reserva),
    append: () => Promise.resolve(1),
    finish: (_r, status, errorCode) => {
      fechamentos.push({ status, errorCode })
      return Promise.resolve()
    },
    searchAccounts: () => Promise.resolve([]),
  }

  const bancoDasFerramentas: BancoDasFerramentas = {
    contexto: () => Promise.resolve({ workspaceId: WORKSPACE_ID, requestedBy: USER_ID, permissoes: [] }),
    lerContas: () =>
      Promise.resolve([
        {
          id: CONTA_ALVO_ID,
          nome: 'Conta Althius B',
          dominio: 'althius.com.br',
          segmento: 'Tecnologia',
          aderencia: 'alto',
          etapa: 'qualificada',
          responsavel: 'Kauê Zanato',
          sinais: [{ tipo: 'Expansão', titulo: 'Nova operação comercial', prioridade: 'alta', detectadoEm: '2026-10-30' }],
        },
      ]),
    pedirDescoberta: () => Promise.reject(new Error('Não esperado')),
    proporEnvio: () => Promise.reject(new Error('Não esperado')),
    contatosParaSequencia: () =>
      Promise.resolve({
        conta: { id: CONTA_ALVO_ID, nome: 'Conta Althius B', responsavel: 'Kauê Zanato' },
        remetentesConectados: [{ canal: 'email', rotulo: 'Kauê Zanato <kauezanato@gmail.com>' }],
        contatos: [{
          id: CONTATO_RESPOSTA_ID,
          nome: 'Contato Althius',
          cargo: 'Diretor Comercial',
          papelNaCompra: 'decisor',
          temEmail: true,
          temWhatsapp: false,
          temLinkedin: false,
        }],
      }),
    proporSequencia: (_runId, agenteId, proposta) => {
      assertEquals(agenteId, RHETOR.id)
      const approvalId = '33333333-4444-4555-8666-777777777773'
      sequenciaPropostaId = approvalId
      aprovacoes.set(approvalId, { id: approvalId, kind: 'sequencia', status: 'pendente', proposta })
      return Promise.resolve({
        approvalId,
        outcome: 'pendente',
        conta: 'Conta Althius B',
      })
    },
  }

  const filaDoHermes = [
    JSON.stringify({
      agentes: [RHETOR.id],
      resposta_direta: '',
    }),
    JSON.stringify({
      ferramenta: 'ler_contatos_para_sequencia',
      entrada: { conta_id: CONTA_ALVO_ID },
    }),
    JSON.stringify({
      ferramenta: 'propor_sequencia',
      entrada: {
        conta_id: CONTA_ALVO_ID,
        contatos: [CONTATO_RESPOSTA_ID],
        passos: [
          {
            espera_em_dias: 0,
            assunto: 'Olá {{primeiro_nome}}, operação comercial da {{empresa}}',
            corpo:
              'Oi {{primeiro_nome}},\n\nVi o momento da {{empresa}} e preparei uma sugestão prática.\n\nAbraço,\n{{remetente.nome}}',
          },
          {
            espera_em_dias: 3,
            assunto: 'Retomando sobre a {{empresa}}',
            corpo: 'Oi {{primeiro_nome}}, conseguiu avaliar a mensagem anterior?\n\n{{remetente.nome}}',
          },
        ],
        justificativa: 'Proposta de Sequência de 2 passos por e-mail para a Conta Althius B.',
      },
    }),
    'Propus a Sequência **Cadência E2E — Conta Althius B** em Aprovações.\nSTATUS: pronto',
    'Propus a Sequência **Cadência E2E — Conta Althius B** em Aprovações.',
  ]

  const hermes: Hermes = {
    vivo: () => Promise.resolve(true),
    iniciar: () => Promise.resolve('h-run'),
    aguardar: (): Promise<FimDoHermes> =>
      Promise.resolve({ status: 'completed', output: filaDoHermes.shift() ?? '' }),
  }

  const worker = createWorker({
    db,
    hermes,
    porAgente: false, // Mesmo com HERMES_UMA_CHAMADA=true na VPS, ferramentas ligadas ativam o fluxo por Agente.
    ferramentas: { banco: bancoDasFerramentas, log: () => {} },
    log: () => {},
  })

  assertEquals(await worker.rodada(), 1)
  assertEquals(fechamentos, [{ status: 'succeeded', errorCode: null }])
  const aprovacaoCriada = aprovacoes.get(sequenciaPropostaId)
  assertEquals(aprovacaoCriada?.status, 'pendente')
  assertEquals(aprovacaoCriada?.proposta?.passos.length, 2)

  // --- 2. Aprovação pelo responsável (`decide_approval`): nasce a Sequência em `rascunho`, sem envios agendados ---
  const sequenceId = '44444444-5555-4666-8777-888888888884'
  aprovacaoCriada!.status = 'aprovada'
  aprovacaoCriada!.sequenceId = sequenceId
  sequencias.set(sequenceId, {
    id: sequenceId,
    name: 'Cadência E2E — Conta Althius B',
    status: 'rascunho',
    motivoPausa: null,
    contactIds: aprovacaoCriada!.proposta!.contatos,
    targetAccountId: aprovacaoCriada!.proposta!.targetAccountId,
    steps: aprovacaoCriada!.proposta!.passos.map((s, idx) => ({
      order: idx + 1,
      channel: 'email',
      waitDays: s.esperaEmDias,
      subject: s.assunto,
      body: s.corpo,
      confirmed: false,
    })),
  })
  // Antes de "Ativar envios", nenhum envio existe na fila:
  assertEquals(sequencias.get(sequenceId)?.status, 'rascunho')
  assertEquals(envios.size, 0)

  // --- 3. "Ativar envios": confirma os passos (`confirm_sequence_step`), autoriza a versão e enfileira o passo 1 ---
  const seq = sequencias.get(sequenceId)!
  for (const passo of seq.steps) passo.confirmed = true
  seq.status = 'ativa'
  const variaveisContato = {
    primeiro_nome: 'Contato',
    nome: 'Contato Althius',
    cargo: 'Diretor Comercial',
    empresa: 'Conta Althius B',
    remetente_nome: 'Kauê Zanato',
  }
  const sendId = '55555555-6666-4777-8888-999999999995'
  const tokenDescadastroPasso1 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
  envios.set(sendId, {
    id: sendId,
    sequenceId,
    stepOrder: 1,
    status: 'pending',
    subject: interpolar(seq.steps[0].subject, variaveisContato),
    body: interpolar(seq.steps[0].body, variaveisContato),
    unsubscribeToken: tokenDescadastroPasso1,
    providerMessageId: null,
  })

  // --- 4. Envio pelo Executor (`sequence-runner` + `sendStep` + `unsubscribeLinksFrom`) ---
  const emailsDisparados: { accountId: string; email: OutgoingEmail }[] = []

  const sequenceRunnerDb: SequenceRunnerDb = {
    tokenMatches: (t) => Promise.resolve(t === RUNNER_TOKEN),
    claimSenderReconciliations: () => Promise.resolve([]),
    conversationsToReconcile: () => Promise.resolve([]),
    recordReconciliationProgress: () => Promise.resolve(true),
    finishSenderReconciliation: () => Promise.resolve(true),
    claimDueSends: () => {
      const envio = envios.get(sendId)!
      envio.status = 'sending'
      return Promise.resolve([{ send_id: sendId, owner_user_id: USER_ID }])
    },
    conversationForSend: () => Promise.resolve(null),
    ingestEmailEvent: () =>
      Promise.resolve({
        outcome: 'ignored_not_related',
        interaction_id: null,
        send_id: null,
        attachments: [],
      }),
    releaseDueSend: (id) => {
      const envio = envios.get(id)!
      return Promise.resolve({
        outcome: 'released',
        send_id: envio.id,
        unipile_account_id: 'ocQXv2ApSEWBmKiRR4G08Q',
        destination: 'althius.relacionamento@gmail.com',
        contact_name: 'Contato Althius',
        subject: envio.subject,
        body: envio.body,
        reply_to_message_id: null,
        tracking_header_name: 'X-Althius-Send',
        tracking_header_value: envio.id,
        unsubscribe_token: envio.unsubscribeToken,
      })
    },
    recordStepSendResult: ({ sendId: id, outcome, providerMessageId }) => {
      const envio = envios.get(id)!
      if (outcome === 'sent') {
        envio.status = 'sent'
        envio.providerMessageId = providerMessageId ?? null
      }
      return Promise.resolve()
    },
  }

  let trabalhoDoSequenceRunner: Promise<unknown> = Promise.resolve()
  const handlerSequenceRunner = criarSequenceRunner({
    db: sequenceRunnerDb,
    unipile: {
      sendEmail: (accountId, email) => {
        emailsDisparados.push({ accountId, email })
        return Promise.resolve({ id: 'email-unipile-1', message_id: '<msg-passo-1@althius.com>' })
      },
      getEmail: () => Promise.resolve({}),
      listThreadEmails: () => Promise.resolve([]),
      listEmailSenders: () => Promise.resolve(['kauezanato@gmail.com']),
    },
    unsubscribeLinks: unsubscribeLinksFrom(APP_URL, SUPABASE_URL),
    waitUntil: (w) => {
      trabalhoDoSequenceRunner = w
    },
    log: () => {},
  })

  const respRunner = await handlerSequenceRunner(
    new Request('https://edge.local/sequence-runner', {
      method: 'POST',
      headers: { 'x-runner-token': RUNNER_TOKEN },
    }),
  )
  assertEquals(respRunner.status, 202)
  await trabalhoDoSequenceRunner

  // Verifica o e-mail enviado pelo Executor: variáveis preenchidas (sem chaves cruas), rodapé e cabeçalho List-Unsubscribe
  assertEquals(envios.get(sendId)?.status, 'sent')
  assertEquals(emailsDisparados.length, 1)
  const emailEnviado = emailsDisparados[0].email
  assertEquals(emailEnviado.to, [{ email: 'althius.relacionamento@gmail.com', display_name: 'Contato Althius' }])
  assertEquals(emailEnviado.subject, 'Olá Contato, operação comercial da Conta Althius B')
  assertStringIncludes(emailEnviado.plain_text, 'Oi Contato,')
  assertStringIncludes(emailEnviado.plain_text, 'Vi o momento da Conta Althius B e preparei uma sugestão prática.')
  assertStringIncludes(emailEnviado.plain_text, 'Kauê Zanato')
  assertEquals(/\{\{|\}\}/.test(emailEnviado.subject), false)
  assertEquals(/\{\{|\}\}/.test(emailEnviado.plain_text), false)
  assertStringIncludes(
    emailEnviado.plain_text,
    `${RODAPE_DE_DESCADASTRO} ${APP_URL}/descadastro?t=${tokenDescadastroPasso1}`,
  )
  assertEquals(emailEnviado.custom_headers, [
    { name: 'X-Althius-Send', value: sendId },
    { name: 'List-Unsubscribe', value: `<${SUPABASE_URL}/functions/v1/descadastro?t=${tokenDescadastroPasso1}>` },
    { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
  ])

  // --- 5. Resposta do Contato pausa a Sequência (`Resposta recebida`) e gera Proposta de resposta em Aprovações ---
  // Quando `ingest_unipile_email_event` recebe a resposta do Contato, a Sequência ativa é pausada com `Resposta recebida`
  // e nasce o job de Proposta de resposta para o `reply-proposal-runner`:
  seq.status = 'pausada'
  seq.motivoPausa = 'Resposta recebida'
  const replyProposalId = '66666666-7777-4888-8999-aaaaaaaaaaa6'
  aprovacoes.set(replyProposalId, { id: replyProposalId, kind: 'resposta', status: 'pendente' })

  const replyRunnerDb: ReplyRunnerDb = {
    tokenMatches: (t) => Promise.resolve(t === RUNNER_TOKEN),
    claim: () =>
      Promise.resolve([{
        job_id: '77777777-8888-4999-8aaa-bbbbbbbbbbb7',
        proposal_id: replyProposalId,
        claim_token: 'claim-reply-1',
        attempt: 1,
      }]),
    context: () =>
      Promise.resolve({
        workspace: 'Teste real - Workspace B',
        channel: 'email',
        subject: 'Re: Olá Contato, operação comercial da Conta Althius B',
        seller: 'Kauê Zanato',
        account: { name: 'Conta Althius B', domain: 'althius.com.br', segment: 'Tecnologia' },
        contact: { name: 'Contato Althius', role: 'Diretor Comercial' },
        recipient_name: 'Contato Althius',
        messages: [
          {
            direction: 'enviada',
            at: '2026-10-31T19:00:00-03:00',
            subject: emailEnviado.subject,
            text: emailEnviado.plain_text,
          },
          {
            direction: 'recebida',
            at: '2026-10-31T19:02:00-03:00',
            subject: 'Re: Olá Contato, operação comercial da Conta Althius B',
            text: 'Olá Kauê, faz sentido conversarmos. Podemos falar na quinta-feira às 15h?',
          },
        ],
        playbook: [{
          name: 'Oferta',
          section: 'oferta',
          content: { texto: 'Prospecção B2B com qualificação e agendamento.' },
        }],
        agent: { name: 'Rhetor', instructions: 'Seja objetivo e cordial.', voice_tone: 'direto' },
      }),
    chaveDoCliente: () => Promise.resolve(null),
    consumirTeto: () => Promise.resolve('ok'),
    devolverTeto: () => Promise.resolve(),
    abrirCredito: () => Promise.resolve({ outcome: 'free', reservation_id: null }),
    fecharCredito: () => Promise.resolve(),
    salvar: (job, corpo) => {
      const prop = aprovacoes.get(job.proposal_id)!
      prop.replyDraft = corpo
      return Promise.resolve()
    },
    falhar: (_job, codigo) => Promise.reject(new Error(`Falha inesperada na Proposta de resposta: ${codigo}`)),
    custo: () => Promise.resolve(),
  }

  let trabalhoReplyRunner: Promise<unknown> = Promise.resolve()
  const handlerReplyRunner = criarReplyProposalRunner({
    db: replyRunnerDb,
    modeloParaTrabalho: () => ({
      nome: 'hermes-test',
      criar: () =>
        Promise.resolve({
          stop_reason: 'end_turn',
          content: [{
            type: 'text',
            text:
              'Olá Contato,\n\nPerfeito, quinta-feira às 15h funciona bem. Vou enviar o convite.\n\nAbraço,\nKauê Zanato',
          }],
          usage: { input_tokens: 120, output_tokens: 35 },
        } as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof criarReplyProposalRunner>[0]['modelo']>['criar']>>),
    }),
    modelo: null,
    waitUntil: (w) => {
      trabalhoReplyRunner = w
    },
    log: () => {},
  })

  const respReply = await handlerReplyRunner(
    new Request('https://edge.local/reply-proposal-runner', {
      method: 'POST',
      headers: { 'x-runner-token': RUNNER_TOKEN },
    }),
  )
  assertEquals(respReply.status, 202)
  await trabalhoReplyRunner

  assertEquals(sequencias.get(sequenceId)?.status, 'pausada')
  assertEquals(sequencias.get(sequenceId)?.motivoPausa, 'Resposta recebida')
  assertStringIncludes(aprovacoes.get(replyProposalId)?.replyDraft ?? '', 'quinta-feira às 15h')
})

Deno.test('Cenário separado de Descadastro: GET redireciona para confirmação sem gravar, POST registra Supressão e pausa a Sequência com motivo Descadastro', async () => {
  // Outra Sequência e outro Contato para demonstrar de forma independente a Supressão e a pausa por Descadastro
  const tokenDescadastro = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f'
  const sequenciaDescadastro = {
    id: '88888888-9999-4aaa-8bbb-ccccccccccc8',
    contactId: CONTATO_DESCADASTRO_ID,
    email: 'contato.descadastro.teste@althius.com.br',
    status: 'ativa' as 'ativa' | 'pausada',
    motivoPausa: null as string | null,
    passosPendentes: 2,
  }
  const supressoes = new Map<string, { workspaceId: string; email: string; channel: 'email'; reason: string }>()

  const handlerDescadastro = criarDescadastro({
    appOrigin: APP_URL,
    db: {
      unsubscribe: (token): Promise<UnsubscribeOutcome> => {
        if (token !== tokenDescadastro) return Promise.resolve('invalid')
        if (supressoes.has(sequenciaDescadastro.email)) {
          return Promise.resolve('already_registered')
        }
        supressoes.set(sequenciaDescadastro.email, {
          workspaceId: WORKSPACE_ID,
          email: sequenciaDescadastro.email,
          channel: 'email',
          reason: 'unsubscribe',
        })
        sequenciaDescadastro.status = 'pausada'
        sequenciaDescadastro.motivoPausa = 'Descadastro'
        sequenciaDescadastro.passosPendentes = 0
        return Promise.resolve('registered')
      },
    },
  })

  // 1. O clique GET no rodapé redireciona para a página de confirmação sem registrar a Supressão:
  const respostaGet = await handlerDescadastro(
    new Request(`${SUPABASE_URL}/functions/v1/descadastro?t=${tokenDescadastro}`, { method: 'GET' }),
  )
  assertEquals(respostaGet.status, 302)
  assertMatch(respostaGet.headers.get('Location') ?? '', /\/descadastro\?t=f0e1d2c3b4a59687/)
  assertEquals(supressoes.size, 0)
  assertEquals(sequenciaDescadastro.status, 'ativa')

  // 2. A confirmação POST (página ou List-Unsubscribe-Post RFC 8058) grava a Supressão e pausa com motivo "Descadastro":
  const respostaPost = await handlerDescadastro(
    new Request(`${SUPABASE_URL}/functions/v1/descadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenDescadastro }),
    }),
  )
  assertEquals(respostaPost.status, 200)
  assertEquals(await respostaPost.json(), { outcome: 'registered' })
  assertEquals(supressoes.get(sequenciaDescadastro.email)?.reason, 'unsubscribe')
  assertEquals(sequenciaDescadastro.status, 'pausada')
  assertEquals(sequenciaDescadastro.motivoPausa, 'Descadastro')
  assertEquals(sequenciaDescadastro.passosPendentes, 0)

  // 3. Repetir o POST com o mesmo token é idempotente ('already_registered'):
  const respostaRepetida = await handlerDescadastro(
    new Request(`${SUPABASE_URL}/functions/v1/descadastro?t=${tokenDescadastro}`, { method: 'POST' }),
  )
  assertEquals(respostaRepetida.status, 200)
  assertEquals(await respostaRepetida.json(), { outcome: 'already_registered' })
})

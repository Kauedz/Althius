// Teste real do ticket 01 (.scratch/canais-cadencia-backend): acesso real e responsabilidade
// exclusiva, contra o projeto Supabase de verdade e pela mesma API que o app usa.
//
// Entra por senha com as cinco personas que scripts/wizard-teste-real.sh criou (TESTE_* no
// .env.local) e confere cada regra. Grava dados reais que o fluxo público não apaga: cada rodada
// usa Contas-alvo novas, com o prefixo teste-real-.
//
//   npm run teste:real

import { createClient } from '@supabase/supabase-js'

const PERSONAS = [
  ['responsavel', 'Vendedor responsável', 'RESPONSAVEL'],
  ['membro', 'Outro Membro', 'MEMBRO'],
  ['administrador', 'Administrador', 'ADMIN'],
  ['outroWorkspace', 'Membro de outro Workspace', 'OUTRO_WS'],
  ['semParticipacao', 'Sem Participação', 'SEM_PARTICIPACAO'],
]

function exigir(nome) {
  const valor = process.env[nome]
  if (!valor) {
    console.error(`Falta ${nome} no .env.local: rode scripts/wizard-teste-real.sh antes.`)
    process.exit(1)
  }
  return valor
}

const url = exigir('VITE_SUPABASE_URL')
const chavePublicavel = exigir('VITE_SUPABASE_PUBLISHABLE_KEY')
const workspaceA = exigir('TESTE_WORKSPACE_A')

/** Uma sessão real por persona, sem guardar nada em disco. */
async function entrar(nome, chave) {
  const cliente = createClient(url, chavePublicavel, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await cliente.auth.signInWithPassword({
    email: exigir(`TESTE_${chave}_EMAIL`),
    password: exigir(`TESTE_${chave}_SENHA`),
  })
  if (error) {
    console.error(`Não foi possível entrar como ${nome}: ${error.message}`)
    process.exit(1)
  }
  return { cliente, id: data.user.id }
}

let total = 0
let falhas = 0

function conferir(regra, ok, detalhe) {
  total += 1
  if (!ok) falhas += 1
  console.log(`${ok ? '✓' : '✗'} ${regra}${ok || !detalhe ? '' : ` (${detalhe})`}`)
}

function descrever({ data, error }) {
  if (error) return `código ${error.code}: ${error.message}`
  return Array.isArray(data) ? `${data.length} linha(s)` : 'a chamada foi aceita'
}

/** A chamada tem de ser recusada com o código esperado; 42501 é acesso negado. */
function recusada(regra, resposta, codigo = '42501') {
  conferir(regra, resposta.error?.code === codigo, descrever(resposta))
}

function linha({ data }) {
  return Array.isArray(data) ? data[0] : data
}

const sufixo = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const conta = `teste-real-${sufixo}`
const contaDisputada = `teste-real-${sufixo}-disputa`

const documento = {
  participantesIds: ['contato-teste-real'],
  steps: [{
    id: 'passo-1',
    ordem: 1,
    canal: 'email',
    contatoId: 'contato-teste-real',
    delayDiasUteis: 0,
    titulo: 'Teste real',
    assunto: 'Teste real',
    corpo: 'Criado pelo teste real; nada é enviado.',
  }],
  passoAtual: 0,
}
// O campo extra não pode chegar à projeção que os outros participantes leem.
const resumo = { totalParticipantes: 1, totalSteps: 1, passoAtual: 0, segredo: 'não deve vazar' }

function criar(cliente, contaAlvo) {
  return cliente.rpc('create_sequence', {
    p_workspace_id: workspaceA,
    p_target_account_id: contaAlvo,
    p_private_document: documento,
    p_public_summary: resumo,
  })
}

function alterar(cliente, id, status) {
  return cliente.rpc('update_owned_sequence', {
    p_sequence_id: id,
    p_private_document: documento,
    p_public_summary: resumo,
    p_status: status,
  })
}

function projecao(cliente, id) {
  return cliente.from('sequences').select('id, status, public_summary').eq('id', id)
}

const p = {}
for (const [papel, nome, chave] of PERSONAS) p[papel] = await entrar(nome, chave)

console.log(`Projeto ${url}`)
console.log(`Contas-alvo desta rodada: ${conta} e ${contaDisputada}\n`)

// Vendedor responsável
const criada = await criar(p.responsavel.cliente, conta)
const sequencia = linha(criada)
conferir('Vendedor responsável cria a única Sequência da Conta-alvo',
  !criada.error && sequencia?.owner_user_id === p.responsavel.id, descrever(criada))
if (!sequencia) {
  console.error('\nSem a Sequência criada, as outras regras não têm o que conferir.')
  process.exit(1)
}
const id = sequencia.id

const lida = await p.responsavel.cliente.rpc('get_owned_sequence', { p_sequence_id: id })
conferir('Vendedor responsável lê o próprio documento privado',
  linha(lida)?.public_summary?._document?.steps?.length === 1, descrever(lida))
const pausada = await alterar(p.responsavel.cliente, id, 'pausada')
conferir('Vendedor responsável pausa a Sequência pela RPC', linha(pausada)?.status === 'pausada', descrever(pausada))
recusada('Nem o Vendedor responsável cria uma segunda Sequência na mesma Conta-alvo',
  await criar(p.responsavel.cliente, conta), '23505')

// Responsabilidade exclusiva
recusada('Outro Membro não cria Sequência concorrente na mesma Conta-alvo', await criar(p.membro.cliente, conta))
recusada('Administrador não cria Sequência concorrente na mesma Conta-alvo', await criar(p.administrador.cliente, conta))
const disputa = await Promise.all([criar(p.responsavel.cliente, contaDisputada), criar(p.membro.cliente, contaDisputada)])
conferir('Criações simultâneas numa Conta-alvo nova têm um único vencedor',
  disputa.filter((r) => !r.error).length === 1 && disputa.find((r) => r.error)?.error.code === '42501',
  disputa.map(descrever).join(' | '))
recusada('Outro Membro não toma a responsabilidade por edição direta',
  await p.membro.cliente.from('sales_responsibilities').update({ owner_user_id: p.membro.id }).eq('target_account_id', conta))

// Edição
recusada('Outro Membro não altera a Sequência', await alterar(p.membro.cliente, id, 'ativa'))
recusada('Administrador não altera a Sequência', await alterar(p.administrador.cliente, id, 'ativa'))
recusada('Nem o Vendedor responsável edita a tabela direto, fora da RPC',
  await p.responsavel.cliente.from('sequences').update({ status: 'ativa' }).eq('id', id))
recusada('A Sequência não é apagada pelo fluxo público', await p.responsavel.cliente.from('sequences').delete().eq('id', id))

// Leitura
recusada('Outro Membro não lê o documento privado', await p.membro.cliente.rpc('get_owned_sequence', { p_sequence_id: id }))
const vistaDoMembro = await projecao(p.membro.cliente, id)
const resumoVisto = vistaDoMembro.data?.[0]?.public_summary ?? {}
conferir('Outro Membro vê a projeção só com status e contagens',
  vistaDoMembro.data?.length === 1 && vistaDoMembro.data[0].status === 'pausada'
    && !('segredo' in resumoVisto) && !('_document' in resumoVisto),
  vistaDoMembro.error ? descrever(vistaDoMembro) : JSON.stringify(vistaDoMembro.data))
const vistaDoAdministrador = await projecao(p.administrador.cliente, id)
conferir('Administrador vê a projeção', vistaDoAdministrador.data?.length === 1, descrever(vistaDoAdministrador))
const documentoDireto = await p.responsavel.cliente.schema('private').from('sequence_documents').select('sequence_id')
conferir('O documento privado não é exposto pela API', Boolean(documentoDireto.error), descrever(documentoDireto))

// Isolamento
const vistaDeFora = await projecao(p.outroWorkspace.cliente, id)
conferir('Membro de outro Workspace não vê a projeção do Workspace A',
  !vistaDeFora.error && vistaDeFora.data.length === 0, descrever(vistaDeFora))
recusada('Membro de outro Workspace não cria Sequência no Workspace A', await criar(p.outroWorkspace.cliente, `${conta}-fora`))
const vistaSemParticipacao = await p.semParticipacao.cliente.from('sequences').select('id')
conferir('Sem Participação não vê nenhuma Sequência',
  !vistaSemParticipacao.error && vistaSemParticipacao.data.length === 0, descrever(vistaSemParticipacao))
recusada('Sem Participação não cria Sequência', await criar(p.semParticipacao.cliente, `${conta}-sem`))

// Encerra só as sessões deste script; as do navegador continuam valendo.
await Promise.all(Object.values(p).map(({ cliente }) => cliente.auth.signOut({ scope: 'local' })))

console.log(`\n${total - falhas}/${total} regras confirmadas.`)
if (falhas) process.exitCode = 1

// O agente único na Demonstração: responde na hora, sem modelo, com empresas e pessoas de exemplo. Nada sai daqui.
import type {
  CartaoDoAgente,
  ConversaDoAgente,
  EmpresaDoCartao,
  FonteDoAgente,
  PassoDoAgente,
  ResumoDaConversaDoAgente,
  TurnoDoAgente,
} from './agente-tipos'
import { ErroDoAgente } from './agente-tipos'

const EMPRESAS: EmpresaDoCartao[] = [
  {
    id: 'demo-desc-1', nome: 'Translog Cargas Ltda', dominio: 'translogcargas.com.br', setor: 'Transporte rodoviário de cargas',
    porte: '201-500 funcionários', local: 'Campinas, SP', nivel: 'alto', estado: 'nova', contaId: null,
    porques: [
      { texto: 'Setor combina com o ICP: logística.', atende: true },
      { texto: 'Região dentro do ICP: SP.', atende: true },
      { texto: 'Porte na faixa do ICP (50 a 500).', atende: true },
    ],
  },
  {
    id: 'demo-desc-2', nome: 'Rota Sul Armazéns Gerais', dominio: 'rotasul.com.br', setor: 'Armazenagem',
    porte: '51-200 funcionários', local: 'Joinville, SC', nivel: 'medio', estado: 'nova', contaId: null,
    porques: [
      { texto: 'Setor combina com o ICP: logística.', atende: true },
      { texto: 'Região fora do ICP: SC.', atende: false },
    ],
  },
  {
    id: 'demo-desc-3', nome: 'Fretz Distribuição', dominio: 'fretz.com.br', setor: 'Distribuição',
    porte: null, local: 'Guarulhos, SP', nivel: 'sem_dado', estado: 'nova', contaId: null,
    porques: [{ texto: 'Sem dado de porte para avaliar.', atende: null }],
  },
]

const PESSOAS = [
  { nome: 'Marina Albuquerque', cargo: 'Diretora de Operações', persona: 'Decisora', linkedinUrl: null, jaEncontrada: false },
  { nome: 'Ricardo Tavares', cargo: 'Gerente de Logística', persona: 'Usuário', linkedinUrl: null, jaEncontrada: false },
  { nome: 'Paulo Henrique Sato', cargo: 'CFO', persona: 'Aprovador', linkedinUrl: null, jaEncontrada: true },
]

const ICP: CartaoDoAgente = {
  tipo: 'icp', versao: 3, setor: 'Logística e transporte', porte: '50 a 500 funcionários', geografia: 'SP e PR',
  cargos: ['Diretor de Operações', 'Gerente de Logística'], oQueVende: 'Roteirização e rastreio de frota para operações B2B.',
}

const PROPOSTA = {
  tipo: 'icp_proposto' as const, setor: 'Logística e transporte', porte: '51-200, 201-500', geografia: 'SP e PR',
  cargos: ['Diretor de Operações'], oQueVende: 'Roteirização e rastreio de frota para operações B2B.',
}

let contador = 0
const novoId = (prefixo: string) => `${prefixo}-${++contador}`

export function criarFonteDoAgenteSimulada({ agora = () => new Date() }: { agora?: () => Date } = {}): FonteDoAgente {
  const conversas = new Map<string, ConversaDoAgente>()
  const atualizadas = new Map<string, string>()

  function passo(ferramenta: string, titulo: string, cartoes: CartaoDoAgente[], custo = 0): PassoDoAgente {
    return { id: novoId('demo-passo'), seq: 0, ferramenta, titulo, estado: 'ok', motivoConfirmacao: null, cartoes, custo, erro: null, pendente: false }
  }

  function turno(pedido: string, passos: PassoDoAgente[], resposta: string): TurnoDoAgente {
    passos.forEach((p, i) => { p.seq = i + 1 })
    return { id: novoId('demo-turno'), pedido, status: 'concluido', resposta, errorCode: null, criadoEm: agora().toISOString(), passos }
  }

  function responder(pedido: string): TurnoDoAgente {
    const t = pedido.toLowerCase()
    if (/empresa|conta|busc|encontr|ache|prospect/.test(t)) {
      return turno(pedido, [
        passo('ler_icp', 'Ler o ICP do Workspace', [ICP]),
        passo('buscar_empresas', 'Buscar até 20 empresas pelo ICP', [{ tipo: 'empresas', empresas: EMPRESAS.map((e) => ({ ...e })) }], 5),
      ], 'Encontrei 3 empresas novas; a Translog Cargas tem a aderência mais alta. Aceite as que fazem sentido para virarem Contas-alvo.')
    }
    if (/neg[oó]cios ganhos|\bcrm\b/.test(t)) {
      return turno(pedido, [passo('ler_icp_do_crm', 'Ler os negócios ganhos do CRM para propor o ICP', [{
        tipo: 'icp_proposto', origem: 'crm', crms: ['HubSpot'], negocios: 12,
        setor: 'Logística e transporte', porte: '201-500', geografia: 'PR',
        divergencias: [
          { campo: 'porte', doCrm: '201-500', doSite: '51-200', sugerido: 'crm' },
          { campo: 'regiao', doCrm: 'PR', doSite: 'SP', sugerido: 'crm' },
        ],
      }])], 'Pelos 12 negócios ganhos no HubSpot, o porte e a região divergem do ICP salvo. Qual você quer manter?')
    }
    const site = /site\s+(?:de\s+|da\s+|do\s+)?([a-z0-9.-]+\.[a-z]{2,})/.exec(t)
    if (site) {
      return turno(pedido, [passo('ler_site_para_icp', `Ler o site ${site[1]} para propor o ICP`, [{ ...PROPOSTA, dominio: site[1] }])],
        'Li o site e montei esta proposta de ICP. Diga o que ajustar ou peça para salvar.')
    }
    if (/pode salvar|\bsalve\b/.test(t)) {
      const p = passo('salvar_icp', 'Salvar o ICP do Workspace', [{
        tipo: 'confirmacao', titulo: 'Salvar o ICP do Workspace', custo: 0, motivo: 'alteracao', gastos: 0, teto: 50,
        texto: 'Salvar o ICP do Workspace grava uma nova versão no Workspace. Confira os campos antes de confirmar.',
      }])
      p.estado = 'aguardando_confirmacao'
      p.motivoConfirmacao = 'alteracao'
      return { ...turno(pedido, [p], ''), status: 'aguardando' }
    }
    if (/icp|perfil|para quem/.test(t)) {
      return turno(pedido, [passo('ler_icp', 'Ler o ICP do Workspace', [ICP])], 'Este é o ICP salvo hoje, versão 3.')
    }
    return turno(pedido, [], 'Posso buscar empresas pelo seu ICP, aceitar as que fizerem sentido e enriquecer o comitê de compra delas. Por onde começamos?')
  }

  function ler(id: string): ConversaDoAgente {
    const c = conversas.get(id)
    if (!c) throw new ErroDoAgente('Esta conversa não existe ou não é sua.', 'nao_encontrada')
    return c
  }

  function acharPasso(passoId: string): { conversa: ConversaDoAgente; passo: PassoDoAgente } {
    for (const conversa of conversas.values()) {
      for (const t of conversa.turnos) {
        const p = t.passos.find((x) => x.id === passoId)
        if (p) return { conversa, passo: p }
      }
    }
    throw new ErroDoAgente('Não encontrado.', 'nao_encontrado')
  }

  return {
    disponivel: () => Promise.resolve(true),
    pedidoDoCanal: (id) => id === 'demo-pedido-do-slack'
      ? Promise.resolve({ texto: 'Ache empresas de logística no PR', origem: 'slack' })
      : Promise.reject(new ErroDoAgente('Não encontrei este pedido. Ele é de outra pessoa ou já não está neste Workspace.', 'nao_encontrado')),
    conversas() {
      const lista: ResumoDaConversaDoAgente[] = [...conversas.values()].map((c) => ({
        id: c.id, titulo: c.titulo, atualizadaEm: atualizadas.get(c.id) ?? agora().toISOString(), ultimoStatus: c.turnos.at(-1)?.status ?? null,
      }))
      return Promise.resolve(lista.reverse())
    },
    conversa: (id) => Promise.resolve(structuredClone(ler(id))),
    enviar(pedido, conversaId) {
      const conversa = conversaId ? ler(conversaId) : { id: novoId('demo-conversa'), titulo: pedido.slice(0, 80), gastos: 0, teto: 50, turnos: [] }
      const t = responder(pedido)
      conversa.turnos.push(t)
      conversa.gastos += t.passos.reduce((s, p) => s + p.custo, 0)
      conversas.set(conversa.id, conversa)
      atualizadas.set(conversa.id, agora().toISOString())
      return Promise.resolve({ conversaId: conversa.id, turnoId: t.id })
    },
    confirmar(passoId) {
      const { conversa, passo: p } = acharPasso(passoId)
      if (p.estado === 'aguardando_confirmacao' && p.ferramenta === 'salvar_icp') {
        p.estado = 'ok'
        p.motivoConfirmacao = null
        p.cartoes = [{ ...ICP, ...PROPOSTA, tipo: 'icp', versao: 4 }]
        const t = conversa.turnos.find((x) => x.passos.includes(p))
        if (t) { t.status = 'concluido'; t.resposta = 'ICP salvo como versão 4.' }
        atualizadas.set(conversa.id, agora().toISOString())
      }
      return Promise.resolve()
    },
    cancelar: () => Promise.resolve(),
    escolher(passoId, escolha, alvoId) {
      const { conversa, passo: origem } = acharPasso(passoId)
      const cartao = origem.cartoes.find((c) => c.tipo === 'empresas')
      const empresa = cartao?.tipo === 'empresas' ? cartao.empresas.find((e) => e.id === alvoId) : undefined
      if (!empresa) throw new ErroDoAgente('Esta empresa não está neste cartão.', 'nao_encontrado')
      if (escolha === 'enriquecer') {
        if (!empresa.contaId) throw new ErroDoAgente('Aceite a empresa como Conta-alvo antes de enriquecer o comitê.')
        const novas = PESSOAS.filter((p) => !p.jaEncontrada).length
        conversa.turnos.push(turno(`Enriquecer o comitê de compra de ${empresa.nome}`, [
          passo('enriquecer_comite', `Enriquecer o comitê de ${empresa.nome}`, [
            { tipo: 'pessoas', contaId: empresa.contaId, conta: empresa.nome, pessoas: PESSOAS },
          ], novas),
        ], `${PESSOAS.length} pessoas do comitê de ${empresa.nome} (${novas} novas).`))
        conversa.gastos += novas
      } else {
        if (empresa.estado !== 'nova') throw new ErroDoAgente('Esta empresa já foi decidida.')
        empresa.estado = escolha === 'aceitar' ? 'aceita' : 'descartada'
        if (escolha === 'aceitar') empresa.contaId = `demo-conta-${empresa.id}`
        conversa.turnos.push(turno(
          escolha === 'aceitar' ? `Aceitar ${empresa.nome} como Conta-alvo` : `Descartar ${empresa.nome}`,
          [passo(escolha === 'aceitar' ? 'aceitar_empresa' : 'descartar_empresa', escolha === 'aceitar' ? `Aceitar ${empresa.nome}` : `Descartar ${empresa.nome}`, [
            { tipo: 'aviso', texto: escolha === 'aceitar' ? 'Virou Conta-alvo.' : 'Descartada.' },
          ])],
          escolha === 'aceitar' ? `${empresa.nome} virou Conta-alvo.` : `${empresa.nome} saiu da Caixa de Descobertas.`,
        ))
      }
      atualizadas.set(conversa.id, agora().toISOString())
      return Promise.resolve()
    },
    atualizar: () => Promise.resolve(false),
  }
}

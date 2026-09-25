// As fontes de um Workspace operacional para os módulos que ainda não têm backend. Não trazem dado nenhum da
// Demonstração: uma lista é vazia, porque o Workspace ainda não guardou nada ali, e toda ação é recusada com
// `ErroDeModuloIndisponivel`, sem simular sucesso. Cada módulo troca a sua pelo adapter real quando for entregue.

import {
  ErroDeModuloIndisponivel,
  type ModuloDoWorkspace,
  type ParticipacaoNoWorkspace,
  type ContaDeUsuarioDaSessao,
} from './ambiente'
import type { FonteDeSinais } from './sinais-tipos'
import type { FonteDeAgentes, FonteDeOnboarding } from './tipos'

/** Nada muda numa fonte sem backend: não há o que observar. */
const semMudancas = () => () => {}

const nenhum = async () => []

function recusar(modulo: ModuloDoWorkspace) {
  return () => Promise.reject(new ErroDeModuloIndisponivel(modulo))
}

/** Uma Conversa sem modelo configurado: recusa antes do primeiro passo, sem roteiro. */
function semConversa(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new ErroDeModuloIndisponivel('agentes')) }),
  }
}

/**
 * Agentes, Conversas, Aprovações, Conexões e Configurações do Workspace operacional. Só a identidade é real: a Conta
 * de usuário da sessão e o papel da Participação escolhida.
 */
export function criarFonteDeAgentesIndisponivel({
  usuario,
  participacao,
}: {
  usuario: ContaDeUsuarioDaSessao
  participacao: ParticipacaoNoWorkspace
}): FonteDeAgentes {
  return {
    observar: semMudancas,
    async workspace() {
      return {
        // O nome do Workspace chega com o cadastro do Workspace; até lá, ele não é inventado.
        cliente: 'Workspace',
        descricao: '',
        usuario: { id: usuario.id, nome: usuario.email, email: usuario.email, cargo: '' },
        papel: participacao.papel,
        aprovacoesPendentes: 0,
      }
    },
    observarAvisos: semMudancas,
    salvarPerfil: recusar('configuracoes'),
    preferencias: recusar('configuracoes'),
    salvarPreferencias: recusar('configuracoes'),
    participantesDoWorkspace: recusar('configuracoes'),
    contaDeUsuario: recusar('configuracoes'),
    salvarInformacoesDoWorkspace: recusar('configuracoes'),
    convidarParaWorkspace: recusar('configuracoes'),
    cancelarConvite: recusar('configuracoes'),
    mudarPapel: recusar('configuracoes'),
    removerDoWorkspace: recusar('configuracoes'),
    plano: recusar('configuracoes'),
    especialidades: nenhum,
    agentes: nenhum,
    agente: recusar('agentes'),
    criarAgente: recusar('agentes'),
    excluirAgente: recusar('agentes'),
    memoria: nenhum,
    editarFato: recusar('agentes'),
    apagarFato: recusar('agentes'),
    habilidades: nenhum,
    definirHabilidadeAtiva: recusar('agentes'),
    rotinas: nenhum,
    criarRotina: recusar('agentes'),
    editarRotina: recusar('agentes'),
    definirRotinaPausada: recusar('agentes'),
    excluirRotina: recusar('agentes'),
    atividade: nenhum,
    personalizacao: recusar('agentes'),
    salvarPersonalizacao: recusar('agentes'),
    canais: nenhum,
    integracoes: nenhum,
    integracoesFuturas: nenhum,
    conectar: recusar('conexoes'),
    previaDeCanal: recusar('conexoes'),
    memoriaDoWorkspace: recusar('configuracoes'),
    solicitarRevisao: recusar('configuracoes'),
    aprovacoes: nenhum,
    decidirAprovacao: recusar('aprovacoes'),
    proporAprovacao: recusar('aprovacoes'),
    conversar: semConversa,
    sugestoesCoordenadas: nenhum,
    conversarCoordenado: semConversa,
  }
}

/** Sinais e Monitoramentos do Workspace operacional: nenhum provedor de coleta está configurado. */
export function criarFonteDeSinaisIndisponivel(): FonteDeSinais {
  return {
    observar: semMudancas,
    hoje: () => new Date(),
    tipos: nenhum,
    tipo: recusar('sinais'),
    monitoramentos: nenhum,
    monitoramentosDoTipo: nenhum,
    monitoramento: recusar('sinais'),
    salvarMonitoramento: recusar('sinais'),
    mudarEstado: recusar('sinais'),
    excluirMonitoramento: recusar('sinais'),
    sinaisEncontrados: nenhum,
    simularDisparo: recusar('sinais'),
  }
}

/** O onboarding do Workspace operacional, que chega com o cadastro do Workspace. Sem a troca da Demonstração. */
export function criarFonteDeOnboardingIndisponivel(): FonteDeOnboarding {
  const indisponivel = recusar('onboarding')
  return {
    observar: semMudancas,
    ler: indisponivel,
    iniciar: indisponivel,
    retomar: indisponivel,
    voltar: indisponivel,
    definirPapel: indisponivel,
    definirCliente: indisponivel,
    definirDominio: indisponivel,
    buscarLogo: indisponivel,
    lerSite: indisponivel,
    definirComoConheceu: indisponivel,
    pularConvite: indisponivel,
    confirmarConvite: indisponivel,
    salvarProduto: indisponivel,
    salvarPersonas: indisponivel,
    concluirProduto: indisponivel,
    concluirPersona: indisponivel,
    pularItem: indisponivel,
    registrarVisitaASinais: indisponivel,
    pedirRetornoAoChecklist: indisponivel,
    dispensarRetorno: indisponivel,
    concluirOnboarding: indisponivel,
  }
}

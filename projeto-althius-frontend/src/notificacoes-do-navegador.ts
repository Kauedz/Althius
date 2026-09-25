// A API de notificações do navegador, vista pelo aplicativo. A permissão é do navegador; a preferência de receber
// avisos é da Conta de usuário e fica na fonte. Nada aqui pede permissão sem uma ação explícita da pessoa.

/** A permissão que o navegador dá à Althius, ou a falta da API. */
export type PermissaoDoNavegador = 'nao-suportado' | 'perguntar' | 'concedida' | 'negada'

/** O que a pessoa vê em Preferências: a preferência dela combinada com a permissão do navegador. */
export type EstadoDasNotificacoes = 'desligado' | 'ativado' | 'bloqueado' | 'nao-suportado'

const suportado = () => typeof globalThis.Notification === 'function'

/** Lida a cada vez: a pessoa pode mudar a permissão nas configurações do site, no navegador. */
export function permissaoDoNavegador(): PermissaoDoNavegador {
  if (!suportado()) return 'nao-suportado'
  const permissao = Notification.permission
  return permissao === 'granted' ? 'concedida' : permissao === 'denied' ? 'negada' : 'perguntar'
}

export function estadoDasNotificacoes(preferencia: boolean, permissao: PermissaoDoNavegador): EstadoDasNotificacoes {
  if (permissao === 'nao-suportado') return 'nao-suportado'
  if (permissao === 'negada') return 'bloqueado'
  return preferencia && permissao === 'concedida' ? 'ativado' : 'desligado'
}

/** Pergunta ao navegador. Só depois de a pessoa pedir para ativar: abrir uma tela nunca pergunta. */
export async function pedirPermissaoAoNavegador(): Promise<PermissaoDoNavegador> {
  if (!suportado()) return 'nao-suportado'
  try {
    await Notification.requestPermission()
  } catch {
    // O navegador recusou perguntar (ex.: fora de um contexto seguro); vale a permissão que ele já tem.
  }
  return permissaoDoNavegador()
}

/** Mostra o aviso pelo navegador, se ele permite. Se o navegador recusar, o aviso só não aparece. */
export function mostrarNoNavegador(aviso: { id: string; titulo: string; texto: string }, aoClicar: () => void) {
  if (permissaoDoNavegador() !== 'concedida') return
  try {
    const notificacao = new Notification(aviso.titulo, { body: aviso.texto, tag: aviso.id })
    notificacao.onclick = () => {
      window.focus()
      aoClicar()
      notificacao.close()
    }
  } catch {
    // Há navegadores que só mostram notificações por um service worker; sem ele, nada a fazer.
  }
}

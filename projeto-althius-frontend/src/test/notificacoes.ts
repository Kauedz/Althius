import { vi } from 'vitest'

/** Uma notificação que o aplicativo mostrou pelo navegador dos testes. */
export interface NotificacaoMostrada {
  titulo: string
  texto: string | undefined
  /** Clica na notificação, como a pessoa faria no sistema operacional. */
  clicar: () => void
}

/**
 * Dá ao navegador dos testes a API de notificações, que o jsdom não tem: sem esta preparação, ele não suporta
 * notificações. `permissao` é a do navegador ao abrir; `resposta`, a que a pessoa dá quando o navegador pergunta.
 */
export function navegadorComNotificacoes({
  permissao = 'default',
  resposta = 'granted',
}: { permissao?: NotificationPermission; resposta?: NotificationPermission } = {}) {
  const mostradas: NotificacaoMostrada[] = []
  let falhar = false

  class NotificacaoDoNavegador {
    static permission: NotificationPermission = permissao
    static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
      NotificacaoDoNavegador.permission = resposta
      return resposta
    })

    onclick: ((evento: Event) => void) | null = null

    constructor(titulo: string, opcoes?: NotificationOptions) {
      // Há navegadores que recusam notificações criadas pela página (ex.: exigem um service worker).
      if (falhar) throw new TypeError('Illegal constructor')
      mostradas.push({ titulo, texto: opcoes?.body, clicar: () => this.onclick?.(new Event('click')) })
    }

    close() {}
  }

  vi.stubGlobal('Notification', NotificacaoDoNavegador)
  return {
    mostradas,
    /** Os pedidos de permissão que o aplicativo fez ao navegador. */
    pedidos: NotificacaoDoNavegador.requestPermission,
    falharAoMostrar: (sim: boolean) => {
      falhar = sim
    },
    /** A pessoa muda a permissão nas configurações do site, fora da Althius. */
    mudarPermissao: (nova: NotificationPermission) => {
      NotificacaoDoNavegador.permission = nova
    },
  }
}

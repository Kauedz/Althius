// O descadastro de um Envio de passo: cada e-mail da Sequência leva um link público com um token aleatório (sem ids),
// que registra a Supressão do Contato no Workspace. O rodapé vai no corpo; o List-Unsubscribe de um clique (RFC 8058)
// vai no cabeçalho, que a Unipile aceita em custom_headers (List-Unsubscribe e List-Unsubscribe-Post são permitidos).
import type { OutgoingEmail } from './send-step.ts'

/** Onde o Contato se descadastra: a página do app (confirmação em pt-BR) e o endpoint de um clique do provedor. */
export interface UnsubscribeLinks {
  page(token: string): string
  oneClick(token: string): string
}

export const RODAPE_DE_DESCADASTRO = 'Não quer mais receber estes e-mails? Descadastre-se:'

/** Os links a partir do APP_ORIGIN (a primeira origem publicada) e do SUPABASE_URL. */
export function unsubscribeLinksFrom(appOrigin: string, supabaseUrl: string): UnsubscribeLinks {
  const app = appOrigin.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)[0] ?? ''
  const fn = supabaseUrl.replace(/\/+$/, '')
  return {
    page: (token) => `${app}/descadastro?t=${encodeURIComponent(token)}`,
    oneClick: (token) => `${fn}/functions/v1/descadastro?t=${encodeURIComponent(token)}`,
  }
}

/** O e-mail com o rodapé de descadastro no fim do corpo e os cabeçalhos List-Unsubscribe. */
export function withUnsubscribe(email: OutgoingEmail, token: string, links: UnsubscribeLinks): OutgoingEmail {
  return {
    ...email,
    plain_text: `${email.plain_text.replace(/\s+$/, '')}\n\n--\n${RODAPE_DE_DESCADASTRO} ${links.page(token)}`,
    custom_headers: [
      ...email.custom_headers,
      { name: 'List-Unsubscribe', value: `<${links.oneClick(token)}>` },
      { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
    ],
  }
}

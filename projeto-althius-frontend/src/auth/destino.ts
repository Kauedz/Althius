/** A tela de acesso onde começa quem ainda não tem sessão. */
export const ROTA_DE_ENTRADA = '/entrar'

/** A tela de acesso onde o visitante cria a Conta de usuário. */
export const ROTA_DE_CADASTRO = '/cadastro'

/** Onde a Conta de usuário que esqueceu a senha pede a redefinição. */
export const ROTA_ESQUECI_A_SENHA = '/esqueci-a-senha'

/** Onde o link do e-mail de redefinição abre, para definir a nova senha. */
export const ROTA_DE_REDEFINICAO_DA_SENHA = '/redefinir-a-senha'

/**
 * Onde o link de um convite abre: `/convite/<token>`. Sem sessão, a pessoa passa pela tela de acesso, que lembra o
 * link como `destino`; com a sessão, o convite é aceito antes de abrir o Workspace.
 */
export const ROTA_DO_CONVITE = '/convite'

/** O link de um convite, nesta origem, que o Administrador copia e envia à pessoa convidada. */
export function enderecoDoConvite(token: string): string {
  return `${window.location.origin}${ROTA_DO_CONVITE}/${encodeURIComponent(token)}`
}

/**
 * O token do convite neste caminho, se ele for o link de um convite. Uma barra no fim (`/convite/<token>/`) é o mesmo
 * link; um token com escape malformado (`/convite/%`) não é convite.
 */
function tokenDoConviteNoCaminho(caminho: string): string | null {
  const [, rota, token, ...resto] = caminho.split('/')
  const semMaisNada = resto.length === 0 || (resto.length === 1 && resto[0] === '')
  if (`/${rota}` !== ROTA_DO_CONVITE || !token || !semMaisNada) return null
  try {
    return decodeURIComponent(token)
  } catch {
    return null
  }
}

/** O token do convite no endereço atual, se ele for o link de um convite. */
export function tokenDoConviteNoEndereco(): string | null {
  return tokenDoConviteNoCaminho(window.location.pathname)
}

/**
 * O token do convite que uma tela de acesso atende: o do link aberto (`/convite/<token>`) ou o lembrado como `destino`
 * (o cadastro, a entrada ou o "Esqueci a senha" abertos a partir do link do convite), para travar o e-mail convidado.
 */
export function tokenDoConviteDoAcesso({ pathname, search }: { pathname: string; search: string }): string | null {
  const destino = destinoLembrado(pathname, search)
  return tokenDoConviteNoCaminho(pathname) ?? (destino ? tokenDoConviteNoCaminho(new URL(destino, window.location.origin).pathname) : null)
}

/** As telas de acesso, que lembram o `destino` para depois do login. */
const TELAS_DE_ACESSO = [ROTA_DE_ENTRADA, ROTA_DE_CADASTRO, ROTA_ESQUECI_A_SENHA, ROTA_DE_REDEFINICAO_DA_SENHA]

/**
 * Se o caminho leva ao Workspace operacional: uma tela de acesso, inclusive o link de redefinição de senha, ou o link de
 * um convite, mesmo malformado.
 */
export function ehCaminhoDeAcesso(caminho: string): boolean {
  return TELAS_DE_ACESSO.includes(caminho) || caminho.startsWith(`${ROTA_DO_CONVITE}/`)
}

/** O endereço de /entrar que lembra o `destino` que a pessoa tentou abrir, para voltar a ele depois do login. */
export function enderecoDeEntrada(destino: string): string {
  return destino === '/' ? ROTA_DE_ENTRADA : `${ROTA_DE_ENTRADA}?${new URLSearchParams({ destino })}`
}

/**
 * O endereço a abrir depois do login: o `destino` lembrado numa tela de acesso (/entrar, /cadastro, /esqueci-a-senha ou
 * /redefinir-a-senha), se continuar nesta origem, ou o início. Fora das telas de acesso, o endereço atual já é o destino.
 */
export function destinoDepoisDoAcesso(): string | null {
  return destinoLembrado(window.location.pathname, window.location.search)
}

function destinoLembrado(pathname: string, search: string): string | null {
  if (!TELAS_DE_ACESSO.includes(pathname)) return null
  const destino = new URLSearchParams(search).get('destino')
  if (!destino?.startsWith('/')) return '/'
  // `//outro.site` e `/\outro.site` também começam com barra; só vale o que continua na mesma origem.
  const url = new URL(destino, window.location.origin)
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/'
}

/** O endereço do link de redefinição de senha, nesta origem, que mantém o `destino` lembrado. */
export function enderecoDeRedefinicao(destino: string): string {
  const busca = destino === '/' ? '' : `?${new URLSearchParams({ destino })}`
  return `${window.location.origin}${ROTA_DE_REDEFINICAO_DA_SENHA}${busca}`
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CampoDoCodigo } from '@/auth/campo-do-codigo'
import { useAutenticacao } from '@/auth/contexto'
import { CampoDeNovaSenha, TAMANHO_MINIMO_DA_SENHA } from '@/auth/nova-senha'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { mensagemDeErro } from '@/lib/utils'

type Confirmacao = 'senha' | 'codigo'

const SENHA_SALVA =
  'Senha salva. Você pode entrar com seu e-mail e esta senha; se usa o Google, ele continua funcionando. As outras sessões da sua conta foram encerradas.'
const SENHA_SALVA_COM_SESSOES_ABERTAS =
  'A senha foi trocada: você já pode entrar com seu e-mail e esta senha. Mas não foi possível encerrar as outras sessões da sua conta; saia delas no outro dispositivo, ou saia daqui e entre de novo para encerrá-las.'

/**
 * A senha da Conta de usuário, no Workspace operacional. Trocar exige confirmar que é a pessoa: com a senha atual ou
 * com um código enviado ao e-mail, o caminho de quem entrou só com Google e quer definir uma senha sem perder o Google.
 * A nova senha segue a política do cadastro (mínimo de 8 caracteres, sem senhas vazadas). A troca é feita no servidor
 * (Edge Function account-password), que confere a confirmação e a política de novo; as recusas dele chegam aqui como
 * mensagens prontas. Nada é dado como salvo antes de o servidor confirmar.
 */
export function BlocoDeSenhaDaConta() {
  const { trocarSenha, pedirCodigoDeEntrada, sessao } = useAutenticacao()
  const email = sessao?.user.email ?? ''
  // Quem entrou só com Google não tem senha atual: começa pelo código. Sem saber os métodos, começa pela senha.
  const providers = sessao?.user.app_metadata.providers as string[] | undefined
  const confirmacaoInicial: Confirmacao = providers && !providers.includes('email') ? 'codigo' : 'senha'
  const [aberto, setAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(confirmacaoInicial)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [codigo, setCodigo] = useState('')
  const [codigoEnviado, setCodigoEnviado] = useState(false)
  const [enviandoCodigo, setEnviandoCodigo] = useState(false)
  const [nova, setNova] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState<'nao' | 'sessoes-encerradas' | 'sessoes-abertas'>('nao')
  const refAbrir = useRef<HTMLButtonElement>(null)
  const refPrimeiroCampo = useRef<HTMLInputElement>(null)
  const jaAbriu = useRef(false)

  // Ao abrir, o foco vai para o primeiro campo; ao fechar, volta para o botão que abriu.
  useEffect(() => {
    if (aberto) refPrimeiroCampo.current?.focus()
    else if (jaAbriu.current) refAbrir.current?.focus()
    jaAbriu.current ||= aberto
  }, [aberto])

  function fechar() {
    setSenhaAtual('')
    setCodigo('')
    setCodigoEnviado(false)
    setNova('')
    setErro('')
    setConfirmacao(confirmacaoInicial)
    setAberto(false)
  }

  async function enviarCodigo() {
    setErro('')
    setEnviandoCodigo(true)
    try {
      // O mesmo código de "Entrar com código", para o e-mail da sessão; o link do e-mail volta a esta página.
      await pedirCodigoDeEntrada(email, window.location.pathname)
      setCodigoEnviado(true)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviandoCodigo(false)
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    if (confirmacao === 'senha' && !senhaAtual) return setErro('Informe a senha atual.')
    if (confirmacao === 'codigo' && !codigoEnviado) return setErro('Envie o código ao seu e-mail e informe-o aqui.')
    if (confirmacao === 'codigo' && codigo.length !== 6) return setErro('Informe o código de 6 dígitos enviado ao seu e-mail.')
    if (nova.length < TAMANHO_MINIMO_DA_SENHA) {
      return setErro(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`)
    }
    setSalvando(true)
    try {
      const { outrasSessoesEncerradas } = await trocarSenha(confirmacao === 'senha' ? { senhaAtual } : { codigo }, nova)
      // A senha já foi trocada: o formulário fecha, mesmo que as outras sessões não tenham caído.
      fechar()
      setConcluido(outrasSessoesEncerradas ? 'sessoes-encerradas' : 'sessoes-abertas')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section aria-labelledby="titulo-senha" className="flex flex-col gap-5 border-t border-al-line pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 id="titulo-senha" className="titulo-secao text-lg">
            Senha
          </h3>
          <p className="text-sm text-al-muted">
            Sua senha atual nunca é exibida. Entrou só com o Google? Defina uma senha confirmando por código; o Google
            continua funcionando.
          </p>
        </div>
        {!aberto && (
          <Button
            ref={refAbrir}
            type="button"
            variant="outline"
            onClick={() => {
              setConcluido('nao')
              setAberto(true)
            }}
          >
            Alterar ou definir senha
          </Button>
        )}
      </div>

      {aberto && (
        <form aria-label="Alterar senha" noValidate onSubmit={salvar} className="flex max-w-md flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="rotulo mb-2">Como confirmar que é você</legend>
            {(
              [
                ['senha', 'Com a senha atual'],
                ['codigo', 'Com um código por e-mail'],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="confirmacao-da-senha"
                  value={valor}
                  checked={confirmacao === valor}
                  onChange={() => {
                    setConfirmacao(valor)
                    setErro('')
                  }}
                />
                {rotulo}
              </label>
            ))}
          </fieldset>

          {confirmacao === 'senha' ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <label htmlFor="senha-atual">Senha atual</label>
              <input
                ref={refPrimeiroCampo}
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className="campo h-10 bg-al-bg px-3 text-al-ink"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" disabled={enviandoCodigo} onClick={() => void enviarCodigo()}>
                  {codigoEnviado ? 'Enviar outro código' : 'Enviar código'}
                </Button>
                <Mensagem tipo="info">
                  {enviandoCodigo ? 'Enviando o código…' : codigoEnviado ? `Enviamos um código para ${email}.` : null}
                </Mensagem>
              </div>
              {codigoEnviado && <CampoDoCodigo id="codigo-da-senha" rotulo="Código" codigo={codigo} aoMudar={setCodigo} />}
            </div>
          )}

          <CampoDeNovaSenha id="nova-senha-da-conta" rotulo="Nova senha" senha={nova} aoMudar={setNova} />

          {erro && (
            <p role="alert" className="text-sm text-al-erro">
              {erro}
            </p>
          )}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={salvando} className="px-6">
              {salvando ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
            <Button type="button" variant="ghost" disabled={salvando} onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <Mensagem tipo={concluido === 'sessoes-abertas' ? 'info' : 'sucesso'}>
        {concluido === 'sessoes-encerradas' ? SENHA_SALVA : concluido === 'sessoes-abertas' ? SENHA_SALVA_COM_SESSOES_ABERTAS : null}
      </Mensagem>
    </section>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

const CAMPOS = [
  { campo: 'atual', rotulo: 'Senha atual' },
  { campo: 'nova', rotulo: 'Nova senha' },
  { campo: 'confirmacao', rotulo: 'Confirmar nova senha' },
] as const

type Campo = (typeof CAMPOS)[number]['campo']
type Valores = Record<Campo, string>
type Erros = Partial<Record<Campo, string>>

const VAZIO: Valores = { atual: '', nova: '', confirmacao: '' }

function validar({ atual, nova, confirmacao }: Valores): Erros {
  return {
    atual: atual ? undefined : 'Informe a senha atual.',
    nova: nova ? undefined : 'Informe a nova senha.',
    confirmacao: !confirmacao
      ? 'Repita a nova senha.'
      : confirmacao !== nova
        ? 'A confirmação não é igual à nova senha.'
        : undefined,
  }
}

/**
 * Alteração de senha demonstrativa: valida o formulário e termina limpo, sem guardar, registrar
 * nem enviar o que foi digitado. Não existe credencial real para trocar nem senha atual para conferir.
 */
export function BlocoSenha() {
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState<Valores>(VAZIO)
  const [erros, setErros] = useState<Erros>({})
  const [concluido, setConcluido] = useState(false)
  const entradas = useRef<Partial<Record<Campo, HTMLInputElement | null>>>({})
  const refAbrir = useRef<HTMLButtonElement>(null)
  const jaAbriu = useRef(false)

  // Ao abrir, o foco vai para o primeiro campo; ao fechar, volta para o botão que abriu.
  useEffect(() => {
    if (aberto) entradas.current.atual?.focus()
    else if (jaAbriu.current) refAbrir.current?.focus()
    jaAbriu.current ||= aberto
  }, [aberto])

  function fechar() {
    setValores(VAZIO)
    setErros({})
    setAberto(false)
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    const novosErros = validar(valores)
    setErros(novosErros)
    const primeiroComErro = CAMPOS.find(({ campo }) => novosErros[campo])
    if (primeiroComErro) {
      entradas.current[primeiroComErro.campo]?.focus()
      return
    }
    // Nada é guardado, registrado nem enviado: os valores só existiram no formulário até aqui.
    fechar()
    setConcluido(true)
  }

  return (
    <section aria-labelledby="titulo-senha" className="flex flex-col gap-5 border-t border-al-line pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 id="titulo-senha" className="titulo-secao text-lg">
            Senha
          </h3>
          <p className="text-sm text-al-muted">Sua senha atual nunca é exibida.</p>
        </div>
        {!aberto && (
          <Button
            ref={refAbrir}
            type="button"
            variant="outline"
            onClick={() => {
              setConcluido(false)
              setAberto(true)
            }}
          >
            Alterar senha
          </Button>
        )}
      </div>

      {aberto && (
        <form aria-label="Alterar senha" noValidate onSubmit={enviar} className="flex max-w-sm flex-col gap-5">
          {CAMPOS.map(({ campo, rotulo }) => {
            const id = `senha-${campo}`
            const erro = erros[campo]
            return (
              <div key={campo} className="flex flex-col gap-2">
                <label htmlFor={id} className="rotulo">
                  {rotulo}
                </label>
                <input
                  ref={(elemento) => {
                    entradas.current[campo] = elemento
                  }}
                  id={id}
                  type="password"
                  // "new-password" também na senha atual: os navegadores ignoram "off" em campos de senha
                  // e preencheriam a senha salva. O formulário começa sempre vazio.
                  autoComplete="new-password"
                  value={valores[campo]}
                  onChange={(e) => {
                    const valor = e.target.value
                    setValores((anteriores) => ({ ...anteriores, [campo]: valor }))
                    setErros((anteriores) => ({ ...anteriores, [campo]: undefined }))
                  }}
                  aria-invalid={Boolean(erro)}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                  className="campo"
                />
                {erro && (
                  <p id={`${id}-erro`} role="alert" className="text-sm text-al-erro">
                    {erro}
                  </p>
                )}
              </div>
            )
          })}
          <div className="flex items-center gap-4">
            <Button type="submit" className="px-6 tracking-rotulo uppercase">
              Alterar senha
            </Button>
            <Button type="button" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <p role="status" className={concluido ? 'flex items-start gap-2 border-l-2 border-al-line py-1 pl-3 text-sm text-al-muted' : 'sr-only'}>
        {concluido && (
          <>
            <Info strokeWidth={1.8} className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Demonstração: nenhuma senha foi alterada e a senha atual não foi conferida. Os campos foram limpos e nada do
              que você digitou foi guardado.
            </span>
          </>
        )}
      </p>
    </section>
  )
}

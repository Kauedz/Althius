import { RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Quando muda (ex.: o endereço), o aviso some e a tela é desenhada de novo, sem remontar a tela que não quebrou. */
  chaveDeReinicio?: string
}

interface Estado {
  erro: Error | null
  chave?: string
}

/**
 * Segura um erro ao desenhar uma tela: no lugar dela aparece um aviso com "Tentar de novo", e a casca do app (barra
 * lateral, cabeçalho) continua de pé. Sem isso, um erro em qualquer página deixa o app inteiro em branco.
 */
export class LimiteDeErro extends Component<Props, Estado> {
  state: Estado = { erro: null, chave: this.props.chaveDeReinicio }

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro }
  }

  static getDerivedStateFromProps(props: Props, estado: Estado): Partial<Estado> | null {
    if (props.chaveDeReinicio === estado.chave) return null
    return { erro: null, chave: props.chaveDeReinicio }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro ao desenhar a tela', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="p-6">
        <div role="alert" className="rounded-2xl flex max-w-2xl flex-col items-start gap-2 border border-dashed border-al-line px-5 py-4">
          <p className="text-al-ink">Esta tela não abriu por um erro. O resto do Althius segue funcionando.</p>
          <p className="text-sm text-al-muted">Tente de novo. Se continuar, avise a equipe Althius.</p>
          <button
            type="button"
            onClick={() => this.setState({ erro: null })}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-al-line px-3 py-1.5 text-sm text-al-ink hover:bg-al-surface"
          >
            <RefreshCw className="size-4" aria-hidden />
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
}

import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Carregando } from '@/components/marca'
import { useDados, useFonte } from '@/fonte/contexto'
import { avisosQueRecebe } from '@/fonte/regras-avisos'
import type { Papel } from '@/fonte/tipos'
import { cn, mensagemDeErro } from '@/lib/utils'
import {
  estadoDasNotificacoes,
  pedirPermissaoAoNavegador,
  permissaoDoNavegador,
  type EstadoDasNotificacoes,
} from '@/notificacoes-do-navegador'
import { useTema, type Tema } from '@/tema'
import { Bloco, Mensagem } from './componentes'

/** Preferências pessoais: o tema e as notificações do navegador. Valem só para a Conta de usuário da sessão. */
export function SecaoPreferencias() {
  const { tema, escolher } = useTema()

  return (
    <section aria-labelledby="titulo-preferencias" className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="titulo-preferencias" className="titulo-secao text-3xl">
            Preferências
          </h2>
          <span className="selo">Só você</span>
        </div>
        <p className="text-al-muted">Preferências pessoais, valem só para a sua Conta de usuário.</p>
      </div>

      <div className="flex items-center justify-between gap-6 border-t border-al-line pt-6">
        <div className="flex flex-col gap-1">
          <span className="font-normal">Tema</span>
          <span className="text-sm text-al-muted">A escolha é gravada no navegador e volta na abertura seguinte.</span>
        </div>
        <SeletorDeTema tema={tema} onMudar={escolher} />
      </div>

      <NotificacoesDoNavegador />
    </section>
  )
}

const DESCRICAO_DO_ESTADO: Record<EstadoDasNotificacoes, { rotulo: string; texto: string }> = {
  desligado: {
    rotulo: 'Desligadas',
    texto: 'Você não recebe avisos do navegador. Ao ativar, o navegador pode pedir sua permissão.',
  },
  ativado: { rotulo: 'Ativadas', texto: 'Você recebe avisos do navegador enquanto a Althius estiver aberta.' },
  bloqueado: {
    rotulo: 'Bloqueadas pelo navegador',
    texto: 'O navegador bloqueou as notificações da Althius. Libere nas configurações do site, no navegador, e tente de novo.',
  },
  'nao-suportado': {
    rotulo: 'Não suportadas',
    texto: 'Este navegador não oferece notificações. Os avisos continuam nas telas de Aprovações e de Atividade.',
  },
}

const SEM_RESPOSTA_DO_NAVEGADOR = 'O navegador não concedeu a permissão. As notificações continuam desligadas.'
const DESATIVADAS = 'Avisos desligados. A permissão do navegador continua como estava; só a Althius deixa de avisar.'

/**
 * A preferência da pessoa, gravada na fonte, e a permissão do navegador são coisas separadas: as notificações só
 * ficam ativadas com as duas. A permissão só é pedida quando a pessoa ativa; desativar não a revoga.
 */
function NotificacoesDoNavegador() {
  const fonte = useFonte()
  const preferencias = useDados((f) => f.preferencias(), [])
  const workspace = useDados((f) => f.workspace(), [])
  const [permissao, setPermissao] = useState(permissaoDoNavegador)
  const [perguntando, setPerguntando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'info' | 'erro'; texto: string } | null>(null)
  const estado = estadoDasNotificacoes(preferencias?.notificacoesDoNavegador ?? false, permissao)
  const { rotulo, texto } = DESCRICAO_DO_ESTADO[estado]
  const ativado = estado === 'ativado'

  // A pessoa pode mudar a permissão nas configurações do site: ao voltar para a aba, a tela lê de novo.
  useEffect(() => {
    const reler = () => setPermissao(permissaoDoNavegador())
    window.addEventListener('focus', reler)
    return () => window.removeEventListener('focus', reler)
  }, [])

  async function salvar(notificacoesDoNavegador: boolean, sucesso?: string) {
    try {
      await fonte.salvarPreferencias({ notificacoesDoNavegador })
      if (sucesso) setResultado({ tipo: 'info', texto: sucesso })
    } catch (erro) {
      setResultado({ tipo: 'erro', texto: mensagemDeErro(erro) })
    }
  }

  async function ativar() {
    setResultado(null)
    const atual = permissaoDoNavegador()
    setPermissao(atual)
    if (atual === 'negada') {
      setResultado({
        tipo: 'info',
        texto: 'O navegador ainda bloqueia as notificações. Libere a Althius nas configurações do site e ative de novo.',
      })
      return
    }
    setPerguntando(atual === 'perguntar')
    const resposta = atual === 'concedida' ? atual : await pedirPermissaoAoNavegador()
    setPerguntando(false)
    setPermissao(resposta)
    if (resposta === 'concedida') await salvar(true)
    else if (resposta === 'perguntar') setResultado({ tipo: 'info', texto: SEM_RESPOSTA_DO_NAVEGADOR })
  }

  function desativar() {
    setResultado(null)
    return salvar(false, DESATIVADAS)
  }

  const Icone = ativado ? Bell : BellOff
  return (
    <Bloco
      titulo="Notificações do navegador"
      descricao="Avisos da Althius fora da aba em que você está. Só funcionam com a Althius aberta."
    >
      {/* Até a preferência carregar, o interruptor não aparece: não mostra desligado quem já ativou. */}
      {!preferencias ? (
        <Carregando />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 border border-al-line p-4">
            <Icone
              strokeWidth={1.8}
              className={cn('size-5', ativado ? 'text-al-accent' : 'text-al-muted')}
              aria-hidden
            />
            <div className="flex flex-1 flex-col">
              <label htmlFor="ativar-notificacoes" className="font-normal">
                Ativar notificações do navegador
              </label>
              <span
                className={cn(
                  'rotulo text-[0.625rem]',
                  ativado && 'text-al-sucesso',
                  estado === 'bloqueado' && 'text-al-atencao',
                )}
              >
                {rotulo}
              </span>
            </div>
            <Switch
              id="ativar-notificacoes"
              checked={ativado}
              disabled={estado === 'nao-suportado' || perguntando}
              onCheckedChange={(ligar) => (ligar ? ativar() : desativar())}
            />
          </div>
          <Mensagem tipo={estado === 'bloqueado' ? 'erro' : 'info'}>{texto}</Mensagem>
          {resultado && <Mensagem tipo={resultado.tipo}>{resultado.texto}</Mensagem>}
          {ativado && <AvisosQueVoceRecebe papel={workspace?.papel ?? null} />}
        </div>
      )}
    </Bloco>
  )
}

/** Os avisos da sessão, pelo papel, pelas mesmas regras que a fonte usa para escolher os destinatários. */
function AvisosQueVoceRecebe({ papel }: { papel: Papel | null }) {
  return (
    <div className="flex flex-col gap-3">
      <span id="avisos-que-voce-recebe" className="rotulo">
        Avisos que você recebe
      </span>
      <ul aria-labelledby="avisos-que-voce-recebe" className="flex flex-col gap-1.5 text-sm">
        {avisosQueRecebe(papel).map((aviso) => (
          <li key={aviso} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-al-accent" aria-hidden />
            {aviso}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SeletorDeTema({ tema, onMudar }: { tema: Tema; onMudar: (tema: Tema) => void }) {
  const opcoes: { valor: Tema; rotulo: string }[] = [
    { valor: 'escuro', rotulo: 'Escuro' },
    { valor: 'claro', rotulo: 'Claro' },
  ]
  return (
    <div role="radiogroup" aria-label="Tema" className="flex">
      {opcoes.map((opcao) => (
        <label
          key={opcao.valor}
          className="cursor-pointer border border-al-line px-4 py-2 text-sm has-[:checked]:border-al-ink has-[:checked]:bg-al-ink has-[:checked]:text-al-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-al-accent"
        >
          <input
            type="radio"
            name="tema"
            className="sr-only"
            value={opcao.valor}
            checked={tema === opcao.valor}
            onChange={() => onMudar(opcao.valor)}
          />
          {opcao.rotulo}
        </label>
      ))}
    </div>
  )
}

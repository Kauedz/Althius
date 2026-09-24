import { Bell, BellOff, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { AcaoDoMockup, Bloco, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CabecalhoDaSecao, Mensagem } from '../componentes'
import { useMockup, type EstadoDasNotificacoes, type Tema } from '../estado'

export function SecaoPreferencias() {
  return (
    <>
      <CabecalhoDaSecao titulo="Preferências" alcance="pessoal" descricao="Como a Althius se comporta para você. Não muda nada para as outras pessoas do Workspace." />
      <EscolhaDeTema />
      <Notificacoes />
    </>
  )
}

const TEMAS: { id: Tema; nome: string; icone: typeof Sun }[] = [
  { id: 'escuro', nome: 'Escuro', icone: Moon },
  { id: 'claro', nome: 'Claro', icone: Sun },
]

function EscolhaDeTema() {
  const { tema, mudarTema } = useMockup()
  return (
    <Bloco titulo="Tema" descricao="Sua escolha continua valendo quando você recarregar a página.">
      <div role="radiogroup" aria-label="Tema" className="grid max-w-md grid-cols-2 gap-4">
        {TEMAS.map(({ id, nome, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={tema === id}
            onClick={() => mudarTema(id)}
            className={cn(
              'flex flex-col gap-3 border p-3 text-left transition-colors',
              tema === id ? 'border-al-accent' : 'border-al-line hover:border-al-muted',
            )}
          >
            <MiniaturaDoTema tema={id} />
            <span className="flex items-center gap-2 text-sm font-normal">
              <Icone strokeWidth={1.8} className="size-4" aria-hidden />
              {nome}
            </span>
          </button>
        ))}
      </div>
    </Bloco>
  )
}

/** Um desenho da casca em cada tema, com as cores do manual. */
function MiniaturaDoTema({ tema }: { tema: Tema }) {
  const escuro = tema === 'escuro'
  return (
    <span aria-hidden className={cn('grid h-20 grid-cols-[30%_1fr] border', escuro ? 'border-[#353535] bg-[#131313]' : 'border-[#c1c1c1] bg-[#f4f4f4]')}>
      <span className={cn('flex flex-col gap-1.5 border-r p-2', escuro ? 'border-[#353535]' : 'border-[#c1c1c1]')}>
        <span className="h-1.5 w-8 bg-al-accent" />
        <span className={cn('h-1 w-10', escuro ? 'bg-[#353535]' : 'bg-[#c1c1c1]')} />
        <span className={cn('h-1 w-7', escuro ? 'bg-[#353535]' : 'bg-[#c1c1c1]')} />
      </span>
      <span className="flex flex-col gap-2 p-2">
        <span className={cn('h-2 w-16', escuro ? 'bg-[#f4f4f4]' : 'bg-[#131313]')} />
        <span className={cn('h-8 rounded-md', escuro ? 'bg-[#212121]' : 'bg-white')} />
      </span>
    </span>
  )
}

const DESCRICAO_DO_ESTADO: Record<EstadoDasNotificacoes, { rotulo: string; texto: string }> = {
  desligado: { rotulo: 'Desligadas', texto: 'Você não recebe avisos do navegador. Ao ativar, o navegador pede sua permissão.' },
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

function Notificacoes() {
  const { estadoDasNotificacoes, notificacoes, ligarNotificacoes, simularNavegador, ehAdministrador, avisar } = useMockup()
  const [pedindo, setPedindo] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const { rotulo, texto } = DESCRICAO_DO_ESTADO[estadoDasNotificacoes]
  const ativado = estadoDasNotificacoes === 'ativado'

  function alternar(ligar: boolean) {
    setResultado(null)
    if (!ligar) {
      ligarNotificacoes(false)
      setResultado('Avisos desligados. A permissão do navegador continua como estava; só a Althius deixa de avisar.')
      return
    }
    if (notificacoes.navegador === 'negada') {
      setResultado('O navegador ainda bloqueia as notificações. Libere a Althius nas configurações do site e ative de novo.')
      return
    }
    if (notificacoes.navegador === 'perguntar') {
      setPedindo(true)
      return
    }
    ligarNotificacoes(true)
  }

  function responderAoNavegador(permitir: boolean) {
    setPedindo(false)
    simularNavegador(permitir ? 'concedida' : 'negada')
    ligarNotificacoes(permitir)
  }

  const eventos = [
    ...(ehAdministrador ? ['Revisão do ICP ou das Personas aguardando sua decisão em Aprovações'] : []),
    'Resultado das revisões que você pediu: aprovada ou recusada',
    'Falha na execução de um Agente que precisa de atenção',
  ]

  return (
    <Bloco titulo="Notificações do navegador" descricao="Avisos da Althius fora da aba em que você está. Só funcionam com a Althius aberta.">
      <div className="flex max-w-2xl flex-col gap-4">
        <div className="flex items-center gap-4 border border-al-line p-4">
          {ativado ? (
            <Bell strokeWidth={1.8} className="size-5 text-al-accent" aria-hidden />
          ) : (
            <BellOff strokeWidth={1.8} className="size-5 text-al-muted" aria-hidden />
          )}
          <div className="flex flex-1 flex-col">
            <label htmlFor="ativar-notificacoes" className="font-normal">
              Ativar notificações do navegador
            </label>
            <span className={cn('rotulo text-[0.625rem]', ativado && 'text-al-sucesso', estadoDasNotificacoes === 'bloqueado' && 'text-al-atencao')}>
              {rotulo}
            </span>
          </div>
          <Switch
            id="ativar-notificacoes"
            checked={ativado}
            disabled={estadoDasNotificacoes === 'nao-suportado'}
            onCheckedChange={alternar}
          />
        </div>
        <Mensagem tipo={estadoDasNotificacoes === 'bloqueado' ? 'erro' : 'info'}>{texto}</Mensagem>
        {resultado && <Mensagem tipo="info">{resultado}</Mensagem>}

        {ativado && (
          <div className="flex flex-col gap-3">
            <span className="rotulo">Avisos que você recebe</span>
            <ul className="flex flex-col gap-1.5 text-sm">
              {eventos.map((evento) => (
                <li key={evento} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-al-accent" aria-hidden />
                  {evento}
                </li>
              ))}
            </ul>
            <div className="self-start">
              <AcaoDoMockup aoClicar={() => avisar('Falha na execução do Rhetor', 'A Sequência “Enterprise LATAM” não enviou 3 e-mails. Veja na Atividade.')}>
                Simular um aviso
              </AcaoDoMockup>
            </div>
          </div>
        )}
      </div>

      <Dialog open={pedindo} onOpenChange={(aberto) => !aberto && setPedindo(false)}>
        <DialogContent showCloseButton={false} className="gap-5 p-6">
          <span className="selo self-start border-dashed">Simulação do navegador</span>
          <DialogTitle className="text-base font-normal">localhost quer mostrar notificações</DialogTitle>
          <DialogDescription className="text-al-muted">
            No aplicativo, este pedido é do próprio navegador e só aparece depois que você ativa a opção.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => responderAoNavegador(false)} className={BOTAO_SECUNDARIO}>
              Bloquear
            </button>
            <button type="button" onClick={() => responderAoNavegador(true)} className={BOTAO_PRIMARIO}>
              Permitir
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Bloco>
  )
}

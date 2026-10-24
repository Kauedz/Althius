import { Plug } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LogoDaIntegracao, LogoDoCanal, nomeDaIntegracao } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useAmbiente, useDados, useFonte, useFonteDeConexoes } from '@/fonte/contexto'
import type { Aprovacao, CanalId, CategoriaDeIntegracao, IntegracaoId } from '@/fonte/tipos'
import {
  type AcessoDaIntegracao,
  type CanalDeConexao,
  type FerramentaDaIntegracao,
  type IntegracaoDeConexao,
  type RegraDaFerramenta,
  regraDaFerramenta,
} from '@/fonte/conexoes-tipos'
import { idaAoApp } from '@/paginas/ida-ao-app'

/** O que a volta da autorização (`?conexao=erro&motivo=…`, da Edge Function integration-callback) quer dizer. */
const MOTIVOS_DA_VOLTA: Record<string, (nome: string) => string> = {
  recusada: (nome) => `Você não autorizou o acesso no ${nome}. Nada foi conectado.`,
  expirada: () => 'A autorização demorou demais e venceu. Comece de novo.',
  usada: () => 'Esta autorização já foi usada. Comece de novo se precisar.',
  invalida: () => 'Esta volta da autorização não é válida. Comece de novo pela Althius.',
  participacao_inativa: () => 'Sua Participação neste Workspace não está ativa.',
  nao_habilitada: (nome) => `O ${nome} não está habilitado neste Workspace.`,
  portal_diferente: (nome) => `Esta conta é de outro portal do ${nome}. O Workspace já usa um portal; fale com um Administrador.`,
  portal_nao_identificado: (nome) => `Não foi possível identificar o portal desta conta do ${nome}. Tente de novo.`,
  falha_na_troca: (nome) => `O ${nome} não concluiu a autorização. Tente de novo em instantes.`,
  indisponivel: (nome) => `Não foi possível falar com o ${nome} agora. Tente de novo em instantes.`,
}

/** As recusas próprias da instalação do Canal Slack (`?canal=slack`, da Edge Function slack-channel-callback). */
const MOTIVOS_DA_VOLTA_DO_SLACK: Record<string, string> = {
  slack_diferente: 'Este Workspace já usa outro Slack. Conecte de novo o mesmo Slack da primeira instalação.',
  slack_de_outro_workspace: 'Este Slack já está ligado a outro Workspace da Althius e não pode ser usado aqui.',
  nao_administrador: 'Só um Administrador do Workspace conecta o Slack.',
}

function avisoDaVolta(parametros: URLSearchParams): { texto: string; ok: boolean } | null {
  const resultado = parametros.get('conexao')
  if (resultado !== 'ok' && resultado !== 'erro') return null
  if (parametros.get('canal') === 'slack') {
    if (resultado === 'ok') return { texto: 'Slack conectado.', ok: true }
    const motivo = parametros.get('motivo') ?? ''
    const texto = MOTIVOS_DA_VOLTA_DO_SLACK[motivo] ?? MOTIVOS_DA_VOLTA[motivo]?.('Slack')
    return { texto: texto ?? 'Não foi possível conectar o Slack. Tente de novo.', ok: false }
  }
  const id = parametros.get('integracao') as IntegracaoId | null
  const nome = id ? nomeDaIntegracao(id) ?? id : 'app'
  if (resultado === 'ok') return { texto: `${nome} conectado.`, ok: true }
  const motivo = MOTIVOS_DA_VOLTA[parametros.get('motivo') ?? '']
  return { texto: motivo ? motivo(nome) : `Não foi possível conectar o ${nome}. Tente de novo.`, ok: false }
}

const CATEGORIAS: CategoriaDeIntegracao[] = ['CRM', 'Enriquecimento', 'Conhecimento', 'Mídia paga', 'Agenda', 'Comunicação', 'Automação']

export function PaginaConexoes() {
  const { modo } = useAmbiente()
  const fonteDeConexoes = useFonteDeConexoes()
  const workspace = useDados((fonte) => fonte.workspace(), [])
  const ehAdministrador = modo === 'demonstracao' || workspace?.papel === 'administrador'

  const canais = useDados(fonteDeConexoes, (fonte) => fonte.canais(), [])
  const integracoes = useDados(fonteDeConexoes, (fonte) => fonte.integracoes(), [])
  const futuras = useDados(fonteDeConexoes, (fonte) => fonte.integracoesFuturas(), [])
  // Sem a leitura dos Acessos (ou se ela falhar), o cartão fica só com a habilitação, como antes.
  const acessos = useDados(
    fonteDeConexoes,
    (fonte) => (fonte.acessos ? fonte.acessos().catch(() => []) : Promise.resolve([])),
    [],
  )

  const [conectando, setConectando] = useState<{ id: CanalId | IntegracaoId; nome: string } | null>(null)
  const [previa, setPrevia] = useState<CanalId | null>(null)
  const [habilitando, setHabilitando] = useState<IntegracaoId | null>(null)
  const [erro, setErro] = useState('')
  // O que deu certo pela metade: desconectou na Althius, mas o app não confirmou a revogação do token.
  const [aviso, setAviso] = useState('')
  const [desabilitando, setDesabilitando] = useState<IntegracaoDeConexao | null>(null)
  const [erroAoDesabilitar, setErroAoDesabilitar] = useState('')
  const [parametros, setParametros] = useSearchParams()
  const [volta] = useState(() => avisoDaVolta(parametros))
  // O resultado da autorização é lido uma vez e sai do endereço, para não reaparecer ao recarregar.
  useEffect(() => {
    if (parametros.has('conexao')) setParametros({}, { replace: true })
  }, [parametros, setParametros])
  const [comChave, setComChave] = useState<IntegracaoDeConexao | null>(null)
  const [vendoFerramentas, setVendoFerramentas] = useState<IntegracaoDeConexao | null>(null)
  const [trabalhando, setTrabalhando] = useState<IntegracaoId | null>(null)
  const [instalandoCanal, setInstalandoCanal] = useState<CanalId | null>(null)
  const [retirandoCanal, setRetirandoCanal] = useState<CanalDeConexao | null>(null)

  async function instalarCanal(canal: CanalDeConexao) {
    if (!fonteDeConexoes.instalarCanal) return
    setErro('')
    setInstalandoCanal(canal.id)
    try {
      idaAoApp.ir(await fonteDeConexoes.instalarCanal(canal.id))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : `Não foi possível abrir a instalação do ${canal.nome} agora.`)
    } finally {
      setInstalandoCanal(null)
    }
  }

  async function autorizar(integracao: IntegracaoDeConexao) {
    if (!fonteDeConexoes.conectarPorAutorizacao) return
    setErro('')
    setTrabalhando(integracao.id)
    try {
      idaAoApp.ir(await fonteDeConexoes.conectarPorAutorizacao(integracao.id))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível abrir a autorização agora.')
    } finally {
      setTrabalhando(null)
    }
  }

  async function desconectar(integracao: IntegracaoDeConexao) {
    if (!fonteDeConexoes.desconectarAcesso) return
    setErro('')
    setAviso('')
    setTrabalhando(integracao.id)
    try {
      const { revogacaoFalhou } = await fonteDeConexoes.desconectarAcesso(integracao.id)
      if (revogacaoFalhou) {
        setAviso(
          `Desconectado da Althius, mas a Althius não conseguiu avisar o ${integracao.nome}. Para garantir, remova a autorização da Althius nas configurações do ${integracao.nome}.`,
        )
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível desconectar agora.')
    } finally {
      setTrabalhando(null)
    }
  }

  async function desabilitar() {
    if (!desabilitando || !fonteDeConexoes.desabilitarIntegracao) return
    setErroAoDesabilitar('')
    setTrabalhando(desabilitando.id)
    try {
      await fonteDeConexoes.desabilitarIntegracao(desabilitando.id)
      setDesabilitando(null)
    } catch (falha) {
      setErroAoDesabilitar(falha instanceof Error ? falha.message : 'Não foi possível desabilitar a Integração agora.')
    } finally {
      setTrabalhando(null)
    }
  }

  function pedirDesabilitacao(integracao: IntegracaoDeConexao) {
    setErroAoDesabilitar('')
    setDesabilitando(integracao)
  }

  async function habilitar(id: IntegracaoId) {
    setErro('')
    setHabilitando(id)
    try {
      await fonteDeConexoes.habilitarIntegracao(id)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível habilitar a Integração agora.')
    } finally {
      setHabilitando(null)
    }
  }

  return (
    <Pagina titulo="Conexões" icone={Plug} className="gap-16">
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-lg text-al-muted">
          Conecte cada ferramenta uma vez para o Workspace. Depois, escolha em cada agente o que ele pode usar.
        </p>
        {volta && (
          <p role="status" className={volta.ok ? 'text-sm text-al-sucesso' : 'text-sm text-al-erro'}>
            {volta.texto}
          </p>
        )}
        {erro && <p className="text-sm text-al-erro">{erro}</p>}
        {aviso && (
          <p role="status" className="text-sm text-al-atencao">
            {aviso}
          </p>
        )}
      </div>

      <section aria-label="Canais" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="titulo-secao text-3xl">Canais</h2>
          <p className="text-al-muted">Onde sua equipe conversa com os agentes fora da Althius.</p>
        </div>
        {!canais ? (
          <Carregando />
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {canais.map((canal) =>
              modo === 'real' && canal.estado !== 'em_breve' ? (
                <CartaoDeCanalReal
                  key={canal.id}
                  canal={canal}
                  ehAdministrador={ehAdministrador}
                  instalando={instalandoCanal === canal.id}
                  aoInstalar={() => instalarCanal(canal)}
                  aoRetirar={() => setRetirandoCanal(canal)}
                />
              ) : modo === 'real' || canal.estado === 'em_breve' ? (
                <article
                  key={canal.id}
                  aria-label={canal.nome}
                  className="rounded-2xl flex flex-col gap-2 border border-dashed border-al-line p-6 text-al-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-normal text-al-ink">
                      <LogoDoCanal id={canal.id} className="size-5" />
                      {canal.nome}
                    </span>
                    <span className="rotulo">Em breve</span>
                  </div>
                  <p className="text-sm text-al-muted">{canal.descricao}</p>
                </article>
              ) : (
                <CartaoDeConexaoDemo
                  key={canal.id}
                  nome={canal.nome}
                  descricao={canal.descricao}
                  conectado={canal.conectado}
                  aoConectar={() => setConectando(canal)}
                  extra={
                    canal.conectado && (
                      <Button variant="outline" onClick={() => setPrevia(canal.id)} className="px-4">
                        Ver prévia
                      </Button>
                    )
                  }
                />
              ),
            )}
          </div>
        )}
      </section>

      <section aria-label="Integrações" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="titulo-secao text-3xl">Integrações</h2>
          <p className="text-al-muted">De onde os agentes leem dados e para onde escrevem.</p>
        </div>
        {!integracoes || !futuras ? (
          <Carregando />
        ) : (
          // Uma categoria sem nenhuma Integração (nem "Em breve") não aparece, para o catálogo não mostrar título vazio.
          CATEGORIAS.filter(
            (categoria) => integracoes.some((i) => i.categoria === categoria) || futuras.some((i) => i.categoria === categoria),
          ).map((categoria) => (
            <div key={categoria} className="flex flex-col gap-4">
              <h3 className="rotulo">{categoria}</h3>
              <div className="grid grid-cols-4 gap-6">
                {integracoes
                  .filter((i) => i.categoria === categoria)
                  .map((integracao) =>
                    modo === 'real' ? (
                      <CartaoDeIntegracaoReal
                        key={integracao.id}
                        integracao={integracao}
                        ehAdministrador={ehAdministrador}
                        habilitando={habilitando === integracao.id}
                        aoHabilitar={() => habilitar(integracao.id)}
                        aoDesabilitar={fonteDeConexoes.desabilitarIntegracao ? () => pedirDesabilitacao(integracao) : undefined}
                        acesso={acessos?.find((a) => a.integracaoId === integracao.id)}
                        trabalhando={trabalhando === integracao.id}
                        aoAutorizar={() => autorizar(integracao)}
                        aoUsarChave={() => setComChave(integracao)}
                        aoDesconectar={() => desconectar(integracao)}
                        aoVerFerramentas={() => setVendoFerramentas(integracao)}
                      />
                    ) : (
                      <CartaoDeConexaoDemo
                        key={integracao.id}
                        nome={integracao.nome}
                        logo={<LogoDaIntegracao id={integracao.id} nome={integracao.nome} className="size-6" />}
                        descricao={integracao.descricao}
                        conectado={integracao.habilitada}
                        aoConectar={() => setConectando(integracao)}
                        extra={
                          integracao.habilitada && (
                            <>
                              {fonteDeConexoes.ferramentas && (
                                <Button variant="outline" onClick={() => setVendoFerramentas(integracao)} className="px-4">
                                  Ver ferramentas
                                </Button>
                              )}
                              {ehAdministrador && fonteDeConexoes.desabilitarIntegracao && (
                                <Button variant="ghost" onClick={() => pedirDesabilitacao(integracao)} className="px-4">
                                  Desabilitar
                                </Button>
                              )}
                            </>
                          )
                        }
                      />
                    ),
                  )}
                {futuras
                  .filter((i) => i.categoria === categoria)
                  .map((futura) => (
                    <article
                      key={futura.nome}
                      aria-label={futura.nome}
                      className="rounded-2xl flex flex-col gap-2 border border-dashed border-al-line p-6 text-al-muted"
                    >
                      <span className="font-normal">{futura.nome}</span>
                      <span className="rotulo">Em breve</span>
                    </article>
                  ))}
              </div>
            </div>
          ))
        )}
      </section>

      <Dialog open={desabilitando !== null} onOpenChange={(aberto) => !aberto && !trabalhando && setDesabilitando(null)}>
        <DialogContent className="gap-6 p-6">
          <DialogTitle className="titulo-secao text-2xl">Desabilitar {desabilitando?.nome}</DialogTitle>
          <DialogDescription className="text-al-muted">
            Desabilitar esta Integração desconecta todos os participantes do Workspace e cancela as autorizações pendentes.
            Para voltar a usar, será preciso habilitar e conectar os Acessos novamente.
          </DialogDescription>
          {erroAoDesabilitar && <p role="alert" className="text-sm text-al-erro">{erroAoDesabilitar}</p>}
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setDesabilitando(null)} disabled={trabalhando !== null}>Cancelar</Button>
            <Button onClick={desabilitar} disabled={trabalhando !== null}>
              {trabalhando ? 'Desabilitando...' : 'Desabilitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DialogoDeRetirarCanal canal={retirandoCanal} aoFechar={() => setRetirandoCanal(null)} />
      <DialogoDeConexao conexao={conectando} aoFechar={() => setConectando(null)} />
      <DialogoDeChave integracao={comChave} aoFechar={() => setComChave(null)} />
      <DialogoDeFerramentas
        integracao={vendoFerramentas}
        ehAdministrador={ehAdministrador}
        demonstracao={modo === 'demonstracao'}
        aoFechar={() => setVendoFerramentas(null)}
      />
      <DialogoDePrevia canalId={previa} aoFechar={() => setPrevia(null)} />
    </Pagina>
  )
}

const ROTULO_DO_CANAL: Record<CanalDeConexao['estado'], string> = {
  em_breve: 'Em breve',
  conectado: 'Ativo',
  nao_conectado: 'Não conectado',
  retirado: 'Retirado',
}

/** O Canal real (hoje, só o Slack): o estado para todos; Conectar e Retirar só para o Administrador. */
function CartaoDeCanalReal({
  canal,
  ehAdministrador,
  instalando,
  aoInstalar,
  aoRetirar,
}: {
  canal: CanalDeConexao
  ehAdministrador: boolean
  instalando: boolean
  aoInstalar: () => void
  aoRetirar: () => void
}) {
  const ativo = canal.estado === 'conectado'
  return (
    <article aria-label={canal.nome} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-lg font-normal">
          <LogoDoCanal id={canal.id} className="size-5" />
          {canal.nome}
        </span>
        <span className={ativo ? 'rotulo text-al-sucesso' : 'rotulo'}>{ROTULO_DO_CANAL[canal.estado]}</span>
      </div>
      <p className="text-sm text-al-muted">{canal.descricao}</p>
      <div className="mt-auto flex flex-col gap-2">
        {canal.instaladoEm && canal.estado !== 'nao_conectado' && (
          <span className="text-xs text-al-muted">Workspace do {canal.nome}: {canal.instaladoEm}</span>
        )}
        {!ehAdministrador ? (
          <span className="text-xs text-al-muted">Só um Administrador conecta ou retira o {canal.nome}.</span>
        ) : ativo ? (
          <Button variant="ghost" onClick={aoRetirar} className="self-start px-4">
            Retirar
          </Button>
        ) : (
          <Button variant="outline" onClick={aoInstalar} disabled={instalando} className="self-start px-4">
            {instalando
              ? 'Abrindo...'
              : canal.estado === 'retirado'
                ? `Conectar o ${canal.nome} de novo`
                : `Conectar o ${canal.nome}`}
          </Button>
        )}
      </div>
    </article>
  )
}

function DialogoDeRetirarCanal({ canal, aoFechar }: { canal: CanalDeConexao | null; aoFechar: () => void }) {
  const fonte = useFonteDeConexoes()
  const [retirando, setRetirando] = useState(false)
  const [erro, setErro] = useState('')

  function fechar() {
    if (retirando) return
    setErro('')
    aoFechar()
  }

  async function retirar() {
    if (!canal || !fonte.retirarCanal) return
    setErro('')
    setRetirando(true)
    try {
      await fonte.retirarCanal(canal.id)
      setRetirando(false)
      aoFechar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : `Não foi possível retirar o ${canal.nome} agora.`)
      setRetirando(false)
    }
  }

  return (
    <Dialog open={canal !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="gap-6 p-6">
        <DialogTitle className="titulo-secao text-2xl">Retirar o {canal?.nome}</DialogTitle>
        <DialogDescription className="text-al-muted">
          O bot @Althius para de responder no {canal?.nome}. As Conversas e a Atividade ficam. Para voltar, conecte de novo
          no mesmo {canal?.nome}.
        </DialogDescription>
        {erro && <p role="alert" className="text-sm text-al-erro">{erro}</p>}
        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={fechar} disabled={retirando}>
            Cancelar
          </Button>
          <Button onClick={retirar} disabled={retirando}>
            {retirando ? 'Retirando...' : 'Retirar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CartaoDeIntegracaoReal({
  integracao,
  ehAdministrador,
  habilitando,
  aoHabilitar,
  aoDesabilitar,
  acesso,
  trabalhando,
  aoAutorizar,
  aoUsarChave,
  aoDesconectar,
  aoVerFerramentas,
}: {
  integracao: IntegracaoDeConexao
  ehAdministrador: boolean
  habilitando: boolean
  aoHabilitar: () => void
  aoDesabilitar?: () => void
  acesso?: AcessoDaIntegracao
  trabalhando: boolean
  aoAutorizar: () => void
  aoUsarChave: () => void
  aoDesconectar: () => void
  aoVerFerramentas: () => void
}) {
  if (integracao.estado === 'em_breve') {
    return (
      <article
        aria-label={integracao.nome}
        className="rounded-2xl flex flex-col gap-2 border border-dashed border-al-line p-6 text-al-muted"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-normal text-al-ink">{integracao.nome}</span>
          <span className="rotulo">Em breve</span>
        </div>
        <p className="text-sm text-al-muted">{integracao.descricao}</p>
      </article>
    )
  }

  const habilitada = integracao.estado === 'habilitada'

  return (
    <article aria-label={integracao.nome} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-3 text-lg font-normal">
          <LogoDaIntegracao id={integracao.id} nome={integracao.nome} className="size-6" />
          {integracao.nome}
        </span>
        <span className={habilitada ? 'rotulo text-al-sucesso' : 'rotulo'}>
          {habilitada ? 'Habilitada' : 'Não habilitada'}
        </span>
      </div>
      <p className="text-sm text-al-muted">{integracao.descricao}</p>
      <div className="mt-auto flex flex-col gap-2">
        {habilitada ? (
          <>
            <span className="text-xs text-al-muted">Habilitada no Workspace</span>
            {ehAdministrador && aoDesabilitar && (
              <Button variant="ghost" onClick={aoDesabilitar} disabled={trabalhando} className="self-start px-4">
                Desabilitar
              </Button>
            )}
            {acesso && (
              <SeuAcesso
                id={integracao.id}
                nome={integracao.nome}
                acesso={acesso}
                trabalhando={trabalhando}
                aoAutorizar={aoAutorizar}
                aoUsarChave={aoUsarChave}
                aoDesconectar={aoDesconectar}
                aoVerFerramentas={aoVerFerramentas}
              />
            )}
          </>
        ) : ehAdministrador ? (
          <Button
            variant="outline"
            onClick={aoHabilitar}
            disabled={habilitando}
            className="self-start px-4"
          >
            {habilitando ? 'Habilitando...' : 'Habilitar'}
          </Button>
        ) : (
          <span className="text-xs text-al-muted">Só um Administrador habilita.</span>
        )}
      </div>
    </article>
  )
}

// O que os Agentes precisam saber para usar as ferramentas de um app.
const AVISO_DAS_FERRAMENTAS: Partial<Record<IntegracaoId, string>> = {
  'google-sheets': 'O servidor do Google Sheets não lista planilhas: peça aos Agentes com a URL da planilha.',
  zapier: 'Cada chamada que dá certo gasta 2 tasks do seu plano no Zapier.',
  make: 'Cada cenário rodado gasta operações do seu plano no Make.',
}

// Por que um Acesso de cada app volta a pedir autorização, quando é do jeito do app e não uma falha.
const AVISO_DE_RECONEXAO: Partial<Record<IntegracaoId, string>> = {
  'tiktok-ads': 'O TikTok pede uma nova autorização a cada 30 dias.',
}

function SeuAcesso({
  id,
  nome,
  acesso,
  trabalhando,
  aoAutorizar,
  aoUsarChave,
  aoDesconectar,
  aoVerFerramentas,
}: {
  id: IntegracaoId
  nome: string
  acesso: AcessoDaIntegracao
  trabalhando: boolean
  aoAutorizar: () => void
  aoUsarChave: () => void
  aoDesconectar: () => void
  aoVerFerramentas: () => void
}) {
  const porAutorizacao = acesso.caminhos.includes('autorizacao')
  const porChave = acesso.caminhos.includes('chave')
  const noWorkspace =
    acesso.conectados === 1
      ? 'No Workspace: 1 participante conectado'
      : `No Workspace: ${acesso.conectados} participantes conectados`

  return (
    <div className="flex flex-col gap-2 border-t border-al-line pt-3">
      {acesso.estado === 'conectado' ? (
        <span className="text-sm text-al-sucesso">
          {acesso.conta ? `Seu acesso: Conectado como ${acesso.conta}` : 'Seu acesso: Conectado'}
        </span>
      ) : acesso.estado === 'precisa_reconectar' ? (
        <>
          <span className="text-sm text-al-erro">Seu acesso: Precisa reconectar</span>
          {AVISO_DE_RECONEXAO[id] && <span className="text-xs text-al-muted">{AVISO_DE_RECONEXAO[id]}</span>}
        </>
      ) : (
        <span className="text-sm text-al-muted">Seu acesso: não conectado</span>
      )}
      <span className="text-xs text-al-muted">{noWorkspace}</span>
      <div className="flex flex-wrap gap-2">
        {acesso.estado === 'conectado' ? (
          <>
            <Button variant="outline" onClick={aoVerFerramentas} className="px-4">
              Ver ferramentas
            </Button>
            <Button variant="ghost" onClick={aoDesconectar} disabled={trabalhando} className="px-4">
              Desconectar
            </Button>
          </>
        ) : (
          <>
            {porAutorizacao && (
              <Button variant="outline" onClick={aoAutorizar} disabled={trabalhando} className="px-4">
                {acesso.estado === 'precisa_reconectar' ? `Reconectar no ${nome}` : `Conectar no ${nome}`}
              </Button>
            )}
            {porChave && (
              <Button variant={porAutorizacao ? 'ghost' : 'outline'} onClick={aoUsarChave} disabled={trabalhando} className="px-4">
                Usar chave de API
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// O que muda na chave de cada app, além de ser da própria conta.
const AVISO_DA_CHAVE: Partial<Record<IntegracaoId, string>> = {
  apollo: 'Use a chave mestra da sua própria conta do Apollo: chaves com escopo não funcionam no MCP.',
  zapier: 'Use o token de conexão criado em mcp.zapier.com com a sua própria conta do Zapier.',
}

function DialogoDeChave({ integracao, aoFechar }: { integracao: IntegracaoDeConexao | null; aoFechar: () => void }) {
  const fonte = useFonteDeConexoes()
  const [chave, setChave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  function fechar() {
    setChave('')
    setErro('')
    aoFechar()
  }

  async function conectar() {
    if (!integracao || !fonte.conectarPorChave) return
    setErro('')
    setEnviando(true)
    try {
      await fonte.conectarPorChave(integracao.id, chave.trim())
      fechar()
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível validar a chave agora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={integracao !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="gap-6 p-6">
        <DialogTitle className="titulo-secao text-2xl">Conectar o {integracao?.nome} com chave de API</DialogTitle>
        <DialogDescription className="text-al-muted">
          A chave fica guardada só no backend da Althius e não volta a aparecer aqui.{' '}
          {(integracao && AVISO_DA_CHAVE[integracao.id]) ?? 'Use uma chave da sua própria conta.'}
        </DialogDescription>
        <label className="flex flex-col gap-2 text-sm">
          Chave de API
          <input
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(evento) => setChave(evento.target.value)}
            className="rounded-lg border border-al-line bg-transparent px-3 py-2"
          />
        </label>
        {erro && <p className="text-sm text-al-erro">{erro}</p>}
        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={conectar} disabled={enviando || chave.trim().length === 0} className="px-6">
            {enviando ? 'Conferindo...' : 'Conectar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const OPCOES_DA_REGRA: [RegraDaFerramenta, string][] = [
  ['sempre', 'Sempre permitir'],
  ['aprovacao', 'Pedir aprovação'],
  ['bloqueada', 'Bloquear'],
]

function DialogoDeFerramentas({
  integracao,
  ehAdministrador,
  demonstracao,
  aoFechar,
}: {
  integracao: IntegracaoDeConexao | null
  ehAdministrador: boolean
  demonstracao: boolean
  aoFechar: () => void
}) {
  const fonteDeConexoes = useFonteDeConexoes()
  const ferramentas = useDados(
    fonteDeConexoes,
    (fonte) =>
      integracao && fonte.ferramentas
        ? fonte.ferramentas(integracao.id).catch(() => null)
        : Promise.resolve([]),
    [integracao?.id],
  )
  // Sem a leitura das regras (ou se ela falhar), cada ferramenta mostra o padrão.
  const regrasLidas = useDados(
    fonteDeConexoes,
    (fonte) =>
      integracao && fonte.regrasDasFerramentas ? fonte.regrasDasFerramentas(integracao.id).catch(() => ({})) : Promise.resolve({}),
    [integracao?.id],
  )
  const [mudancas, setMudancas] = useState<Partial<Record<string, RegraDaFerramenta>>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const regras = { ...(regrasLidas ?? {}), ...mudancas }
  const podeMudar = ehAdministrador && !!fonteDeConexoes.definirRegraDaFerramenta

  function fechar() {
    setMudancas({})
    setErro('')
    aoFechar()
  }

  async function definir(ferramenta: FerramentaDaIntegracao, regra: RegraDaFerramenta) {
    if (!integracao || !fonteDeConexoes.definirRegraDaFerramenta || !podeMudar) return
    setErro('')
    setSalvando(ferramenta.nome)
    try {
      await fonteDeConexoes.definirRegraDaFerramenta(integracao.id, ferramenta.nome, regra)
      setMudancas((atuais) => ({ ...atuais, [ferramenta.nome]: regra }))
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar a permissão agora.')
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Dialog open={integracao !== null} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="max-h-[85vh] gap-6 overflow-y-auto p-6 sm:max-w-lg">
        <DialogTitle className="titulo-secao text-2xl">Ferramentas do {integracao?.nome}</DialogTitle>
        <DialogDescription className="text-al-muted">
          O que os agentes podem usar com o seu Acesso. As que escrevem ou gastam seguem a Permissão de cada agente.
        </DialogDescription>
        {integracao && AVISO_DAS_FERRAMENTAS[integracao.id] && (
          <p className="text-sm text-al-atencao">{AVISO_DAS_FERRAMENTAS[integracao.id]}</p>
        )}
        {demonstracao && <p className="anotacao">exemplos da Demonstração: no Workspace, a lista vem do próprio app</p>}
        {!podeMudar && ferramentas && ferramentas.length > 0 && (
          <p className="text-xs text-al-muted">Só um Administrador muda a permissão de cada ferramenta.</p>
        )}
        {erro && <p className="text-sm text-al-erro">{erro}</p>}
        {ferramentas === undefined ? (
          <Carregando />
        ) : ferramentas === null ? (
          <p className="text-sm text-al-erro">Não foi possível ler as ferramentas agora. Tente de novo em instantes.</p>
        ) : ferramentas.length === 0 ? (
          <p className="text-sm text-al-muted">O servidor não ofereceu ferramentas para a sua conta.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ferramentas.map((ferramenta) => (
              <li key={ferramenta.nome} className="flex flex-col gap-1 border-l-2 border-al-line pl-3">
                <span className="font-normal">{ferramenta.nome}</span>
                {ferramenta.descricao && <span className="text-sm text-al-muted">{ferramenta.descricao}</span>}
                {ferramenta.escreve && <span className="rotulo">Escreve ou gasta</span>}
                <div
                  role="radiogroup"
                  aria-label={`Permissão de ${ferramenta.nome}`}
                  className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm"
                >
                  {OPCOES_DA_REGRA.map(([valor, rotulo]) => (
                    <label key={valor} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`regra-${ferramenta.nome}`}
                        value={valor}
                        checked={regraDaFerramenta(regras, ferramenta) === valor}
                        disabled={!podeMudar || salvando !== null}
                        onChange={() => definir(ferramenta, valor)}
                      />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CartaoDeConexaoDemo({
  nome,
  logo,
  descricao,
  conectado,
  aoConectar,
  extra,
}: {
  nome: string
  descricao: string
  conectado: boolean
  aoConectar: () => void
  extra?: React.ReactNode
  logo?: React.ReactNode
}) {
  return (
    <article aria-label={nome} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-3 text-lg font-normal">{logo}{nome}</span>
        <span className={conectado ? 'rotulo text-al-sucesso' : 'rotulo'}>
          {conectado ? 'Conectado' : 'Não conectado'}
        </span>
      </div>
      <p className="text-sm text-al-muted">{descricao}</p>
      <div className="mt-auto flex gap-2">
        {!conectado && (
          <Button variant="outline" onClick={aoConectar} className="px-4">
            Conectar
          </Button>
        )}
        {extra}
      </div>
    </article>
  )
}

function DialogoDeConexao({
  conexao,
  aoFechar,
}: {
  conexao: { id: CanalId | IntegracaoId; nome: string } | null
  aoFechar: () => void
}) {
  const fonte = useFonteDeConexoes()
  return (
    <Dialog open={conexao !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="gap-6 p-6">
        <DialogTitle className="titulo-secao text-2xl">Conectar {conexao?.nome}</DialogTitle>
        <DialogDescription className="text-al-muted">
          Demonstração: no produto, você autorizaria o acesso da Althius no {conexao?.nome}. Aqui a conexão é simulada.
        </DialogDescription>
        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (conexao) await fonte.conectar(conexao.id)
              aoFechar()
            }}
            className="px-6 tracking-[0.04em]"
          >
            Autorizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoDePrevia({ canalId, aoFechar }: { canalId: CanalId | null; aoFechar: () => void }) {
  const fonteDeConexoes = useFonteDeConexoes()
  const fonteDeAgentes = useFonte()
  const previa = useDados(fonteDeAgentes, (fonte) => (canalId ? fonte.previaDeCanal(canalId) : Promise.resolve(null)), [canalId])
  const aprovacoes = useDados(fonteDeAgentes, (fonte) => fonte.aprovacoes(), [])
  const integracoes = useDados(fonteDeConexoes, (fonte) => fonte.integracoes(), [])
  const canais = useDados(fonteDeConexoes, (fonte) => fonte.canais(), [])
  const nome = canais?.find((c) => c.id === canalId)?.nome

  return (
    <Dialog open={canalId !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="gap-6 p-6 sm:max-w-lg">
        <DialogTitle className="titulo-secao text-2xl">
          Prévia do {nome} {previa && `· ${previa.titulo}`}
        </DialogTitle>
        <DialogDescription className="anotacao">assim os agentes aparecem para sua equipe</DialogDescription>
        {!previa ? (
          <Carregando />
        ) : (
          <ol className="flex flex-col gap-4">
            {previa.mensagens.map((mensagem, i) => (
              <li key={i} className="flex flex-col gap-1 border-l-2 border-al-line pl-4">
                <span className="text-sm font-normal">
                  {mensagem.autor}
                  {mensagem.ehAgente && <span className="rotulo ml-2">Agente Althius</span>}
                </span>
                <p className="whitespace-pre-line">{mensagem.texto}</p>
                {mensagem.aprovacaoId && canalId && (
                  <DecisaoNoCanal
                    aprovacao={aprovacoes?.find((a) => a.id === mensagem.aprovacaoId)}
                    integracoes={integracoes}
                    canalId={canalId}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DecisaoNoCanal({
  aprovacao,
  integracoes,
  canalId,
}: {
  aprovacao?: Aprovacao
  integracoes?: IntegracaoDeConexao[]
  canalId: CanalId
}) {
  if (!aprovacao || aprovacao.revisao) return null
  const nome = nomeDaIntegracao(
    aprovacao.integracaoId,
    integracoes?.find((i) => i.id === aprovacao.integracaoId)?.nome,
  )
  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex items-center gap-2">
        <LogoDaIntegracao id={aprovacao.integracaoId} nome={nome} />
        <span className="rotulo">{nome}</span>
      </div>
      <DecisaoDeAprovacao aprovacao={aprovacao} onde={canalId} />
    </div>
  )
}

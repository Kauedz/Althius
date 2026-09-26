import { Plug } from 'lucide-react'
import { useState } from 'react'
import { LogoDaIntegracao, nomeDaIntegracao } from '@/components/logos'
import { Carregando } from '@/components/marca'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonteDeConexoes } from '@/fonte/contexto'
import type { ConexaoDoCatalogo } from '@/fonte/conexoes-tipos'
import type { Aprovacao, CanalId, CategoriaDeIntegracao, Integracao } from '@/fonte/tipos'

const CATEGORIAS: CategoriaDeIntegracao[] = ['CRM', 'Enriquecimento', 'Conhecimento', 'Mídia paga']

export function PaginaConexoes() {
  const fonteDeConexoes = useFonteDeConexoes()
  const catalogo = useDados(fonteDeConexoes, (f) => f.catalogo(), [])
  const podeHabilitar = useDados(fonteDeConexoes, (f) => f.podeHabilitar(), [])
  const [conectando, setConectando] = useState<{ id: string; nome: string } | null>(null)
  const [previa, setPrevia] = useState<CanalId | null>(null)
  const canais = catalogo?.filter((c) => c.tipo === 'canal')
  const integracoes = catalogo?.filter((c) => c.tipo === 'integracao')

  const cartao = (conexao: ConexaoDoCatalogo) => (
    <CartaoDeConexao
      key={conexao.id}
      conexao={conexao}
      podeHabilitar={podeHabilitar === true}
      aoConectar={() => setConectando(conexao)}
      extra={
        conexao.temPrevia &&
        conexao.acesso?.conectado && (
          <Button variant="outline" onClick={() => setPrevia(conexao.id as CanalId)} className="px-4">
            Ver prévia
          </Button>
        )
      }
    />
  )

  return (
    <Pagina titulo="Conexões" icone={Plug} className="gap-16">
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-lg text-al-muted">
          Um Administrador habilita cada ferramenta no Workspace, e cada pessoa conecta a própria conta. Depois, escolha
          em cada agente o que ele pode usar.
        </p>
      </div>

      <section aria-label="Canais" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="titulo-secao text-3xl">Canais</h2>
          <p className="text-al-muted">Onde sua equipe conversa com os agentes fora da Althius.</p>
        </div>
        {!canais ? <Carregando /> : <div className="grid grid-cols-4 gap-6">{canais.map(cartao)}</div>}
      </section>

      <section aria-label="Integrações" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="titulo-secao text-3xl">Integrações</h2>
          <p className="text-al-muted">De onde os agentes leem dados e para onde escrevem.</p>
        </div>
        {!integracoes ? (
          <Carregando />
        ) : (
          CATEGORIAS.map((categoria) => (
            <div key={categoria} className="flex flex-col gap-4">
              <h3 className="rotulo">{categoria}</h3>
              <div className="grid grid-cols-4 gap-6">{integracoes.filter((i) => i.categoria === categoria).map(cartao)}</div>
            </div>
          ))
        )}
      </section>

      <DialogoDeConexao conexao={conectando} aoFechar={() => setConectando(null)} />
      <DialogoDePrevia canalId={previa} aoFechar={() => setPrevia(null)} />
    </Pagina>
  )
}

function CartaoDeConexao({
  conexao,
  podeHabilitar,
  aoConectar,
  extra,
}: {
  conexao: ConexaoDoCatalogo
  podeHabilitar: boolean
  aoConectar: () => void
  extra?: React.ReactNode
}) {
  const fonte = useFonteDeConexoes()
  const [erro, setErro] = useState<string | null>(null)
  const [habilitando, setHabilitando] = useState(false)
  const { nome, descricao, disponivel, habilitada, acesso } = conexao

  if (!disponivel) {
    return (
      <article aria-label={nome} className="flex flex-col gap-2 border border-dashed border-al-line p-6 text-al-muted">
        <span className="font-normal">{nome}</span>
        {descricao && <p className="text-sm">{descricao}</p>}
        <span className="rotulo">Em breve</span>
      </article>
    )
  }

  async function habilitar() {
    setErro(null)
    setHabilitando(true)
    try {
      await fonte.habilitar(conexao.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setHabilitando(false)
    }
  }

  const estado = !habilitada ? 'Não habilitada' : acesso ? (acesso.conectado ? 'Conectado' : 'Não conectado') : 'Habilitada'
  return (
    <article aria-label={nome} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-normal">{nome}</span>
        <span className={acesso?.conectado ? 'rotulo text-al-sucesso' : 'rotulo'}>{estado}</span>
      </div>
      <p className="text-sm text-al-muted">{descricao}</p>
      {habilitada && !acesso && (
        <p className="text-sm text-al-muted">A conexão da sua conta chega em breve.</p>
      )}
      {!habilitada && !podeHabilitar && <p className="text-sm text-al-muted">Só um Administrador habilita.</p>}
      {erro && (
        <p role="alert" className="text-sm text-al-erro">
          {erro}
        </p>
      )}
      <div className="mt-auto flex gap-2">
        {!habilitada && podeHabilitar && (
          <Button variant="outline" onClick={habilitar} disabled={habilitando} className="px-4">
            Habilitar
          </Button>
        )}
        {habilitada && acesso && !acesso.conectado && (
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
  conexao: { id: string; nome: string } | null
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
            className="px-6 tracking-rotulo uppercase"
          >
            Autorizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogoDePrevia({ canalId, aoFechar }: { canalId: CanalId | null; aoFechar: () => void }) {
  const previa = useDados((fonte) => (canalId ? fonte.previaDeCanal(canalId) : Promise.resolve(null)), [canalId])
  const aprovacoes = useDados((fonte) => fonte.aprovacoes(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const canais = useDados((fonte) => fonte.canais(), [])
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
  integracoes?: Integracao[]
  canalId: CanalId
}) {
  // Nos Canais chegam só as Aprovações de ação numa Integração.
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

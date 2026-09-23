import { Plug } from 'lucide-react'
import { useState } from 'react'
import { Carregando } from '@/components/marca'
import { DecisaoDeAprovacao } from '@/components/decisao'
import { Pagina } from '@/components/pagina'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useDados, useFonte } from '@/fonte/contexto'
import type { Aprovacao, CanalId, CategoriaDeIntegracao, IntegracaoId } from '@/fonte/tipos'

const CATEGORIAS: CategoriaDeIntegracao[] = ['CRM', 'Enriquecimento', 'Conhecimento', 'Mídia paga']

export function PaginaConexoes() {
  const canais = useDados((fonte) => fonte.canais(), [])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const futuras = useDados((fonte) => fonte.integracoesFuturas(), [])
  const [conectando, setConectando] = useState<{ id: CanalId | IntegracaoId; nome: string } | null>(null)
  const [previa, setPrevia] = useState<CanalId | null>(null)

  return (
    <Pagina titulo="Conexões" icone={Plug} className="gap-16">
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-lg text-al-muted">
          Conecte cada ferramenta uma vez para o Workspace. Depois, escolha em cada agente o que ele pode usar.
        </p>
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
            {canais.map((canal) => (
              <CartaoDeConexao
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
            ))}
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
          CATEGORIAS.map((categoria) => (
            <div key={categoria} className="flex flex-col gap-4">
              <h3 className="rotulo">{categoria}</h3>
              <div className="grid grid-cols-4 gap-6">
                {integracoes
                  .filter((i) => i.categoria === categoria)
                  .map((integracao) => (
                    <CartaoDeConexao
                      key={integracao.id}
                      nome={integracao.nome}
                      descricao={integracao.descricao}
                      conectado={integracao.conectada}
                      aoConectar={() => setConectando(integracao)}
                    />
                  ))}
                {futuras
                  .filter((i) => i.categoria === categoria)
                  .map((futura) => (
                    <article
                      key={futura.nome}
                      aria-label={futura.nome}
                      className="flex flex-col gap-2 border border-dashed border-al-line p-6 text-al-muted"
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

      <DialogoDeConexao conexao={conectando} aoFechar={() => setConectando(null)} />
      <DialogoDePrevia canalId={previa} aoFechar={() => setPrevia(null)} />
    </Pagina>
  )
}

function CartaoDeConexao({
  nome,
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
}) {
  return (
    <article aria-label={nome} className="cartao flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-normal">{nome}</span>
        <span className={conectado ? 'rotulo text-al-sucesso' : 'rotulo'}>{conectado ? 'Conectado' : 'Não conectado'}</span>
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
  const fonte = useFonte()
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
                  <DecisaoNoCanal aprovacao={aprovacoes?.find((a) => a.id === mensagem.aprovacaoId)} canalId={canalId} />
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DecisaoNoCanal({ aprovacao, canalId }: { aprovacao?: Aprovacao; canalId: CanalId }) {
  if (!aprovacao) return null
  return (
    <div className="pt-2">
      <DecisaoDeAprovacao aprovacao={aprovacao} onde={canalId} />
    </div>
  )
}

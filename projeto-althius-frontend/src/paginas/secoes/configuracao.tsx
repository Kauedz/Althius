import { X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { Button } from '@/components/ui/button'
import { useDados, useFonte } from '@/fonte/contexto'
import { permissaoPadrao } from '@/fonte/regras'
import type { Agente, FonteDeConhecimento, Integracao, IntegracaoId, Permissao, Personalizacao } from '@/fonte/tipos'
import { useEscritaDeAgente, usePodeAdministrarAgentes } from '@/paginas/administracao-de-agentes'
import { ROTULO_DA_PERMISSAO } from '@/paginas/rotulos'

const DESCRICAO_DA_PERMISSAO: Record<Permissao, string> = {
  ler: 'Só consulta dados.',
  propor: 'Propõe a ação e espera uma Aprovação.',
  executar: 'Age sozinho e registra na Atividade.',
}

export function SecaoConfiguracao({ agente }: { agente: Agente }) {
  const salva = useDados((fonte) => fonte.personalizacao(agente.id), [agente.id])
  const integracoes = useDados((fonte) => fonte.integracoes(), [])
  const workspace = useDados((fonte) => fonte.workspace(), [])

  return (
    <section aria-labelledby="titulo-configuracao" className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 id="titulo-configuracao" className="titulo-secao text-3xl">
          Configuração
        </h2>
        <p className="text-al-muted">
          Personalize {agente.nome} para a {workspace?.cliente}. O comportamento base do agente continua o mesmo.
        </p>
      </div>
      {!salva || !integracoes ? (
        <Carregando />
      ) : (
        <FormularioDePersonalizacao agente={agente} salva={salva} integracoes={integracoes} />
      )}
    </section>
  )
}

function FormularioDePersonalizacao({
  agente,
  salva,
  integracoes,
}: {
  agente: Agente
  salva: Personalizacao
  integracoes: Integracao[]
}) {
  const fonte = useFonte()
  const podeAdministrar = usePodeAdministrarAgentes()
  const { erro, escrever } = useEscritaDeAgente()
  const [rascunho, setRascunho] = useState(salva)
  const [mensagem, setMensagem] = useState('')
  const alterar = (parte: Partial<Personalizacao>) => {
    setRascunho((atual) => ({ ...atual, ...parte }))
    setMensagem('')
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setMensagem('')
    if (await escrever(() => fonte.salvarPersonalizacao(agente.id, rascunho))) setMensagem('Personalização salva.')
  }

  const permitidas = Object.keys(rascunho.permissoes) as IntegracaoId[]
  const disponiveis = integracoes.filter((i) => !permitidas.includes(i.id))

  return (
    <form onSubmit={salvar} className="flex flex-col gap-10">
      {!podeAdministrar && (
        <Mensagem tipo="info">Só Administradores alteram a configuração dos Agentes. Você pode consultá-la.</Mensagem>
      )}
      {/* Um Membro consulta: o fieldset desabilita todos os controles de uma vez, o servidor recusa o resto. */}
      <fieldset disabled={!podeAdministrar} className="m-0 flex min-w-0 flex-col gap-10 border-0 p-0">
        <Bloco titulo="Instruções adicionais" id="instrucoes">
          <textarea
            id="instrucoes"
            rows={3}
            value={rascunho.instrucoes}
            onChange={(e) => alterar({ instrucoes: e.target.value })}
            placeholder="Ex.: priorize Contas-alvo com time de dados próprio."
            className="campo"
          />
        </Bloco>

        <Bloco titulo="Tom de voz" id="tom-de-voz">
          <textarea
            id="tom-de-voz"
            rows={2}
            value={rascunho.tomDeVoz}
            onChange={(e) => alterar({ tomDeVoz: e.target.value })}
            className="campo"
          />
        </Bloco>

        <BaseDeConhecimento
          itens={rascunho.baseDeConhecimento}
          aoMudar={(baseDeConhecimento) => alterar({ baseDeConhecimento })}
        />

        <fieldset className="flex flex-col gap-4">
          <legend className="rotulo mb-4">Ferramentas e permissões</legend>
          <ul className="flex flex-col border-t border-al-line">
            {permitidas.map((id) => {
              const integracao = integracoes.find((i) => i.id === id)
              if (!integracao) return null
              return (
                <li key={id} className="flex items-center gap-6 border-b border-al-line py-4">
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="font-normal">{integracao.nome}</span>
                    {!integracao.conectada && (
                      <Link to="/conexoes" className="text-sm text-al-atencao underline underline-offset-4">
                        Não conectada no Workspace
                      </Link>
                    )}
                  </div>
                  <div role="radiogroup" aria-label={`Permissão em ${integracao.nome}`} className="flex">
                    {(Object.keys(ROTULO_DA_PERMISSAO) as Permissao[]).map((permissao) => (
                      <label
                        key={permissao}
                        title={DESCRICAO_DA_PERMISSAO[permissao]}
                        className="cursor-pointer border border-al-line px-4 py-2 text-sm has-[:checked]:border-al-ink has-[:checked]:bg-al-ink has-[:checked]:text-al-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-al-accent"
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`permissao-${id}`}
                          value={permissao}
                          checked={rascunho.permissoes[id] === permissao}
                          onChange={() => alterar({ permissoes: { ...rascunho.permissoes, [id]: permissao } })}
                        />
                        {ROTULO_DA_PERMISSAO[permissao]}
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${integracao.nome}`}
                    onClick={() => {
                      const { [id]: _removida, ...resto } = rascunho.permissoes
                      alterar({ permissoes: resto })
                    }}
                  >
                    <X strokeWidth={1.8} aria-hidden />
                  </Button>
                </li>
              )
            })}
            {agente.especialidade.ferramentasNativas.map((ferramenta) => (
              <li key={ferramenta} className="flex items-center gap-6 border-b border-al-line py-4">
                <span className="flex-1 font-normal">{ferramenta}</span>
                <span className="rotulo">Ferramenta nativa · Ler</span>
              </li>
            ))}
          </ul>
          {disponiveis.length > 0 && (
            <label className="flex items-center gap-4">
              <span className="rotulo">Adicionar ferramenta</span>
              <select
                value=""
                onChange={(e) => {
                  const integracao = integracoes.find((i) => i.id === e.target.value)
                  if (integracao) alterar({ permissoes: { ...rascunho.permissoes, [integracao.id]: permissaoPadrao(integracao) } })
                }}
                className="campo w-auto"
              >
                <option value="">Escolha uma integração</option>
                {disponiveis.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="anotacao">ler por padrão; propor em tudo que escreve ou gasta</p>
        </fieldset>
      </fieldset>

      {podeAdministrar && (
        <div className="flex items-center gap-6">
          <Button type="submit" className="h-auto px-6 py-4 tracking-rotulo uppercase">
            Salvar personalização
          </Button>
          <p role="status" className="text-al-sucesso">
            {mensagem}
          </p>
          <Mensagem tipo="erro">{erro}</Mensagem>
        </div>
      )}
    </form>
  )
}

function Bloco({ titulo, id, children }: { titulo: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="rotulo">
        {titulo}
      </label>
      {children}
    </div>
  )
}

const ROTULO_DO_TIPO: Record<FonteDeConhecimento['tipo'], string> = {
  documento: 'Documento',
  url: 'URL',
  notion: 'Notion',
}

function BaseDeConhecimento({
  itens,
  aoMudar,
}: {
  itens: FonteDeConhecimento[]
  aoMudar: (itens: FonteDeConhecimento[]) => void
}) {
  const [tipo, setTipo] = useState<FonteDeConhecimento['tipo']>('url')
  const [endereco, setEndereco] = useState('')

  function adicionar() {
    if (!endereco.trim()) return
    aoMudar([...itens, { id: `k-${Date.now()}`, tipo, nome: endereco.trim() }])
    setEndereco('')
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="rotulo">Base de conhecimento</span>
      <ul className="flex flex-col border-t border-al-line">
        {itens.map((item) => (
          <li key={item.id} className="flex items-center gap-6 border-b border-al-line py-2">
            <span className="rotulo w-24">{ROTULO_DO_TIPO[item.tipo]}</span>
            <span className="flex-1">{item.nome}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover ${item.nome}`}
              onClick={() => aoMudar(itens.filter((i) => i.id !== item.id))}
            >
              <X strokeWidth={1.8} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select
          aria-label="Tipo de fonte"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as FonteDeConhecimento['tipo'])}
          className="campo w-auto"
        >
          {Object.entries(ROTULO_DO_TIPO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
        <input
          aria-label="Documento, URL ou página do Notion"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              adicionar()
            }
          }}
          placeholder="databricks.com/blog"
          className="campo"
        />
        <Button type="button" variant="outline" onClick={adicionar} className="px-4">
          Adicionar
        </Button>
      </div>
    </div>
  )
}

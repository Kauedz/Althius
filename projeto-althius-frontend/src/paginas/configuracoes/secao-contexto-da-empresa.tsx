import { Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Carregando, Pulso } from '@/components/marca'
import { Mensagem } from '@/components/mensagem'
import { useCarregamento, useDados, useFonteDoContextoDaEmpresa } from '@/fonte/contexto'
import {
  CAMPOS_DO_CONTEXTO,
  MOTIVOS_DA_FALHA_DA_GERACAO,
  TEXTOS_VAZIOS,
  textosIguais,
  type ContextoDaEmpresa,
  type GeracaoDoContexto,
  type TextosDoContexto,
} from '@/fonte/contexto-da-empresa-tipos'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { mensagemDeErro } from '@/lib/utils'
import { SecaoDeConfiguracoes } from './componentes'

/** De quanto em quanto tempo a tela relê o contexto enquanto o site é lido no servidor. */
export const INTERVALO_DO_ANDAMENTO_MS = 3_000

/**
 * Contexto da empresa (spec contexto-da-empresa), no formato do AI Context do Clay: o site e a ação de gerar, depois
 * três grandes textos — Empresa, Perfil de cliente ideal e Personas — e salvar. Primário e secundários ficam escritos
 * no mesmo texto de ICP. Só o Administrador edita e gera; os outros participantes leem a versão vigente.
 */
export function SecaoContextoDaEmpresa() {
  const fonte = useFonteDoContextoDaEmpresa()
  const { dados: contexto, erro, recarregar } = useCarregamento(fonte, (f) => f.contexto(), [])
  const workspace = useDados((f) => f.workspace(), [])
  const gerando = contexto?.geracao?.estado === 'gerando'

  // A leitura roda no servidor: enquanto ela não termina, a tela relê o contexto de tempos em tempos.
  useEffect(() => {
    if (!gerando) return
    const relogio = setInterval(recarregar, INTERVALO_DO_ANDAMENTO_MS)
    return () => clearInterval(relogio)
  }, [gerando, recarregar])

  return (
    <SecaoDeConfiguracoes
      id="contexto-da-empresa"
      titulo="Contexto da empresa"
      alcance="workspace"
      descricao="O que a Althius sabe da sua empresa, dos clientes ideais e de quem compra. Os Agentes e o Mercado usam a versão vigente."
    >
      {erro && !contexto ? (
        <div className="flex flex-col items-start gap-3">
          <Mensagem tipo="erro">Não foi possível carregar o Contexto da empresa. {erro.message}</Mensagem>
          <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
            Tentar de novo
          </button>
        </div>
      ) : !contexto || !workspace ? (
        <Carregando />
      ) : (
        <ContextoCarregado contexto={contexto} podeEditar={workspace.papel === 'administrador'} aoRecarregar={recarregar} />
      )}
    </SecaoDeConfiguracoes>
  )
}

function ContextoCarregado({
  contexto,
  podeEditar,
  aoRecarregar,
}: {
  contexto: ContextoDaEmpresa
  podeEditar: boolean
  aoRecarregar: () => void
}) {
  const vigente = contexto.vigente
  return (
    <div className="flex flex-col gap-8">
      <SiteEGerar contexto={contexto} podeEditar={podeEditar} />
      {contexto.geracao && <EstadoDaGeracao geracao={contexto.geracao} vigente={vigente?.versao ?? null} podeEditar={podeEditar} />}
      <section aria-label="Versão vigente" className="flex flex-col gap-1">
        <span className="text-sm text-al-muted">
          {vigente
            ? `Versão ${vigente.versao} · ${vigente.origem === 'geracao' && !vigente.autor ? 'Gerada pelo site' : (vigente.autor ?? 'Alguém que já não está no Workspace')} · ${formatarDataCompleta(vigente.em)}`
            : podeEditar
              ? 'Ainda sem contexto. Escreva os três textos ou gere pelo site.'
              : 'Ainda sem contexto. Um Administrador escreve ou gera pelo site.'}
        </span>
      </section>
      {podeEditar ? <EditorDoContexto contexto={contexto} aoRecarregar={aoRecarregar} /> : <LeituraDoContexto textos={vigente ?? TEXTOS_VAZIOS} />}
    </div>
  )
}

function SiteEGerar({ contexto, podeEditar }: { contexto: ContextoDaEmpresa; podeEditar: boolean }) {
  const fonte = useFonteDoContextoDaEmpresa()
  const [site, setSite] = useState(contexto.site)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const gerando = contexto.geracao?.estado === 'gerando'

  async function gerar(e: FormEvent) {
    e.preventDefault()
    setPedindo(true)
    setErro('')
    try {
      const informado = site.trim()
      await fonte.gerar(informado && informado !== contexto.site ? informado : undefined)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setPedindo(false)
    }
  }

  return (
    <form aria-label="Site da empresa" noValidate onSubmit={gerar} className="flex flex-col gap-1.5">
      <label htmlFor="contexto-site" className="rotulo">
        Site da empresa
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="contexto-site"
          type="text"
          inputMode="url"
          autoComplete="url"
          readOnly={!podeEditar}
          value={site}
          onChange={(e) => {
            setSite(e.target.value)
            setErro('')
          }}
          placeholder="suaempresa.com.br"
          className="campo max-w-md flex-1"
        />
        {podeEditar && (
          <button type="submit" disabled={pedindo || gerando || !site.trim()} className={BOTAO_SECUNDARIO}>
            <Sparkles className="size-4" strokeWidth={1.8} aria-hidden />
            {gerando ? 'Gerando…' : 'Gerar'}
          </button>
        )}
      </div>
      <span className="text-sm text-al-muted">
        {contexto.site
          ? 'A Althius lê as páginas de oferta, sobre, soluções, clientes e casos do site para sugerir os três textos.'
          : podeEditar
            ? 'Informe o site para gerar os textos, ou escreva-os à mão.'
            : 'Nenhum site cadastrado.'}
      </span>
      <Mensagem tipo="erro">{erro}</Mensagem>
    </form>
  )
}

function EstadoDaGeracao({ geracao, vigente, podeEditar }: { geracao: GeracaoDoContexto; vigente: number | null; podeEditar: boolean }) {
  const fonte = useFonteDoContextoDaEmpresa()
  const [decidindo, setDecidindo] = useState(false)
  const [erro, setErro] = useState('')

  async function decidir(acao: () => Promise<unknown>) {
    setDecidindo(true)
    setErro('')
    try {
      await acao()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setDecidindo(false)
    }
  }

  if (geracao.estado === 'gerando') {
    return (
      <section aria-label="Leitura do site" className="flex items-start gap-3 rounded-xl bg-al-hover px-3.5 py-3 text-sm" role="status">
        <Pulso />
        <span>
          Lendo {geracao.site}… Pode levar até um minuto e você pode sair desta tela.{' '}
          {vigente === null
            ? 'Quando terminar, o contexto fica valendo e você pode editá-lo.'
            : 'Quando terminar, a sugestão aparece aqui para você aceitar ou descartar; a versão atual continua valendo.'}
        </span>
      </section>
    )
  }

  if (geracao.estado === 'falha') {
    return (
      <section aria-label="Leitura do site" className="flex flex-col items-start gap-3">
        <Mensagem tipo="erro">{MOTIVOS_DA_FALHA_DA_GERACAO[geracao.motivo]}</Mensagem>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={decidindo} onClick={() => decidir(() => fonte.gerar())} className={BOTAO_SECUNDARIO}>
              Tentar de novo
            </button>
            <button type="button" disabled={decidindo} onClick={() => decidir(() => fonte.descartarGeracao(geracao.id))} className={BOTAO_SECUNDARIO}>
              Dispensar
            </button>
          </div>
        )}
        <Mensagem tipo="erro">{erro}</Mensagem>
      </section>
    )
  }

  if (!podeEditar) {
    return <Mensagem tipo="info">Há uma nova leitura do site aguardando a decisão de um Administrador. A versão vigente continua valendo.</Mensagem>
  }
  return (
    <section aria-label="Nova sugestão" className="flex flex-col gap-5 rounded-xl border border-al-accent/40 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="titulo-secao text-xl">Nova sugestão a partir do site</h3>
        <span className="text-sm text-al-muted">
          A versão vigente continua valendo até você aceitar. Aceitar substitui os três textos; descartar mantém o que está abaixo.
        </span>
      </div>
      {CAMPOS_DO_CONTEXTO.map(({ id, nome }) => (
        <section key={id} aria-label={`${nome} sugerido`} className="flex flex-col gap-1.5">
          <h4 className="rotulo">{nome}</h4>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm text-al-ink">{geracao.textos[id]}</p>
        </section>
      ))}
      <Mensagem tipo="erro">{erro}</Mensagem>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={decidindo} onClick={() => decidir(() => fonte.aceitarSugestao(geracao.id, vigente))} className={BOTAO_PRIMARIO}>
          Aceitar sugestão
        </button>
        <button type="button" disabled={decidindo} onClick={() => decidir(() => fonte.descartarGeracao(geracao.id))} className={BOTAO_SECUNDARIO}>
          Descartar
        </button>
      </div>
    </section>
  )
}

function EditorDoContexto({ contexto, aoRecarregar }: { contexto: ContextoDaEmpresa; aoRecarregar: () => void }) {
  const fonte = useFonteDoContextoDaEmpresa()
  const vigente = contexto.vigente
  // O rascunho sabe de que versão partiu: é ela que o servidor confere ao salvar.
  const [base, setBase] = useState<{ versao: number | null; textos: TextosDoContexto }>({
    versao: vigente?.versao ?? null,
    textos: vigente ?? TEXTOS_VAZIOS,
  })
  const [textos, setTextos] = useState<TextosDoContexto>(base.textos)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const alterado = !textosIguais(textos, base.textos)
  const versaoNova = (vigente?.versao ?? null) !== base.versao

  // Chegou outra versão (aceite, primeira geração, outra aba). Sem rascunho, a tela passa a mostrá-la; com rascunho, ele
  // fica, e salvar pede para recarregar em vez de sobrescrever.
  useEffect(() => {
    if (!versaoNova || alterado) return
    const nova = { versao: vigente?.versao ?? null, textos: vigente ?? TEXTOS_VAZIOS }
    setBase(nova)
    setTextos(nova.textos)
  }, [versaoNova, alterado, vigente])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    setSalvo(false)
    try {
      const versao = await fonte.salvar(textos, base.versao)
      setBase({ versao, textos })
      setSalvo(true)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  function recarregarVersaoAtual() {
    const nova = { versao: vigente?.versao ?? null, textos: vigente ?? TEXTOS_VAZIOS }
    setBase(nova)
    setTextos(nova.textos)
    setErro('')
    aoRecarregar()
  }

  return (
    <form aria-label="Editar o Contexto da empresa" noValidate onSubmit={salvar} className="flex flex-col gap-6">
      {CAMPOS_DO_CONTEXTO.map(({ id, nome, ajuda }) => (
        <div key={id} className="flex flex-col gap-1.5">
          <label htmlFor={`contexto-${id}`} className="rotulo">
            {nome}
          </label>
          <span id={`contexto-${id}-ajuda`} className="text-sm text-al-muted">
            {ajuda}
          </span>
          <textarea
            id={`contexto-${id}`}
            aria-describedby={`contexto-${id}-ajuda`}
            rows={12}
            value={textos[id]}
            onChange={(e) => {
              const valor = e.target.value
              setTextos((atual) => ({ ...atual, [id]: valor }))
              setSalvo(false)
            }}
            className="campo min-h-48 font-normal"
          />
        </div>
      ))}
      {versaoNova && alterado && !erro && (
        <Mensagem tipo="info">Uma nova versão do contexto passou a valer enquanto você editava. Seu texto continua aqui.</Mensagem>
      )}
      <Mensagem tipo="erro">{erro}</Mensagem>
      <Mensagem tipo="sucesso">{salvo ? 'Contexto salvo. A nova versão já está valendo.' : ''}</Mensagem>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={salvando || !alterado} className={BOTAO_PRIMARIO}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        {(erro || (versaoNova && alterado)) && (
          <button type="button" onClick={recarregarVersaoAtual} className={BOTAO_SECUNDARIO}>
            Recarregar a versão atual
          </button>
        )}
      </div>
    </form>
  )
}

function LeituraDoContexto({ textos }: { textos: TextosDoContexto }) {
  return (
    <div className="flex flex-col gap-6">
      {CAMPOS_DO_CONTEXTO.map(({ id, nome }) => (
        <section key={id} aria-label={nome} className="flex flex-col gap-1.5">
          <h3 className="rotulo">{nome}</h3>
          {textos[id].trim() ? (
            <p className="whitespace-pre-wrap text-al-ink">{textos[id]}</p>
          ) : (
            <p className="text-sm text-al-muted">Ainda não foi escrito.</p>
          )}
        </section>
      ))}
    </div>
  )
}

// O mini-ICP no Day0 operacional: a leitura do site sugere, a pessoa criadora revisa e salva. Nada da sugestão vira
// dado sem o clique em "Salvar ICP".
import { useState } from 'react'
import type { EstadoDeOnboarding, FonteDeOnboarding, MiniIcpEProduto } from '@/fonte/onboarding-tipos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo } from './componentes'

type CamposDoDay0 = MiniIcpEProduto

const CAMPOS: readonly { campo: keyof CamposDoDay0; rotulo: string }[] = [
  { campo: 'oQueVende', rotulo: 'O que você vende' },
  { campo: 'miniIcp', rotulo: 'Mini-ICP' },
  { campo: 'porQueCompram', rotulo: 'Por que compram' },
]

function doEstado(estado: EstadoDeOnboarding): CamposDoDay0 {
  const { checklist } = estado
  return {
    oQueVende: checklist.oQueVende, miniIcp: checklist.miniIcp, porQueCompram: checklist.porQueCompram,
  }
}

export function IcpDoDay0({ estado, fonte, aoSalvar }: {
  estado: EstadoDeOnboarding
  fonte: FonteDeOnboarding
  aoSalvar: (estado: EstadoDeOnboarding) => void
}) {
  const [campos, setCampos] = useState(() => doEstado(estado))
  const [base, setBase] = useState(() => doEstado(estado))
  const [editados, setEditados] = useState<ReadonlySet<keyof CamposDoDay0>>(new Set())
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Quando a Fonte muda (a leitura chegou), os campos que a pessoa não editou adotam o novo valor.
  const daFonte = doEstado(estado)
  if (CAMPOS.some(({ campo }) => daFonte[campo] !== base[campo])) {
    setBase(daFonte)
    setCampos((atuais) => {
      const novos = { ...atuais }
      for (const { campo } of CAMPOS) if (!editados.has(campo)) novos[campo] = daFonte[campo]
      return novos
    })
  }

  const { situacao } = estado.leitura
  function editar(campo: keyof CamposDoDay0, valor: string) {
    setCampos((atuais) => ({ ...atuais, [campo]: valor }))
    setEditados((atuais) => new Set(atuais).add(campo))
    setSalvo(false)
    setErro('')
  }

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      const novo = await fonte.salvarProduto(campos)
      setEditados(new Set())
      setSalvo(true)
      aoSalvar(novo)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o ICP. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section aria-label="ICP do Workspace" className="rounded-xl flex flex-col gap-4 border border-al-line p-4">
      <div className="flex flex-col gap-1">
        <p className="rotulo">ICP do Workspace</p>
        <p aria-live="polite" className="text-sm text-al-muted">
          {situacao === 'lendo' && `Lendo o site ${estado.dominio}. Você pode preencher os campos enquanto isso.`}
          {situacao === 'pronta' && `Sugestão da leitura de ${estado.dominio}. Revise e salve: nada é gravado sem você.`}
          {situacao === 'falhou' && `Não foi possível ler o site ${estado.dominio}. Preencha os campos ou tente de novo.`}
          {situacao === 'inativa' && 'Preencha o que você já sabe sobre o que vende e para quem.'}
        </p>
      </div>
      {CAMPOS.map(({ campo, rotulo }) => (
        <Campo key={campo} rotulo={rotulo}>
          <textarea className="campo min-h-20" aria-label={rotulo} value={campos[campo]} onChange={(evento) => editar(campo, evento.target.value)} />
        </Campo>
      ))}
      {erro && <p role="alert">{erro}</p>}
      {salvo && <p role="status">ICP salvo.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={BOTAO_PRIMARIO} disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar ICP'}
        </button>
        {situacao === 'falhou' && (
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void fonte.lerSite(estado.dominio)}>
            Tentar de novo
          </button>
        )}
      </div>
    </section>
  )
}

// O ICP no Day0 operacional (ticket sinais-first 16): a leitura do site sugere, a pessoa criadora revisa e salva.
// Nada da sugestão vira dado sem o clique em "Salvar ICP".
import { useState } from 'react'
import { portesInvalidos } from '@/fonte/campos-do-icp'
import type { EstadoDeOnboarding, FonteDeOnboarding, MiniIcpEProduto } from '@/fonte/onboarding-tipos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo } from './componentes'

type CamposDoDay0 = Required<MiniIcpEProduto>

const CAMPOS: readonly { campo: keyof CamposDoDay0; rotulo: string; longo?: boolean }[] = [
  { campo: 'oQueVende', rotulo: 'O que você vende', longo: true },
  { campo: 'miniIcp', rotulo: 'Mini-ICP', longo: true },
  { campo: 'porQueCompram', rotulo: 'Por que compram', longo: true },
  { campo: 'setor', rotulo: 'Setor' },
  { campo: 'porte', rotulo: 'Porte' },
  { campo: 'regiao', rotulo: 'Região' },
]

function doEstado(estado: EstadoDeOnboarding): CamposDoDay0 {
  const { checklist } = estado
  return {
    oQueVende: checklist.oQueVende, miniIcp: checklist.miniIcp, porQueCompram: checklist.porQueCompram,
    setor: checklist.setor ?? '', porte: checklist.porte ?? '', regiao: checklist.regiao ?? '',
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
    const invalidos = portesInvalidos(campos.porte)
    if (invalidos.length) {
      setErro(`Porte inválido: ${invalidos.join(', ')}. Use faixas como 11-50, 51-200 ou ME, EPP.`)
      return
    }
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
          {situacao === 'inativa' && 'Preencha o que você já sabe. Setor, Porte e Região orientam a Aderência das empresas achadas por Sinais.'}
        </p>
      </div>
      {CAMPOS.map(({ campo, rotulo, longo }) => (
        <Campo key={campo} rotulo={rotulo}>
          {longo ? (
            <textarea className="campo min-h-20" aria-label={rotulo} value={campos[campo]} onChange={(evento) => editar(campo, evento.target.value)} />
          ) : (
            <input className="campo" aria-label={rotulo} value={campos[campo]} onChange={(evento) => editar(campo, evento.target.value)} />
          )}
          {campo === 'porte' && <p className="text-sm text-al-muted">Use faixas como 11-50, 51-200 ou ME, EPP, separadas por vírgula.</p>}
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

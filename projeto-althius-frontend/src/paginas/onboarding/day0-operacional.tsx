import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo, Carregando } from '@/components/marca'
import { useFonteDeOnboarding } from '@/fonte/contexto'
import { ORIGENS_HDYHAU, PAPEIS_DO_DAY0, type EstadoDeOnboarding, type OrigemHdyhau, type PapelNoDay0 } from '@/fonte/onboarding-tipos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Campo, EscolhaUnica } from './componentes'

export function Day0Operacional() {
  const fonte = useFonteDeOnboarding()
  const navegar = useNavigate()
  const [estado, setEstado] = useState<EstadoDeOnboarding>()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [texto, setTexto] = useState('')
  const [papel, setPapel] = useState<PapelNoDay0 | null>(null)
  const [origem, setOrigem] = useState<OrigemHdyhau | null>(null)

  useEffect(() => {
    let ativo = true
    fonte.ler().then((salvo) => { if (ativo) setEstado(salvo) }).catch(() => {
      if (ativo) setErro('Não foi possível carregar o Day0. Tente novamente.')
    })
    return () => { ativo = false }
  }, [fonte, tentativa])

  async function salvar(acao: () => Promise<EstadoDeOnboarding>) {
    setOcupado(true)
    setErro('')
    try {
      const salvo = await acao()
      setEstado(salvo)
      if (salvo.concluido) navegar('/', { replace: true })
      setTexto('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar o Day0. Tente novamente.')
    } finally {
      setOcupado(false)
    }
  }

  if (estado?.concluido) return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-6 py-10">
      <Logo />
      <h1 className="titulo-display text-3xl">Day0 concluído</h1>
      <p>Seu primeiro acesso está salvo. Você não precisa responder novamente.</p>
      <p>O checklist completo ainda não está disponível neste Workspace.</p>
      <Link className={BOTAO_PRIMARIO} to="/">Abrir Workspace</Link>
    </main>
  )
  if (!estado && !erro) return <Carregando rotulo="Carregando onboarding" />
  const etapa = estado?.etapa
  const titulos = { papel: 'Qual é o seu papel?', empresa: 'Qual é a sua empresa?', dominio: 'Qual é o site da empresa?', hdyhau: 'Como nos conheceu?', convite: 'Tudo pronto para começar', checklist: 'Tudo pronto para começar' }
  const titulo = etapa ? titulos[etapa] : 'Seu primeiro acesso'
  const continuar = () => {
    if (etapa === 'papel' && papel) return salvar(() => fonte.definirPapel(papel))
    if (etapa === 'empresa') return salvar(() => fonte.definirCliente(texto))
    if (etapa === 'dominio') return salvar(() => fonte.definirDominio(texto))
    if (etapa === 'hdyhau' && origem) return salvar(() => fonte.definirComoConheceu(origem))
    return salvar(() => fonte.concluirOnboarding())
  }
  const preenchido = etapa === 'papel' ? !!papel : etapa === 'hdyhau' ? !!origem : etapa === 'empresa' || etapa === 'dominio' ? !!texto.trim() : true
  return (
    <main className="min-h-screen bg-al-bg text-al-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-10">
        <Logo />
        <h1 className="titulo-display text-3xl">{titulo}</h1>
        {erro && <p role="alert">{erro}</p>}
        {!estado ? <button className={BOTAO_PRIMARIO} onClick={() => { setErro(''); setTentativa((n) => n + 1) }}>Tentar novamente</button> : (
          <fieldset disabled={ocupado} className="flex flex-col gap-6">
            {etapa === 'papel' && <EscolhaUnica rotulo="Papel" opcoes={PAPEIS_DO_DAY0} valor={papel} aoEscolher={setPapel} />}
            {etapa === 'hdyhau' && <EscolhaUnica rotulo="Como nos conheceu?" opcoes={ORIGENS_HDYHAU} valor={origem} aoEscolher={setOrigem} />}
            {(etapa === 'empresa' || etapa === 'dominio') && (
              <Campo rotulo={etapa === 'empresa' ? 'Empresa' : 'Domínio do site'}>
                <input className="campo" aria-label={etapa === 'empresa' ? 'Empresa' : 'Domínio do site'} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
              </Campo>
            )}
            {etapa === 'empresa' && <p>Estes dados preenchem a empresa do Workspace já aberto pela equipe Althius. O nome do Workspace permanece o mesmo.</p>}
            {etapa === 'dominio' && <p>A leitura do site e a busca do logo ainda não estão disponíveis.</p>}
            {etapa === 'convite' && <p>Seu progresso está salvo. Você já pode abrir o Workspace.</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void salvar(() => fonte.concluirOnboarding())}>Pular Day0</button>
              <button type="button" className={BOTAO_PRIMARIO} disabled={!preenchido} onClick={() => void continuar()}>{ocupado ? 'Salvando…' : etapa === 'convite' ? 'Concluir Day0' : 'Continuar'}</button>
            </div>
          </fieldset>
        )}
      </div>
    </main>
  )
}

// O Contexto da empresa no onboarding (contexto-da-empresa 03): o andamento da leitura do site que o domínio
// confirmado começou, a falha com Tentar de novo e a saída para Configurações. Nada aqui bloqueia a conclusão.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCarregamento, useFonteDoContextoDaEmpresa } from '@/fonte/contexto'
import { MOTIVOS_DA_FALHA_DA_GERACAO, type ContextoDaEmpresa } from '@/fonte/contexto-da-empresa-tipos'
import { ENDERECO_DO_CONTEXTO, pendenciaDoContexto } from '@/fonte/contexto-no-onboarding'
import { mensagemDeErro } from '@/lib/utils'
import { INTERVALO_DO_ANDAMENTO_MS } from '../configuracoes/secao-contexto-da-empresa'
import { BOTAO_SECUNDARIO } from './componentes'

/** O contexto do Workspace, relido de tempos em tempos enquanto o site é lido no servidor. */
export function useContextoComAndamento() {
  const fonte = useFonteDoContextoDaEmpresa()
  const carregamento = useCarregamento(fonte, (f) => f.contexto(), [])
  const { dados, recarregar } = carregamento
  const gerando = dados?.geracao?.estado === 'gerando'
  useEffect(() => {
    if (!gerando) return
    const relogio = setInterval(recarregar, INTERVALO_DO_ANDAMENTO_MS)
    return () => clearInterval(relogio)
  }, [gerando, recarregar])
  return carregamento
}

/** `erroAoComecar`: por que a geração pedida ao confirmar o site não começou, até a pessoa tentar de novo. */
export function PainelDoContextoNoOnboarding({
  contexto,
  erroAoComecar = '',
}: {
  contexto: ContextoDaEmpresa | undefined
  erroAoComecar?: string
}) {
  const fonte = useFonteDoContextoDaEmpresa()
  const [erroAoGerar, setErro] = useState<string | null>(null)
  const erro = erroAoGerar ?? erroAoComecar
  const [gerando, setGerando] = useState(false)

  async function gerar() {
    setGerando(true)
    setErro('')
    try {
      await fonte.gerar()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    } finally {
      setGerando(false)
    }
  }

  if (!contexto) return null
  const pendencia = pendenciaDoContexto(contexto)
  const configuracoes = (
    <Link className="font-medium underline underline-offset-4" to={ENDERECO_DO_CONTEXTO}>
      {pendencia === 'sem_site'
        ? 'Informar o site em Configurações'
        : pendencia === 'falha' || erro
          ? 'Escrever à mão em Configurações'
          : 'Abrir em Configurações'}
    </Link>
  )
  return (
    <section aria-label="Contexto da empresa" className="rounded-xl flex flex-col gap-3 border border-al-line p-4">
      <p className="rotulo">Contexto da empresa</p>
      <p aria-live="polite">
        {pendencia === null &&
          'Pronto: Empresa, Perfil de cliente ideal e Personas já valem para os Agentes e o Mercado. Você pode revisar e editar em Configurações.'}
        {pendencia === 'gerando' &&
          `Lendo o site ${contexto.geracao?.site ?? contexto.site} para escrever o contexto. Você pode concluir agora: ele fica vigente sozinho quando a leitura terminar.`}
        {pendencia === 'falha' &&
          contexto.geracao?.estado === 'falha' &&
          MOTIVOS_DA_FALHA_DA_GERACAO[contexto.geracao.motivo]}
        {pendencia === 'sem_site' &&
          'O site ficou para depois. Informe-o em Configurações para gerar o contexto. Você pode concluir o onboarding assim mesmo.'}
        {pendencia === 'sem_contexto' && `A leitura de ${contexto.site} ainda não começou.`}
      </p>
      {erro && <p role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {(pendencia === 'falha' || pendencia === 'sem_contexto') && contexto.site && (
          <button type="button" className={BOTAO_SECUNDARIO} disabled={gerando} onClick={() => void gerar()}>
            {pendencia === 'falha' ? 'Tentar de novo' : 'Gerar contexto'}
          </button>
        )}
        {configuracoes}
      </div>
    </section>
  )
}

import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useDadosDeSinais } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { AvisoDaVarredura } from './aviso-da-varredura'
import { NICHOS, PAINEIS_DE_MERCADO, nichoPorLetra, nichoPorSlug } from './nichos'

/** A lista dos nichos. Os painéis de contexto ficam dentro de cada um. */
export function PaginaIndiceDeMercado() {
  return (
    <Pagina titulo="Mercado" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
      <section aria-label="Nichos" className="flex max-w-3xl flex-col gap-4">
        <p className="text-sm text-al-muted">
          Painéis de contexto do nicho: volume, regra e impacto. Não são Sinais de uma empresa.
        </p>
        <ul className="flex flex-col border-t border-al-line">
          {NICHOS.map((nicho) => (
            <li key={nicho.slug} className="border-b border-al-line py-3">
              <Link to={`/sinais/mercado/${nicho.slug}`} className="text-base hover:text-al-accent hover:underline">
                {nicho.nome}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Pagina>
  )
}

/** A vista dos Sinais de mercado de um nicho, e os painéis que não apontam uma empresa. */
export function PaginaDeSinaisDeMercado() {
  const { icp = '' } = useParams<{ icp: string }>()
  const [parametros] = useSearchParams()
  const tipo = parametros.get('tipo') ?? ''
  const porLetra = nichoPorLetra(icp)
  const nicho = porLetra ?? nichoPorSlug(icp)
  const letra = nicho?.letra ?? ''
  const { dados: cascatas, carregando: carregandoCascatas, erro: erroCascatas, recarregar: recarregarCascatas } = useDadosDeSinais(
    (f) => f.cascatas(),
    [],
  )
  const { dados: sinais, carregando: carregandoSinais, erro: erroSinais, recarregar: recarregarSinais } = useDadosDeSinais(
    (f) => f.sinaisDeMercado(letra),
    [letra],
  )

  if (porLetra) {
    const busca = parametros.toString()
    return <Navigate to={`/sinais/mercado/${porLetra.slug}${busca ? `?${busca}` : ''}`} replace />
  }
  if (!nicho) return <Navigate to="/sinais" replace />
  const paineis = PAINEIS_DE_MERCADO.filter((painel) => painel.nichos.includes(nicho.slug))
  const cascata = cascatas?.find((c) => c.tipo === tipo && c.icp === nicho.letra && c.escopo === 'mercado')
  const carregando = (carregandoCascatas && !cascatas) || (carregandoSinais && !sinais)
  if (carregando) {
    return (
      <Pagina titulo={nicho.nome} voltar={{ para: '/sinais/mercado', rotulo: 'Mercado' }}>
        <Carregando />
      </Pagina>
    )
  }

  return (
    <Pagina titulo={nicho.nome} voltar={{ para: '/sinais/mercado', rotulo: 'Mercado' }}>
      <section aria-label="Sinais de mercado" className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-lg">{nicho.nome}</h2>
          {cascata && <p className="text-base">{cascata.nome}</p>}
          <p className="text-sm text-al-muted">Movimento do mercado deste nicho no Workspace. Não é de uma Conta.</p>
        </div>

        {paineis.length > 0 && (
          <ul aria-label="Painéis de contexto" className="flex flex-col gap-3">
            {paineis.map((painel) => (
              <li key={painel.id} className="rounded-xl border border-al-line p-4">
                <p className="text-base">{painel.nome}</p>
                <p className="text-sm text-al-muted">{painel.frase}</p>
              </li>
            ))}
          </ul>
        )}

        {(erroCascatas || erroSinais) && (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm text-al-muted">Não foi possível carregar os Sinais de mercado.</p>
            <button
              type="button"
              onClick={() => {
                recarregarCascatas()
                recarregarSinais()
              }}
              className={BOTAO_SECUNDARIO}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {sinais && sinais.length === 0 && !erroSinais && tipo && (
          <p className="text-sm text-al-muted">Nenhum Sinal de mercado deste nicho ainda.</p>
        )}

        {sinais && sinais.length > 0 && (
          <ul className="flex flex-col divide-y divide-al-line border-y border-al-line">
            {sinais.map((sinal) => (
              <li key={sinal.id} className="flex flex-col gap-1 py-4">
                <p className="text-base">{sinal.frase}</p>
                <p className="text-sm text-al-muted">
                  {sinal.nome} · {formatarDataCompleta(sinal.data)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {cascata?.estado === 'disponivel' && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-al-muted">
              Para receber este Sinal de novo, crie um Monitoramento. Ele usa o ICP do Workspace e só roda sozinho dentro
              do limite de créditos e do modo da varredura.
            </p>
            <AvisoDaVarredura />
            <Link to={`/sinais/cascatas/${cascata.tipo}/novo`} className={BOTAO_PRIMARIO}>
              Criar Monitoramento
            </Link>
          </div>
        )}

        {cascata?.estado === 'em-teste' && (
          <p className="text-sm text-al-muted">Em validação com dados reais: ainda não dá para monitorar.</p>
        )}

        {cascata?.estado === 'sem-fonte' && <p className="text-sm text-al-muted">{cascata.motivo}</p>}
      </section>
    </Pagina>
  )
}

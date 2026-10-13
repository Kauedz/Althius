import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { useDadosDeSinais } from '@/fonte/contexto'
import { formatarDataCompleta } from '@/fonte/formatar-data'
import { ICPS_DO_MAPA } from '@/fonte/mapa-de-cascatas'
import { AvisoDaVarredura } from './aviso-da-varredura'

/** A vista dos Sinais de mercado de um ICP do Workspace, e como ativar o Monitoramento quando a cascata já roda. */
export function PaginaDeSinaisDeMercado() {
  const { icp = '' } = useParams<{ icp: string }>()
  const [parametros] = useSearchParams()
  const tipo = parametros.get('tipo') ?? ''
  const mapa = ICPS_DO_MAPA.find((item) => item.id === icp)
  const { dados: cascatas, carregando: carregandoCascatas, erro: erroCascatas, recarregar: recarregarCascatas } = useDadosDeSinais(
    (f) => f.cascatas(),
    [],
  )
  const { dados: sinais, carregando: carregandoSinais, erro: erroSinais, recarregar: recarregarSinais } = useDadosDeSinais(
    (f) => f.sinaisDeMercado(icp),
    [icp],
  )

  if (!mapa) return <Navigate to="/sinais" replace />
  const cascata = cascatas?.find((c) => c.tipo === tipo && c.icp === icp && c.escopo === 'mercado')
  const carregando = (carregandoCascatas && !cascatas) || (carregandoSinais && !sinais)
  if (carregando) {
    return (
      <Pagina titulo="Sinais de mercado" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
        <Carregando />
      </Pagina>
    )
  }

  return (
    <Pagina titulo="Sinais de mercado" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
      <section aria-label="Sinais de mercado" className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="titulo-secao text-lg">
            {mapa.id} · {mapa.nome}
          </h2>
          {cascata && <p className="text-base">{cascata.nome}</p>}
          <p className="text-sm text-al-muted">Movimento do mercado deste ICP no Workspace. Não é de uma Conta.</p>
          {mapa.restricao && <p className="text-sm text-al-muted">{mapa.restricao}</p>}
        </div>

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

        {sinais && sinais.length === 0 && !erroSinais && (
          <p className="text-sm text-al-muted">Nenhum Sinal de mercado deste ICP ainda.</p>
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

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Carregando } from '@/components/marca'
import { Pagina } from '@/components/pagina'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Opcao } from '@/components/opcao'
import { useAmbiente, useDados, useDadosDeContas, useDadosDeSinais } from '@/fonte/contexto'
import { ICPS_DO_MAPA } from '@/fonte/mapa-de-cascatas'
import { NOME_DO_PUBLICO_RECOMENDADO, publicoRecomendado } from '@/fonte/regras-memoria'
import type { CascataDoCatalogo } from '@/fonte/sinais-tipos'
import { SecaoDoFormulario } from './componentes'
import { AvisoDaVarredura } from './aviso-da-varredura'
import { useSinaisDoMockup } from './estado'

/** O fluxo de criação de Monitoramento já preenchido com uma cascata disponível. */
export function RotaDoEditorDeCascata() {
  const { tipo = '' } = useParams<{ tipo: string }>()
  const { dados, carregando, erro, recarregar } = useDadosDeSinais((f) => f.cascatas(), [])
  if (carregando && !dados) return <Carregando />
  if (erro) {
    return (
      <Pagina titulo="Novo monitoramento" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-al-muted">Não foi possível carregar este Sinal.</p>
          <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
            Tentar de novo
          </button>
        </div>
      </Pagina>
    )
  }
  const cascata = dados?.find((c) => c.tipo === tipo)
  if (!cascata || cascata.estado !== 'disponivel') {
    return (
      <Pagina titulo="Novo monitoramento" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
        <p className="max-w-xl text-sm text-al-muted">
          {cascata?.estado === 'sem-fonte'
            ? cascata.motivo
            : 'Este Sinal ainda não está disponível para Monitoramento.'}
        </p>
      </Pagina>
    )
  }
  return <EditorDeCascata key={cascata.tipo} cascata={cascata} />
}

function EditorDeCascata({ cascata }: { cascata: CascataDoCatalogo }) {
  const navegar = useNavigate()
  const { salvar } = useSinaisDoMockup()
  const operacional = useAmbiente().modo === 'real'
  const icp = ICPS_DO_MAPA.find((item) => item.id === cascata.icp)
  const memoria = useDados((fonte) => fonte.memoriaDoWorkspace(), [])
  const recomendado = memoria ? publicoRecomendado(memoria.icp.secoes) : null
  const [nome, setNome] = useState(cascata.nome)
  const [contas, setContas] = useState<string[]>([])
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const nomeValido = nome.trim().length > 0

  const gravar = async (estado: 'rascunho' | 'ativo') => {
    try {
      setErroSalvar(null)
      await salvar({
        tipoId: cascata.tipo,
        nome: nome.trim(),
        estado,
        publico: operacional
          ? { modo: 'listas', listas: contas, usaRecomendado: false }
          : { modo: 'listas', listas: [], usaRecomendado: true },
        criterios: {},
      })
      navegar('/sinais', {
        state: { aviso: estado === 'ativo' ? `“${nome.trim()}” está ativo.` : `Rascunho “${nome.trim()}” salvo.` },
      })
    } catch (erro) {
      setErroSalvar(erro instanceof Error ? erro.message : 'Não foi possível salvar o Monitoramento. Tente de novo.')
    }
  }

  return (
    <Pagina titulo="Novo monitoramento" voltar={{ para: '/sinais', rotulo: 'Sinais' }}>
      <div className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-al-muted">
            {icp ? `${icp.id} · ${icp.nome}` : `ICP ${cascata.icp}`}
            {icp?.restricao ? ` · ${icp.restricao}` : ''}
          </p>
          {cascata.escopo === 'mercado' && (
            <p className="text-sm text-al-muted">Os Sinais aparecem em Sinais de mercado, não numa Conta.</p>
          )}
        </div>

        {erroSalvar && (
          <div role="alert" className="rounded-xl bg-al-erro/10 px-4 py-3 text-sm text-al-erro">
            {erroSalvar}
          </div>
        )}

        <SecaoDoFormulario numero="01" titulo="Nome" descricao="Para reconhecer a finalidade entre vários Monitoramentos do mesmo tipo.">
          <label className="flex flex-col gap-2">
            <span className="rotulo text-al-ink">Nome do monitoramento</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="campo h-10" />
          </label>
        </SecaoDoFormulario>

        {operacional ? (
          <PublicoDeContas contas={contas} aoMudar={setContas} />
        ) : (
          <SecaoDoFormulario
            numero="02"
            titulo="Público"
            descricao="O Monitoramento acompanha o ICP vigente do Workspace. Não descobre empresas fora dele."
          >
            <aside aria-label="Público recomendado" className="rounded-xl flex flex-col gap-2 border border-al-line bg-al-surface p-4">
              <p className="text-base">{NOME_DO_PUBLICO_RECOMENDADO}</p>
              {recomendado?.resumo && <p className="text-sm text-al-muted">{recomendado.resumo}</p>}
              <p className="text-sm text-al-muted">
                Vem do ICP vigente na{' '}
                <Link to="/configuracoes/memoria" className="text-al-ink underline-offset-4 hover:underline">
                  Memória do Workspace
                </Link>
                .
              </p>
            </aside>
          </SecaoDoFormulario>
        )}

        <AvisoDaVarredura />

        <div className="flex flex-wrap justify-end gap-2 border-t border-al-line py-4">
          <button type="button" disabled={!nomeValido} onClick={() => void gravar('rascunho')} className={BOTAO_SECUNDARIO}>
            Salvar rascunho
          </button>
          <button type="button" disabled={!nomeValido} onClick={() => void gravar('ativo')} className={BOTAO_PRIMARIO}>
            Ativar monitoramento
          </button>
        </div>
      </div>
    </Pagina>
  )
}

function PublicoDeContas({ contas, aoMudar }: { contas: string[]; aoMudar: (contas: string[]) => void }) {
  const { dados, erro, recarregar } = useDadosDeContas((f) => f.contas(), [])
  const alternar = (id: string) => aoMudar(contas.includes(id) ? contas.filter((item) => item !== id) : [...contas, id])
  return (
    <SecaoDoFormulario numero="02" titulo="Público" descricao="As Contas-alvo do Workspace, o público do ICP.">
      {erro ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-al-muted">Não foi possível carregar as Contas-alvo.</p>
          <button type="button" onClick={recarregar} className={BOTAO_SECUNDARIO}>
            Tentar de novo
          </button>
        </div>
      ) : !dados ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <p className="text-sm text-al-muted">
          Nenhuma Conta-alvo neste Workspace. Cadastre ou importe em{' '}
          <Link to="/contas" className="text-al-ink underline-offset-4 hover:underline">
            Contas
          </Link>{' '}
          para escolher o público.
        </p>
      ) : (
        <div role="group" aria-label="Contas-alvo" className="flex flex-wrap gap-2">
          {dados.map((conta) => (
            <Opcao key={conta.id} marcada={contas.includes(conta.id)} aoClicar={() => alternar(conta.id)}>
              {conta.nome}
              {conta.dominio && <span className="text-al-muted"> · {conta.dominio}</span>}
            </Opcao>
          ))}
        </div>
      )}
    </SecaoDoFormulario>
  )
}

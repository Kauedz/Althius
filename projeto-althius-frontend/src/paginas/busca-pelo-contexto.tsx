// A busca de contas pelo Contexto da empresa (contexto-da-empresa, ticket 04). O diálogo mostra um recorte por perfil do
// Perfil de cliente ideal salvo: os filtros preenchidos e editáveis, de onde cada um saiu no texto e o que a fonte não
// aplica. Ajustar aqui vale só para esta busca; o contexto salvo não muda. O aviso da última busca separa falha da
// fonte de zero resultados, e nenhum dos dois diz que o mercado não existe.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Carregando } from '@/components/marca'
import { EtiquetasDeTexto } from '@/components/etiquetas-de-texto'
import { type OpcaoDaSelecao, SelecaoMultipla } from '@/components/selecao-multipla'
import { ENDERECO_DO_CONTEXTO } from '@/fonte/contexto-no-onboarding'
import {
  type CriteriosDaBusca,
  NOMES_DOS_CONCEITOS,
  type PerfilDaBusca,
  type PreparacaoDaBusca,
  type UltimaBuscaDeContas,
} from '@/fonte/descobertas-tipos'

export interface OpcoesDosFiltros {
  setores: OpcaoDaSelecao[]
  portes: (fonte: CriteriosDaBusca['fonte']) => OpcaoDaSelecao[]
  /** Nulas enquanto as localidades e os CNAEs carregam. */
  regioes: OpcaoDaSelecao[] | null
  cnaes: OpcaoDaSelecao[] | null
}

export type PerfilParaBuscar = Pick<PerfilDaBusca, 'nome' | 'criterios' | 'aplicados' | 'pendentes'>

/** Uma recusa mostrada no diálogo, com o código do servidor quando há (por exemplo, `contexto_mudou`). */
export interface ErroNaTela {
  mensagem: string
  codigo?: string
}

/** O que falta para o recorte ter por onde começar, como no servidor; nulo quando basta. */
function faltaNoPerfil(criterios: CriteriosDaBusca): string | null {
  if (criterios.fonte === 'receita') return criterios.cnaes.length ? null : 'informe ao menos um CNAE.'
  return criterios.setores.length || criterios.palavrasChave.length ? null : 'informe ao menos um setor ou uma palavra-chave.'
}

export function DialogoDaBuscaPeloContexto({
  preparacao,
  opcoes,
  custo,
  erro,
  enviando,
  aoConfirmar,
  aoCancelar,
  aoPreparar,
}: {
  /** Nula enquanto prepara, ou quando a leitura falhou (o `erro` diz o quê). */
  preparacao: PreparacaoDaBusca | null
  opcoes: OpcoesDosFiltros
  custo: string
  erro: ErroNaTela | null
  enviando: boolean
  aoConfirmar: (perfis: PerfilParaBuscar[]) => void
  aoCancelar: () => void
  aoPreparar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-label="Confirmar filtros da busca"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-al-line bg-al-surface p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-al-ink">Confirmar filtros da busca</h3>
        {!preparacao && erro ? (
          // Não deu para ler o contexto (rede, permissão): não é falha de tradução nem mercado vazio.
          <FalhaComNovaTentativa mensagem={erro.mensagem} aoPreparar={aoPreparar} aoCancelar={aoCancelar} />
        ) : !preparacao ? (
          <div className="py-8">
            <Carregando rotulo="Lendo o Perfil de cliente ideal" />
          </div>
        ) : preparacao.estado === 'sem_contexto' ? (
          <SemContexto mensagem={preparacao.mensagem} aoCancelar={aoCancelar} />
        ) : preparacao.estado === 'falha_traducao' ? (
          <FalhaComNovaTentativa
            mensagem={preparacao.mensagem ?? 'Não conseguimos traduzir o Perfil de cliente ideal em filtros agora.'}
            aoPreparar={aoPreparar}
            aoCancelar={aoCancelar}
          />
        ) : (
          <FormularioDosPerfis
            // Uma preparação nova recomeça os ajustes: filtros de outra versão não se misturam.
            key={`${preparacao.contextoVersao}`}
            preparacao={preparacao}
            opcoes={opcoes}
            custo={custo}
            erro={erro}
            enviando={enviando}
            aoConfirmar={aoConfirmar}
            aoCancelar={aoCancelar}
            aoPreparar={aoPreparar}
          />
        )}
      </div>
    </div>
  )
}

function SemContexto({ mensagem, aoCancelar }: { mensagem?: string; aoCancelar: () => void }) {
  return (
    <>
      <p className="mt-3 text-sm text-al-ink">{mensagem ?? 'O Contexto da empresa ainda não tem o Perfil de cliente ideal.'}</p>
      <p className="mt-2 text-sm">
        <Link className="font-medium text-al-ink underline underline-offset-4" to={ENDERECO_DO_CONTEXTO}>
          Abrir Contexto da empresa
        </Link>
      </p>
      <div className="mt-6 flex justify-end">
        <Button type="button" variant="outline" onClick={aoCancelar}>Fechar</Button>
      </div>
    </>
  )
}

function FalhaComNovaTentativa({ mensagem, aoPreparar, aoCancelar }: { mensagem: string; aoPreparar: () => void; aoCancelar: () => void }) {
  return (
    <>
      <p role="alert" className="mt-3 text-sm text-al-atencao">{mensagem}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoCancelar}>Fechar</Button>
        <Button type="button" onClick={aoPreparar} className="bg-al-accent text-al-on-accent hover:bg-al-accent-2">Tentar de novo</Button>
      </div>
    </>
  )
}

function FormularioDosPerfis({
  preparacao,
  opcoes,
  custo,
  erro,
  enviando,
  aoConfirmar,
  aoCancelar,
  aoPreparar,
}: {
  preparacao: PreparacaoDaBusca
  opcoes: OpcoesDosFiltros
  custo: string
  erro: ErroNaTela | null
  enviando: boolean
  aoConfirmar: (perfis: PerfilParaBuscar[]) => void
  aoCancelar: () => void
  aoPreparar: () => void
}) {
  const [perfis, setPerfis] = useState(() => preparacao.perfis.map((p) => ({ ...p, incluir: true })))
  const mudar = (indice: number, mudanca: Partial<(typeof perfis)[number]>) =>
    setPerfis((atuais) => atuais.map((p, i) => (i === indice ? { ...p, ...mudanca } : p)))
  const incluidos = perfis.filter((p) => p.incluir)
  const faltas = incluidos.flatMap((p) => {
    const falta = faltaNoPerfil(p.criterios)
    return falta ? [`${p.nome}: ${falta}`] : []
  })
  const podeBuscar = incluidos.length > 0 && faltas.length === 0 && !enviando

  return (
    <>
      <p className="mt-1 text-xs text-al-muted">
        {`Filtros da versão ${preparacao.contextoVersao} do Perfil de cliente ideal. Ajustar aqui vale só para esta busca; o Contexto da empresa não muda.`}
      </p>
      <div className="mt-4 grid min-h-0 gap-4 overflow-y-auto pr-1">
        {perfis.map((perfil, indice) => {
          const c = perfil.criterios
          const atualizar = (parcial: Partial<CriteriosDaBusca>) => mudar(indice, { criterios: { ...c, ...parcial } })
          return (
            <fieldset key={`${perfil.nome}-${indice}`} className="grid gap-3 rounded-xl border border-al-line p-4">
              <legend className="px-1 text-sm font-semibold text-al-ink">{perfil.nome}</legend>
              <label className="flex items-center gap-2 text-xs text-al-ink">
                <input type="checkbox" checked={perfil.incluir} onChange={(e) => mudar(indice, { incluir: e.target.checked })} />
                Incluir na busca
              </label>
              {perfil.incluir && (
                <>
                  <SelecaoMultipla rotulo="Setores" opcoes={opcoes.setores} selecionadas={c.setores} aoMudar={(setores) => atualizar({ setores })} />
                  <EtiquetasDeTexto rotulo="Palavras-chave" valores={c.palavrasChave} aoMudar={(palavrasChave) => atualizar({ palavrasChave })} />
                  <SelecaoMultipla rotulo="Porte (faixas)" opcoes={opcoes.portes(c.fonte)} selecionadas={c.portes} aoMudar={(portes) => atualizar({ portes })} />
                  {opcoes.regioes ? (
                    <SelecaoMultipla rotulo="Região" opcoes={opcoes.regioes} selecionadas={c.regioes} aoMudar={(regioes) => atualizar({ regioes })} dica="Buscar estado ou cidade" />
                  ) : (
                    <Carregando rotulo="Carregando as localidades" />
                  )}
                  {c.fonte === 'receita' && opcoes.cnaes && (
                    <SelecaoMultipla rotulo="CNAEs" opcoes={opcoes.cnaes} selecionadas={c.cnaes} aoMudar={(cnaes) => atualizar({ cnaes })} dica="Buscar por código ou descrição" />
                  )}
                  <EtiquetasDeTexto rotulo="Excluir" valores={c.excluir} aoMudar={(excluir) => atualizar({ excluir })} />
                </>
              )}
              {perfil.aplicados.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-al-muted">Do texto</p>
                  <ul aria-label="Aplicado do texto" className="mt-1 grid gap-1 text-xs text-al-ink">
                    {perfil.aplicados.map((a, i) => (
                      <li key={i}>
                        <span className="font-medium">{`${NOMES_DOS_CONCEITOS[a.conceito]}: ${a.valor}`}</span>{' '}
                        <span className="text-al-muted">“{a.trecho}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {perfil.pendentes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-al-atencao">Não aplicado pela fonte (verificar depois)</p>
                  <ul aria-label="Não aplicado pela fonte" className="mt-1 grid gap-1 text-xs text-al-ink">
                    {perfil.pendentes.map((p, i) => (
                      <li key={i}>
                        <span className="font-medium">{`${NOMES_DOS_CONCEITOS[p.conceito]}: ${p.valor}`}</span>
                        {` — ${p.explicacao}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </fieldset>
          )
        })}
      </div>
      {faltas.map((falta) => (
        <p key={falta} className="mt-3 text-xs text-al-atencao">{falta}</p>
      ))}
      {incluidos.length === 0 && <p className="mt-3 text-xs text-al-atencao">Inclua ao menos um perfil na busca.</p>}
      <p className="mt-3 text-xs text-al-muted">{custo}</p>
      {erro && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-al-atencao">{erro.mensagem}</p>
          {erro.codigo === 'contexto_mudou' && (
            <Button type="button" variant="outline" size="sm" onClick={aoPreparar}>Preparar de novo</Button>
          )}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoCancelar}>Cancelar</Button>
        <Button
          type="button"
          disabled={!podeBuscar}
          onClick={() => aoConfirmar(incluidos.map(({ nome, criterios, aplicados, pendentes }) => ({ nome, criterios, aplicados, pendentes })))}
          className="bg-al-accent text-al-on-accent hover:bg-al-accent-2"
        >
          Confirmar
        </Button>
      </div>
    </>
  )
}

/** O desfecho da busca mais recente, quando ele pede atenção: zero resultados ou falha da fonte. */
export function AvisoDaUltimaBusca({ ultima }: { ultima: UltimaBuscaDeContas | null | undefined }) {
  if (!ultima || ultima.desfecho === 'em_andamento') return null
  if (ultima.desfecho === 'sem_resultados') {
    return (
      <p role="status" className="text-xs text-al-ink">
        A última busca não encontrou empresas neste recorte, nesta fonte. Isso não quer dizer que elas não existam no mercado: ajuste os filtros e busque de novo.
      </p>
    )
  }
  if (ultima.desfecho === 'falha_da_fonte') {
    const motivo = (ultima.mensagem ?? 'a fonte não respondeu').trim()
    return (
      <p role="status" className="text-xs text-al-atencao">
        {`A última busca falhou na fonte: ${/[.!?]$/.test(motivo) ? motivo : `${motivo}.`} Nada foi concluído sobre o mercado; tente de novo.`}
      </p>
    )
  }
  return ultima.mensagem ? <p role="status" className="text-xs text-al-muted">{ultima.mensagem}</p> : null
}

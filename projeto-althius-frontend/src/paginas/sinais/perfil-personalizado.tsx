import { X } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Carregando } from '@/components/marca'
import { BOTAO_SECUNDARIO } from '@/components/botoes'
import { Opcao } from '@/components/opcao'
import { cn } from '@/lib/utils'
import { useDadosDoBrasil, type Cnae, type Localidades } from './dados-do-brasil'
import {
  ESTADOS_FORA_DO_BRASIL,
  FAIXAS,
  PAISES,
  REGIOES_DO_BRASIL,
  type Faixa,
  type FaixaFirmografica,
  type OndeTemOCnae,
  type PerfilFirmografico,
} from './perfil'

const LIMITE_DE_SUGESTOES = 50

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** O perfil firmográfico do público personalizado: localização, porte e tempo de empresa, e atividade (CNAE). */
export function PerfilPersonalizado({ perfil, aoMudar }: { perfil: PerfilFirmografico; aoMudar: (perfil: PerfilFirmografico) => void }) {
  const dados = useDadosDoBrasil()
  const mudar = (parcial: Partial<PerfilFirmografico>) => aoMudar({ ...perfil, ...parcial })

  return (
    <div className="-mt-2 flex flex-col gap-3">
      <div role="group" aria-label="Perfil firmográfico" className="rounded-lg overflow-hidden flex flex-col divide-y divide-al-line border border-al-line">
        <Bloco titulo="Localização">
          <Localizacao perfil={perfil} localidades={dados?.localidades} mudar={mudar} />
        </Bloco>
        <Bloco titulo="Porte e tempo de empresa">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
            {FAIXAS.map((faixa) => (
              <CampoDeFaixa key={faixa.id} faixa={faixa} valor={perfil[faixa.id] ?? {}} aoMudar={(valor) => mudar({ [faixa.id]: valor })} />
            ))}
          </div>
        </Bloco>
        <Bloco titulo="Atividade econômica (CNAE)">
          {dados ? (
            <SeletorDeCnae
              cnae={dados.cnae}
              selecionados={perfil.cnaes ?? []}
              onde={perfil.ondeTemOCnae ?? 'principal'}
              aoMudar={(cnaes) => mudar({ cnaes })}
              aoMudarOnde={(ondeTemOCnae) => mudar({ ondeTemOCnae })}
            />
          ) : (
            <Carregando rotulo="Carregando a CNAE" />
          )}
        </Bloco>
      </div>
      <p className="text-xs text-al-muted">
        Deixe “Qualquer” onde não quiser restringir. Os locais escolhidos se somam. Vale só para este Monitoramento.
      </p>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-4 p-4">
      <h3 className="rotulo text-al-accent">{titulo}</h3>
      {children}
    </section>
  )
}

function Localizacao({
  perfil,
  localidades,
  mudar,
}: {
  perfil: PerfilFirmografico
  localidades?: Localidades
  mudar: (parcial: Partial<PerfilFirmografico>) => void
}) {
  const opcoes = useMemo(() => {
    if (!localidades) return undefined
    const regioes = perfil.regioes ?? []
    const ufs = perfil.ufs ?? []
    const idsDasIntermediarias = new Set(
      localidades.intermediarias.filter(([, nome, uf]) => (perfil.intermediarias ?? []).includes(`${nome} (${uf})`)).map(([id]) => id),
    )
    // Cada nível sugere só o que cabe nos níveis acima já escolhidos.
    const ufsPossiveis = localidades.ufs.filter(([, , regiao]) => regioes.length === 0 || regioes.includes(regiao))
    const naUf = (uf: string) => (ufs.length > 0 ? ufs.includes(uf) : ufsPossiveis.some(([sigla]) => sigla === uf))
    return {
      ufs: ufsPossiveis.map(([sigla, nome]) => ({ valor: sigla, detalhe: nome })),
      intermediarias: localidades.intermediarias.filter(([, , uf]) => naUf(uf)).map(([, nome, uf]) => ({ valor: `${nome} (${uf})` })),
      cidades: localidades.cidades
        .filter(([, uf, intermediaria]) => naUf(uf) && (idsDasIntermediarias.size === 0 || idsDasIntermediarias.has(intermediaria)))
        .map(([nome, uf]) => ({ valor: `${nome} (${uf})` })),
    }
  }, [localidades, perfil.regioes, perfil.ufs, perfil.intermediarias])

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-2">
        <span className="rotulo text-al-ink">País</span>
        <select
          value={perfil.pais ?? ''}
          // Trocar de país apaga os locais do país anterior.
          onChange={(e) =>
            mudar({ pais: e.target.value || undefined, regioes: [], ufs: [], intermediarias: [], cidades: [], estados: [] })
          }
          className="campo h-10 text-sm"
        >
          <option value="">Qualquer</option>
          {PAISES.map((pais) => (
            <option key={pais} value={pais}>
              {pais}
            </option>
          ))}
        </select>
      </label>

      {!perfil.pais && <p className="text-xs text-al-muted">Escolha um país para filtrar por estado, região ou cidade.</p>}

      {perfil.pais === 'Brasil' &&
        (opcoes ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-5">
            <SelecaoMultipla
              rotulo="Regiões"
              opcoes={REGIOES_DO_BRASIL.map((valor) => ({ valor }))}
              selecionadas={perfil.regioes ?? []}
              aoMudar={(regioes) => mudar({ regioes })}
            />
            <SelecaoMultipla rotulo="UFs" opcoes={opcoes.ufs} selecionadas={perfil.ufs ?? []} aoMudar={(ufs) => mudar({ ufs })} />
            <SelecaoMultipla
              rotulo="Regiões intermediárias (IBGE)"
              opcoes={opcoes.intermediarias}
              selecionadas={perfil.intermediarias ?? []}
              aoMudar={(intermediarias) => mudar({ intermediarias })}
            />
            <SelecaoMultipla
              rotulo="Cidades"
              opcoes={opcoes.cidades}
              selecionadas={perfil.cidades ?? []}
              aoMudar={(cidades) => mudar({ cidades })}
            />
          </div>
        ) : (
          <Carregando rotulo="Carregando as localidades" />
        ))}

      {perfil.pais && perfil.pais !== 'Brasil' && (
        <div className="max-w-md">
          <SelecaoMultipla
            rotulo="Estados"
            opcoes={(ESTADOS_FORA_DO_BRASIL[perfil.pais] ?? []).map((valor) => ({ valor }))}
            selecionadas={perfil.estados ?? []}
            aoMudar={(estados) => mudar({ estados })}
          />
        </div>
      )}
    </div>
  )
}

function CampoDeFaixa({ faixa, valor, aoMudar }: { faixa: FaixaFirmografica; valor: Faixa; aoMudar: (valor: Faixa) => void }) {
  const lerNumero = (texto: string) => (texto === '' ? undefined : Number(texto))
  // O máximo nunca fica abaixo do mínimo.
  const maximos = faixa.maximos.filter((d) => valor.min === undefined || d.valor >= valor.min)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="rotulo mb-2 text-al-ink">{faixa.rotulo}</legend>
      <div className="flex items-center gap-2">
        <select
          aria-label={`${faixa.rotulo}, mínimo`}
          value={valor.min ?? ''}
          onChange={(e) => {
            const min = lerNumero(e.target.value)
            aoMudar({ min, max: min !== undefined && valor.max !== undefined && valor.max < min ? undefined : valor.max })
          }}
          className="campo h-10 min-w-0 flex-1 text-sm"
        >
          <option value="">Qualquer</option>
          {faixa.minimos.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
        <span className="text-xs text-al-muted">a</span>
        <select
          aria-label={`${faixa.rotulo}, máximo`}
          value={valor.max ?? ''}
          onChange={(e) => aoMudar({ ...valor, max: lerNumero(e.target.value) })}
          className="campo h-10 min-w-0 flex-1 text-sm"
        >
          <option value="">Qualquer</option>
          {maximos.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}

const NIVEIS_DA_CNAE = [
  { chave: 'secoes', rotulo: 'Seção' },
  { chave: 'divisoes', rotulo: 'Divisão' },
  { chave: 'grupos', rotulo: 'Grupo' },
  { chave: 'classes', rotulo: 'Classe' },
  { chave: 'subclasses', rotulo: 'Subclasse' },
] as const

/** A CNAE em cinco níveis encadeados (cada um filtrado pelo anterior) e uma busca direta por código ou descrição. */
function SeletorDeCnae({
  cnae,
  selecionados,
  onde,
  aoMudar,
  aoMudarOnde,
}: {
  cnae: Cnae
  selecionados: string[]
  onde: OndeTemOCnae
  aoMudar: (cnaes: string[]) => void
  aoMudarOnde: (onde: OndeTemOCnae) => void
}) {
  const [caminho, setCaminho] = useState<string[]>([])

  const todas = useMemo(
    () => NIVEIS_DA_CNAE.flatMap(({ chave }) => (cnae[chave] as [string, string, string?][]).map(([codigo, descricao]) => ({ valor: codigo, detalhe: descricao }))),
    [cnae],
  )

  const opcoesDoNivel = (indice: number) => {
    const lista = cnae[NIVEIS_DA_CNAE[indice].chave] as [string, string, string?][]
    return indice === 0 ? lista : lista.filter(([, , pai]) => pai === caminho[indice - 1])
  }
  const maisProfundo = caminho[caminho.length - 1]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
        {NIVEIS_DA_CNAE.map(({ rotulo }, indice) => {
          const desativado = indice > 0 && !caminho[indice - 1]
          return (
            <label key={rotulo} className="flex min-w-0 flex-col gap-2">
              <span className="rotulo text-al-ink">{rotulo}</span>
              <select
                value={caminho[indice] ?? ''}
                disabled={desativado}
                // Escolher um nível limpa os de baixo.
                onChange={(e) => setCaminho([...caminho.slice(0, indice), ...(e.target.value ? [e.target.value] : [])])}
                className="campo h-10 min-w-0 text-sm disabled:opacity-50"
              >
                <option value="">{desativado ? `Escolha ${indice === 1 ? 'a seção' : 'o nível acima'}` : 'Qualquer'}</option>
                {!desativado &&
                  opcoesDoNivel(indice).map(([codigo, descricao]) => (
                    <option key={codigo} value={codigo}>
                      {codigo} · {descricao}
                    </option>
                  ))}
              </select>
            </label>
          )
        })}
      </div>
      <button
        type="button"
        disabled={!maisProfundo || selecionados.includes(maisProfundo)}
        onClick={() => aoMudar([...selecionados, maisProfundo])}
        className={cn(BOTAO_SECUNDARIO, 'self-start')}
      >
        Adicionar CNAE
      </button>

      <SelecaoMultipla rotulo="CNAEs" opcoes={todas} selecionadas={selecionados} aoMudar={aoMudar} dica="Buscar por código ou descrição, em qualquer nível" />

      <div role="radiogroup" aria-label="Onde a empresa tem o CNAE" className="flex flex-col gap-2">
        <span className="rotulo text-al-ink" aria-hidden>
          Onde a empresa tem o CNAE
        </span>
        <div className="flex flex-wrap gap-2">
          <Opcao papel="radio" marcada={onde === 'principal'} aoClicar={() => aoMudarOnde('principal')}>
            Só no principal
          </Opcao>
          <Opcao papel="radio" marcada={onde === 'principal-ou-secundario'} aoClicar={() => aoMudarOnde('principal-ou-secundario')}>
            Principal ou secundário
          </Opcao>
        </div>
      </div>
    </div>
  )
}

interface OpcaoDaSelecao {
  valor: string
  detalhe?: string
}

/** Escolha de vários itens com busca: as escolhas viram etiquetas removíveis acima do campo. */
function SelecaoMultipla({
  rotulo,
  opcoes,
  selecionadas,
  aoMudar,
  dica,
}: {
  rotulo: string
  opcoes: OpcaoDaSelecao[]
  selecionadas: string[]
  aoMudar: (selecionadas: string[]) => void
  dica?: string
}) {
  const id = useId()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(false)
  const detalhes = useMemo(() => new Map(opcoes.map((o) => [o.valor, o.detalhe])), [opcoes])

  const termo = normalizar(busca.trim())
  const encontradas = opcoes.filter(
    (o) => !selecionadas.includes(o.valor) && (!termo || normalizar(`${o.valor} ${o.detalhe ?? ''}`).includes(termo)),
  )
  const visiveis = encontradas.slice(0, LIMITE_DE_SUGESTOES)

  const escolher = (valor: string) => {
    aoMudar([...selecionadas, valor])
    setBusca('')
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="rotulo text-al-ink">
        {rotulo}
      </label>
      {selecionadas.length > 0 && (
        <ul aria-label={`${rotulo} escolhidas`} className="flex flex-wrap gap-1.5">
          {selecionadas.map((valor) => (
            <li key={valor} className="rounded-md flex max-w-full items-center gap-1 border border-al-accent/60 bg-al-accent/10 py-0.5 pr-1 pl-2 text-xs">
              <span className="truncate" title={detalhes.get(valor) ? `${valor} · ${detalhes.get(valor)}` : valor}>
                {valor}
                {detalhes.get(valor) && (
                  <>
                    {' · '}
                    <span className="text-al-muted">{detalhes.get(valor)}</span>
                  </>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remover ${valor}`}
                onClick={() => aoMudar(selecionadas.filter((s) => s !== valor))}
                className="grid size-5 shrink-0 place-items-center text-al-muted hover:text-al-ink"
              >
                <X strokeWidth={1.8} className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={aberta}
          aria-controls={`${id}-opcoes`}
          aria-autocomplete="list"
          value={busca}
          placeholder={dica ?? `Buscar e adicionar (${(opcoes.length - selecionadas.length).toLocaleString('pt-BR')})`}
          onChange={(e) => {
            setBusca(e.target.value)
            setAberta(true)
          }}
          onFocus={() => setAberta(true)}
          onBlur={() => setAberta(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberta(false)
            if (e.key === 'Enter' && visiveis[0]) {
              e.preventDefault()
              escolher(visiveis[0].valor)
            }
          }}
          className="campo h-10 text-sm placeholder:text-al-muted"
        />
        {aberta && (
          <ul
            id={`${id}-opcoes`}
            role="listbox"
            aria-label={`Opções de ${rotulo}`}
            className="rounded-lg absolute inset-x-0 top-full z-20 max-h-72 overflow-y-auto border border-al-line bg-al-surface shadow-lg"
          >
            {visiveis.map((opcao) => (
              <li
                key={opcao.valor}
                role="option"
                aria-selected={false}
                // Evita que o campo perca o foco antes do clique.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(opcao.valor)}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-al-bg"
              >
                {opcao.valor}
                {opcao.detalhe && (
                  <>
                    {' '}
                    <span className="text-al-muted">{opcao.detalhe}</span>
                  </>
                )}
              </li>
            ))}
            {visiveis.length === 0 && <li className="px-3 py-2 text-sm text-al-muted">Nada encontrado.</li>}
            {encontradas.length > visiveis.length && (
              <li className="px-3 py-2 text-xs text-al-muted">
                Mostrando {visiveis.length} de {encontradas.length.toLocaleString('pt-BR')}. Digite para refinar.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

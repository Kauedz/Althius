import { Upload } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@/components/botoes'
import { Mensagem } from '@/components/mensagem'
import { useFonteDoPlaybook } from '@/fonte/contexto'
import { csvDaAba, previaDaPlanilha, type AbaLida, type PreviaDaPlanilha } from '@/fonte/playbook-planilha'
import type { IdDaSecaoDoPlaybook } from '@/fonte/playbook-tipos'
import { mensagemDeErro } from '@/lib/utils'

/** Lê as abas de um .xlsx. A biblioteca só é carregada quando alguém escolhe uma planilha. */
async function lerAbasCarregandoABiblioteca(arquivo: File): Promise<AbaLida[]> {
  const { lerAbasDoXlsx } = await import('@/fonte/ler-xlsx')
  return lerAbasDoXlsx(arquivo)
}

const TAMANHO_DA_AMOSTRA = 220

function amostra(texto: string): string {
  return texto.length > TAMANHO_DA_AMOSTRA ? `${texto.slice(0, TAMANHO_DA_AMOSTRA)}…` : texto
}

/**
 * Importar a planilha do playbook do setup: o Administrador escolhe o .xlsx, vê a prévia seção por seção e só então
 * confirma. As abas conhecidas viram o texto da seção (uma versão nova cada), as demais são listadas como não
 * importadas e a Base de Pesquisa segue para a importação de Contas-alvo por CSV.
 */
export function ImportarPlaybook({
  lerArquivo = lerAbasCarregandoABiblioteca,
}: {
  lerArquivo?: (arquivo: File) => Promise<AbaLida[]>
}) {
  const fonte = useFonteDoPlaybook()
  const [previa, setPrevia] = useState<PreviaDaPlanilha | null>(null)
  const [versoesVigentes, setVersoesVigentes] = useState<Partial<Record<IdDaSecaoDoPlaybook, number>>>({})
  const [escolhidas, setEscolhidas] = useState<Set<IdDaSecaoDoPlaybook>>(new Set())
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState('')

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setLendo(true)
    setErro('')
    setResultado('')
    setPrevia(null)
    try {
      const nova = previaDaPlanilha(await lerArquivo(arquivo))
      const atuais = await Promise.all(nova.secoes.map(async ({ id }) => [id, (await fonte.secao(id)).vigente?.versao] as const))
      setVersoesVigentes(Object.fromEntries(atuais.filter(([, versao]) => versao !== undefined)))
      setEscolhidas(new Set(nova.secoes.map(({ id }) => id)))
      setPrevia(nova)
    } catch {
      setErro('Não consegui ler esta planilha. Envie o arquivo .xlsx do playbook do setup.')
    } finally {
      setLendo(false)
      e.target.value = ''
    }
  }

  async function importar() {
    if (!previa) return
    setImportando(true)
    setErro('')
    setResultado('')
    const feitas: string[] = []
    try {
      for (const secao of previa.secoes.filter(({ id }) => escolhidas.has(id))) {
        await fonte.salvar(secao.id, { texto: secao.texto, linhas: [] })
        feitas.push(secao.nome)
      }
      setResultado(`${feitas.length} ${feitas.length === 1 ? 'seção importada' : 'seções importadas'}.`)
      setPrevia(null)
    } catch (falha) {
      const importadas = feitas.length ? ` Já importadas: ${feitas.join(', ')}.` : ''
      setErro(`${mensagemDeErro(falha)}${importadas}`)
    } finally {
      setImportando(false)
    }
  }

  function baixarBase(base: AbaLida) {
    const url = URL.createObjectURL(new Blob(['﻿' + csvDaAba(base.linhas)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'base-de-pesquisa.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const empresas = Math.max((previa?.baseDePesquisa?.linhas.length ?? 1) - 1, 0)

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Escolher a planilha" className="flex flex-col gap-3">
        <h3 className="titulo-secao text-2xl">Importar a planilha do setup</h3>
        <p className="text-sm text-al-muted">
          Escolha o .xlsx do playbook. Você confere a prévia de cada seção antes de gravar; nada é gravado sem a sua
          confirmação, e cada seção importada vira uma versão nova que dá para restaurar.
        </p>
        <div>
          <label className={`${BOTAO_SECUNDARIO} cursor-pointer`}>
            <Upload strokeWidth={1.8} className="size-4" aria-hidden />
            Escolher planilha (.xlsx)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={escolher}
              disabled={lendo || importando}
              className="sr-only"
            />
          </label>
        </div>
        {lendo && <p role="status" className="text-sm text-al-muted">Lendo a planilha…</p>}
        <Mensagem tipo="erro">{erro}</Mensagem>
        <Mensagem tipo="sucesso">{resultado}</Mensagem>
      </section>

      {previa && (
        <>
          <section aria-label="Seções encontradas" className="flex flex-col gap-4 border-t border-al-line pt-6">
            <h4 className="rotulo">Seções encontradas</h4>
            {previa.secoes.length === 0 ? (
              <p className="text-sm text-al-muted">Nenhuma aba desta planilha corresponde a uma seção do Playbook.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-al-line">
                {previa.secoes.map((secao) => (
                  <li key={secao.id} className="flex flex-col gap-2 py-3">
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={escolhidas.has(secao.id)}
                        onChange={(e) =>
                          setEscolhidas((atuais) => {
                            const novas = new Set(atuais)
                            if (e.target.checked) novas.add(secao.id)
                            else novas.delete(secao.id)
                            return novas
                          })
                        }
                      />
                      <span className="text-al-ink">{secao.nome}</span>
                      <span className="text-al-muted">da aba “{secao.aba}”</span>
                      {versoesVigentes[secao.id] !== undefined && (
                        <span className="selo border-al-atencao/60">
                          Substitui a versão {versoesVigentes[secao.id]}
                        </span>
                      )}
                    </label>
                    <p className="whitespace-pre-wrap pl-7 text-sm text-al-muted">{amostra(secao.texto)}</p>
                  </li>
                ))}
              </ul>
            )}
            <div>
              <button
                type="button"
                onClick={importar}
                disabled={importando || escolhidas.size === 0}
                className={BOTAO_PRIMARIO}
              >
                Importar {escolhidas.size} {escolhidas.size === 1 ? 'seção' : 'seções'}
              </button>
            </div>
          </section>

          {previa.baseDePesquisa && (
            <section aria-label="Base de Pesquisa" className="flex flex-col gap-3 border-t border-al-line pt-6">
              <h4 className="rotulo">Base de Pesquisa</h4>
              <p className="text-sm text-al-muted">
                A aba “{previa.baseDePesquisa.nome}” tem as empresas do TAM ({empresas} {empresas === 1 ? 'linha' : 'linhas'} depois
                do cabeçalho). Elas entram como Contas-alvo pela importação de CSV: baixe o arquivo abaixo e
                envie em Contas → Importar CSV.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => baixarBase(previa.baseDePesquisa!)} className={BOTAO_SECUNDARIO}>
                  Baixar a Base de Pesquisa em CSV
                </button>
                <Link to="/contas/importar" className={BOTAO_SECUNDARIO}>
                  Abrir Importar CSV
                </Link>
              </div>
            </section>
          )}

          {previa.naoImportadas.length > 0 && (
            <section aria-label="Abas não importadas" className="flex flex-col gap-3 border-t border-al-line pt-6">
              <h4 className="rotulo">Não importadas</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {previa.naoImportadas.map(({ aba, motivo }) => (
                  <li key={aba}>
                    <span className="text-al-ink">{aba}</span> <span className="text-al-muted">· {motivo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

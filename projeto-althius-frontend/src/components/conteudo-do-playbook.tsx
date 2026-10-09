// O conteúdo de uma seção do Playbook só para leitura (CRM-09): o texto e as linhas, com os rótulos das colunas da tela.
// A Memória do Workspace mostra assim a versão vigente do ICP e das Personas, e a revisão que um Agente propôs mostra a
// vigente ao lado da proposta, com as linhas que entram e as que saem marcadas.
import type { ConteudoDoPlaybook, IdDaSecaoDoPlaybook, LinhaDoPlaybook } from '@/fonte/playbook-tipos'
import { COLUNAS_DO_PLAYBOOK } from '@/fonte/regras-playbook'
import { cn } from '@/lib/utils'

/** "Papel no comitê: Decisor · Cargo: Diretor industrial", só com os campos preenchidos, na ordem das colunas da seção. */
function linhaEmTexto(secao: IdDaSecaoDoPlaybook, linha: LinhaDoPlaybook): string {
  const colunas = COLUNAS_DO_PLAYBOOK[secao] ?? []
  const conhecidos = colunas.filter(({ campo }) => linha[campo]?.trim()).map(({ campo, rotulo }) => `${rotulo}: ${linha[campo]}`)
  const outros = Object.entries(linha)
    .filter(([campo, valor]) => valor.trim() && !colunas.some((c) => c.campo === campo))
    .map(([campo, valor]) => `${campo}: ${valor}`)
  return [...conhecidos, ...outros].join(' · ')
}

/** O conteúdo como a tela o lê: o texto e cada linha. Vazio, diz que a seção não tem conteúdo. */
export function ConteudoDoPlaybookEmLeitura({
  secao,
  conteudo,
  marcar,
}: {
  secao: IdDaSecaoDoPlaybook
  conteudo: ConteudoDoPlaybook
  /** Marca a linha que entra (`nova`) ou sai (`sai`) numa comparação. */
  marcar?: (linha: LinhaDoPlaybook) => 'nova' | 'sai' | null
}) {
  const linhas = conteudo.linhas.filter((linha) => linhaEmTexto(secao, linha))
  if (!conteudo.texto.trim() && linhas.length === 0) return <p className="text-sm text-al-muted">Sem conteúdo.</p>
  return (
    <div className="flex flex-col gap-3">
      {conteudo.texto.trim() && <p className="whitespace-pre-wrap text-al-ink">{conteudo.texto}</p>}
      {linhas.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {linhas.map((linha, i) => {
            const marca = marcar?.(linha) ?? null
            return (
              <li key={i} className={cn('border-l-2 pl-3', marca === 'nova' ? 'border-al-accent' : 'border-al-line')}>
                {marca === 'nova' && <span className="selo mr-2 h-5 border-al-accent/60 text-al-ink">Nova</span>}
                {marca === 'sai' && <span className="sr-only">Sai: </span>}
                <span className={cn(marca === 'sai' && 'text-al-muted line-through decoration-al-muted/60')}>
                  {linhaEmTexto(secao, linha)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** A mesma linha nos dois lados, pelos campos preenchidos, sem depender da ordem deles. */
const chaveDaLinha = (linha: LinhaDoPlaybook) =>
  JSON.stringify(Object.entries(linha).filter(([, valor]) => valor.trim()).sort(([a], [b]) => a.localeCompare(b)))

/**
 * A versão vigente ao lado da proposta: uma comparação simples, sem histórico. Na proposta, a linha que não existe na
 * vigente vem marcada como nova; na vigente, a que a proposta tira aparece riscada. O texto aparece inteiro dos dois lados.
 */
export function ComparacaoDoPlaybook({
  secao,
  vigente,
  proposto,
}: {
  secao: IdDaSecaoDoPlaybook
  vigente: { versao: number; conteudo: ConteudoDoPlaybook } | null
  proposto: ConteudoDoPlaybook
}) {
  const naVigente = new Set((vigente?.conteudo.linhas ?? []).map(chaveDaLinha))
  const naProposta = new Set(proposto.linhas.map(chaveDaLinha))
  return (
    <section aria-label="Versão vigente e proposta" className="grid gap-4 border-t border-al-line pt-4 sm:grid-cols-2">
      <section aria-label="Versão vigente" className="flex flex-col gap-2">
        <h3 className="rotulo">{vigente ? `Vigente · versão ${vigente.versao}` : 'Vigente'}</h3>
        {vigente ? (
          <ConteudoDoPlaybookEmLeitura
            secao={secao}
            conteudo={vigente.conteudo}
            marcar={(linha) => (naProposta.has(chaveDaLinha(linha)) ? null : 'sai')}
          />
        ) : (
          <p className="text-sm text-al-muted">Nenhuma versão aprovada ainda.</p>
        )}
      </section>
      <section aria-label="Proposta" className="flex flex-col gap-2">
        <h3 className="rotulo">Proposta</h3>
        <ConteudoDoPlaybookEmLeitura
          secao={secao}
          conteudo={proposto}
          marcar={(linha) => (naVigente.has(chaveDaLinha(linha)) ? null : 'nova')}
        />
      </section>
    </section>
  )
}

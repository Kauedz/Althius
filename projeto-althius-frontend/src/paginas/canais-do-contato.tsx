import { Button } from '@/components/ui/button'
import {
  type CanaisDoContato,
  type EmailDoContato,
  LIMITE_DE_CANAIS,
  type RotuloDeEmail,
  ROTULOS_DE_EMAIL,
  type TelefoneDoContato,
  type TipoDeTelefone,
  TIPOS_DE_TELEFONE,
} from '@/fonte/canais-do-contato'

const CAMPO = 'h-9 min-w-0 border border-al-line bg-al-surface px-2.5 text-sm text-al-ink'
const ACAO = 'h-8 border-al-line px-2 text-[0.6875rem] tracking-rotulo uppercase hover:bg-al-surface'

/**
 * As listas de e-mails e de telefones do Contato (até três de cada), no diálogo de edição. O primeiro item é o
 * principal, o que o passo da Sequência usa quando não escolhe outro; "Tornar principal" o troca de lugar, e quem foi
 * o principal vira um dos adicionais. O rótulo e o tipo vêm de listas fixas, e "WhatsApp" é uma marca por telefone,
 * qualquer que seja o tipo. O banco confere de novo o limite e as duplicidades.
 */
export function ListasDeCanais({
  canais,
  aoMudar,
}: {
  canais: CanaisDoContato
  aoMudar: (canais: CanaisDoContato) => void
}) {
  const { emails, telefones } = canais
  const mudarEmail = (indice: number, mudanca: Partial<EmailDoContato>) =>
    aoMudar({ ...canais, emails: emails.map((e, i) => (i === indice ? { ...e, ...mudanca } : e)) })
  const mudarTelefone = (indice: number, mudanca: Partial<TelefoneDoContato>) =>
    aoMudar({ ...canais, telefones: telefones.map((t, i) => (i === indice ? { ...t, ...mudanca } : t)) })
  const principalPrimeiro = <T,>(lista: T[], indice: number) => [lista[indice], ...lista.filter((_, i) => i !== indice)]
  const remover = <T,>(lista: T[], indice: number) => lista.filter((_, i) => i !== indice)

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-al-muted">E-mails (até {LIMITE_DE_CANAIS})</legend>
        {emails.map((email, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`E-mail ${i + 1}`}
              value={email.valor}
              onChange={(e) => mudarEmail(i, { valor: e.target.value })}
              className={`${CAMPO} w-56 flex-1`}
            />
            <select
              aria-label={`Rótulo do e-mail ${i + 1}`}
              value={email.rotulo}
              onChange={(e) => mudarEmail(i, { rotulo: e.target.value as RotuloDeEmail })}
              className={CAMPO}
            >
              {Object.entries(ROTULOS_DE_EMAIL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
            <Principal ehPrincipal={i === 0} rotulo={`e-mail ${i + 1}`} aoTornar={() => aoMudar({ ...canais, emails: principalPrimeiro(emails, i) })} />
            <Button
              type="button"
              variant="outline"
              aria-label={`Remover e-mail ${i + 1}`}
              onClick={() => aoMudar({ ...canais, emails: remover(emails, i) })}
              className={ACAO}
            >
              Remover
            </Button>
          </div>
        ))}
        <Adicionar
          rotulo="Adicionar e-mail"
          limite="Limite de 3 e-mails."
          cheio={emails.length >= LIMITE_DE_CANAIS}
          aoAdicionar={() => aoMudar({ ...canais, emails: [...emails, { valor: '', rotulo: 'trabalho' }] })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-al-muted">Telefones (até {LIMITE_DE_CANAIS})</legend>
        {telefones.map((telefone, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Telefone ${i + 1}`}
              value={telefone.valor}
              onChange={(e) => mudarTelefone(i, { valor: e.target.value })}
              className={`${CAMPO} w-56 flex-1`}
            />
            <select
              aria-label={`Tipo do telefone ${i + 1}`}
              value={telefone.tipo}
              onChange={(e) => mudarTelefone(i, { tipo: e.target.value as TipoDeTelefone })}
              className={CAMPO}
            >
              {Object.entries(TIPOS_DE_TELEFONE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-al-muted">
              <input
                type="checkbox"
                aria-label={`Usa WhatsApp (telefone ${i + 1})`}
                checked={telefone.whatsapp}
                onChange={(e) => mudarTelefone(i, { whatsapp: e.target.checked })}
              />
              Usa WhatsApp
            </label>
            <Principal ehPrincipal={i === 0} rotulo={`telefone ${i + 1}`} aoTornar={() => aoMudar({ ...canais, telefones: principalPrimeiro(telefones, i) })} />
            <Button
              type="button"
              variant="outline"
              aria-label={`Remover telefone ${i + 1}`}
              onClick={() => aoMudar({ ...canais, telefones: remover(telefones, i) })}
              className={ACAO}
            >
              Remover
            </Button>
          </div>
        ))}
        <Adicionar
          rotulo="Adicionar telefone"
          limite="Limite de 3 telefones."
          cheio={telefones.length >= LIMITE_DE_CANAIS}
          aoAdicionar={() =>
            aoMudar({ ...canais, telefones: [...telefones, { valor: '', tipo: 'celular', whatsapp: true }] })
          }
        />
      </fieldset>
    </>
  )
}

/** "Principal" no primeiro item; nos outros, a ação de torná-lo o principal. */
function Principal({ ehPrincipal, rotulo, aoTornar }: { ehPrincipal: boolean; rotulo: string; aoTornar: () => void }) {
  if (ehPrincipal) return <span className="text-[0.6875rem] tracking-rotulo text-al-muted uppercase">Principal</span>
  return (
    <Button type="button" variant="outline" aria-label={`Tornar principal o ${rotulo}`} onClick={aoTornar} className={ACAO}>
      Tornar principal
    </Button>
  )
}

function Adicionar({
  rotulo,
  limite,
  cheio,
  aoAdicionar,
}: {
  rotulo: string
  limite: string
  cheio: boolean
  aoAdicionar: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" disabled={cheio} onClick={aoAdicionar} className={ACAO}>
        {rotulo}
      </Button>
      {cheio && <span className="text-xs text-al-muted">{limite}</span>}
    </div>
  )
}

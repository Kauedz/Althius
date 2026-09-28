import { useState, type Ref } from 'react'

/** O e-mail de uma tela de acesso: o digitado ou, se a tela atende um convite pendente, o do convite, travado. */
export interface EmailDoAcesso {
  /** O e-mail que a tela usa: o travado vence o digitado, mesmo que o campo seja alterado por fora da tela. */
  email: string
  /** As propriedades do `CampoDeEmailDoAcesso`. */
  campo: { email: string; emailTravado: string | null; aoDigitar: (email: string) => void }
}

/** O e-mail de uma tela de acesso, com o e-mail do convite pendente (`emailTravado`) travado. */
export function useEmailDoAcesso(emailTravado: string | null, inicial = ''): EmailDoAcesso {
  const [digitado, setDigitado] = useState(inicial)
  const email = emailTravado ?? digitado
  return { email, campo: { email, emailTravado, aoDigitar: setDigitado } }
}

/**
 * O campo "E-mail" das telas de acesso. Com o e-mail de um convite, ele aparece preenchido, somente leitura, com o
 * aviso "Este convite é para …" como descrição.
 */
export function CampoDeEmailDoAcesso({
  id,
  email,
  emailTravado,
  aoDigitar,
  ref,
}: EmailDoAcesso['campo'] & { id: string; ref?: Ref<HTMLInputElement> }) {
  const aviso = `${id}-aviso-do-convite`
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>E-mail
        <input
          ref={ref}
          id={id}
          type="email"
          autoComplete="email"
          required
          readOnly={emailTravado !== null}
          aria-describedby={emailTravado !== null ? aviso : undefined}
          value={email}
          onChange={(e) => aoDigitar(e.target.value)}
          className="campo h-10 bg-al-bg px-3 text-al-ink read-only:bg-al-surface read-only:text-al-muted"
        />
      </label>
      {emailTravado !== null && <p id={aviso} className="text-xs text-al-muted">Este convite é para {emailTravado}</p>}
    </div>
  )
}

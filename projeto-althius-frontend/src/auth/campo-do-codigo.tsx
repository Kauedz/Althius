/** O campo do código de 6 dígitos enviado por e-mail, comum ao cadastro, à entrada e à redefinição de senha. */
export function CampoDoCodigo({
  id,
  rotulo,
  codigo,
  aoMudar,
}: {
  id: string
  rotulo: string
  codigo: string
  aoMudar: (codigo: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>{rotulo}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={codigo}
        onChange={(e) => aoMudar(e.target.value.replace(/\D/g, ''))}
        className="campo h-10 bg-al-bg px-3 tracking-[0.3em] text-al-ink"
      />
    </label>
  )
}

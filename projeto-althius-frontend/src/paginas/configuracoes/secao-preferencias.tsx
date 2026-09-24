import { useTema, type Tema } from '@/tema'

/**
 * Preferências pessoais. Nesta entrega, só o tema; notificações do navegador chegam num ticket à parte.
 */
export function SecaoPreferencias() {
  const { tema, escolher } = useTema()

  return (
    <section aria-labelledby="titulo-preferencias" className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="titulo-preferencias" className="titulo-secao text-3xl">
            Preferências
          </h2>
          <span className="selo">Só você</span>
        </div>
        <p className="text-al-muted">Preferências pessoais, valem só para a sua Conta de usuário.</p>
      </div>

      <div className="flex items-center justify-between gap-6 border-t border-al-line pt-6">
        <div className="flex flex-col gap-1">
          <span className="font-normal">Tema</span>
          <span className="text-sm text-al-muted">A escolha é gravada no navegador e volta na abertura seguinte.</span>
        </div>
        <SeletorDeTema tema={tema} onMudar={escolher} />
      </div>

      <p className="anotacao">Notificações do navegador chegam em outra atualização.</p>
    </section>
  )
}

function SeletorDeTema({ tema, onMudar }: { tema: Tema; onMudar: (tema: Tema) => void }) {
  const opcoes: { valor: Tema; rotulo: string }[] = [
    { valor: 'escuro', rotulo: 'Escuro' },
    { valor: 'claro', rotulo: 'Claro' },
  ]
  return (
    <div role="radiogroup" aria-label="Tema" className="flex">
      {opcoes.map((opcao) => (
        <label
          key={opcao.valor}
          className="cursor-pointer border border-al-line px-4 py-2 text-sm has-[:checked]:border-al-ink has-[:checked]:bg-al-ink has-[:checked]:text-al-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-al-accent"
        >
          <input
            type="radio"
            name="tema"
            className="sr-only"
            value={opcao.valor}
            checked={tema === opcao.valor}
            onChange={() => onMudar(opcao.valor)}
          />
          {opcao.rotulo}
        </label>
      ))}
    </div>
  )
}

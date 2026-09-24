/**
 * Seção do mockup aprovado (ticket 01) que ainda não tem implementação funcional: cada uma chega
 * no seu próprio ticket. Não representa dados nem ações reais, para não alegar que já funciona.
 */
export function SecaoEmPreparo({
  titulo,
  descricao,
  alcance,
}: {
  titulo: string
  descricao: string
  alcance: string
}) {
  return (
    <section aria-labelledby="titulo-em-preparo" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 id="titulo-em-preparo" className="titulo-secao text-3xl">
            {titulo}
          </h2>
          <span className="selo">{alcance}</span>
        </div>
        <p className="text-al-muted">{descricao}</p>
      </div>
      <p className="border border-al-line bg-al-surface px-4 py-3 text-sm text-al-muted">
        Esta seção ainda não foi implementada nesta demonstração. Ela chega num próximo ticket.
      </p>
    </section>
  )
}

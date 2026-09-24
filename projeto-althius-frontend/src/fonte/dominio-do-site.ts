// O domínio do site do Cliente, informado no onboarding, e o logo que vem dele.

/** Normaliza um domínio. Devolve null quando ainda não é um host utilizável. */
export function dominioUtil(bruto: string): string | null {
  const host = bruto
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.includes('..')) return null
  return host
}

/** O logo do site em ordem de preferência: o SVG, depois o favicon. */
export function logoDoSite(dominio: string): string[] {
  return [`https://${dominio}/favicon.svg`, `https://${dominio}/favicon.ico`]
}

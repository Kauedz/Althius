// O domínio do site do Cliente, informado no onboarding, e o logo que vem dele.

/** Normaliza o domínio digitado para um host. Devolve nenhum quando ainda não é um host utilizável. */
export function normalizarDominio(bruto: string): string | null {
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

/**
 * Os endereços candidatos ao logo, em ordem de preferência: o SVG, depois o favicon que o Google acha no site e,
 * se o Google não responder, o favicon na raiz do site. Muitos sites declaram o ícone só no HTML e não o servem na
 * raiz; o Google lê o HTML e acha esse ícone.
 */
export function enderecosDoLogo(dominio: string): string[] {
  return [
    `https://${dominio}/favicon.svg`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=128`,
    `https://${dominio}/favicon.ico`,
  ]
}

/** Carrega a imagem do endereço e devolve a largura natural dela. Rejeita quando ela não carrega. */
export type MedirImagem = (endereco: string) => Promise<number>

/**
 * O logo do site: o primeiro candidato que carrega e não é um bitmap de 16 px. Um bitmap desse tamanho não serve de
 * logo, e é também o globo genérico com que o Google responde quando não conhece o site. Um SVG sem tamanho próprio
 * mede 0 e vale. Nenhum quando nenhum candidato serve.
 */
export async function resolverLogoDoSite(dominio: string, medir: MedirImagem = medirNoNavegador): Promise<string | null> {
  for (const endereco of enderecosDoLogo(dominio)) {
    try {
      const largura = await medir(endereco)
      if (largura === 0 || largura > 16) return endereco
    } catch {
      // Não carregou: tenta o próximo candidato.
    }
  }
  return null
}

const ESPERA_PELO_LOGO_MS = 5000

function medirNoNavegador(endereco: string): Promise<number> {
  return new Promise((resolver, rejeitar) => {
    const imagem = new Image()
    const desistir = setTimeout(() => rejeitar(new Error(`O logo demorou a carregar: ${endereco}`)), ESPERA_PELO_LOGO_MS)
    imagem.onload = () => {
      clearTimeout(desistir)
      resolver(imagem.naturalWidth)
    }
    imagem.onerror = () => {
      clearTimeout(desistir)
      rejeitar(new Error(`O logo não carregou: ${endereco}`))
    }
    imagem.src = endereco
  })
}

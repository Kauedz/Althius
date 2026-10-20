// Logos oficiais das Integrações e das Contas-alvo (ADR 0003 permite marcas reais na demo). Nas Integrações,
// HubSpot, Notion, Meta e Google Ads vêm do Simple Icons (CC0), na cor da marca; Clay, Apollo, Lusha e Pipedrive, do
// ícone do site de cada uma. Os das Contas-alvo são arquivos em public/logos, com o endereço vindo da fonte. O do
// Workspace vem do site do Cliente, informado no onboarding.
import { useState } from 'react'
import apollo from '@/assets/logos/apollo.png'
import clay from '@/assets/logos/clay.png'
import lusha from '@/assets/logos/lusha.png'
import pipedrive from '@/assets/logos/pipedrive.png'
import type { CanalId, IntegracaoId } from '@/fonte/tipos'
import { cn, iniciais } from '@/lib/utils'

const VETORES: Partial<Record<IntegracaoId, { d: string; cor: string }>> = {
  hubspot: { cor: 'var(--logo-hubspot)', d: 'M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z' },
  notion: { cor: 'var(--al-ink)', d: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z' },
  'meta-ads': { cor: 'var(--logo-meta)', d: 'M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z' },
  'google-ads': { cor: 'var(--logo-google-ads)', d: 'M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998zm19.4643-6.0004L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644zM7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z' },
}

// Os Canais com logo, também do Simple Icons (CC0). O Slack usa a cor do texto, que funciona nos dois temas.
const VETORES_DOS_CANAIS: Partial<Record<CanalId, { d: string; cor: string }>> = {
  slack: { cor: 'var(--al-ink)', d: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' },
  whatsapp: { cor: 'var(--logo-whatsapp)', d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' },
}

// A Integração Slack usa o mesmo logo do Canal Slack: é o mesmo app.
VETORES.slack = VETORES_DOS_CANAIS.slack

/** O logo de um Canal, com 16px, ou nada quando o Canal ainda não tem logo. Decorativo: o nome do Canal já vem ao lado. */
export function LogoDoCanal({ id, className }: { id: CanalId; className?: string }) {
  const vetor = VETORES_DOS_CANAIS[id]
  if (!vetor) return null
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={vetor.cor} className={cn('size-4 shrink-0', className)}>
      <path d={vetor.d} />
    </svg>
  )
}

const IMAGENS: Partial<Record<IntegracaoId, string>> = { clay, apollo, lusha, pipedrive }

const NOME_DA_INTEGRACAO: Record<IntegracaoId, string> = {
  hubspot: 'HubSpot',
  clay: 'Clay',
  apollo: 'Apollo',
  lusha: 'Lusha',
  notion: 'Notion',
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  pipedrive: 'Pipedrive',
  'rd-station': 'RD Station CRM',
  slack: 'Slack',
  'google-calendar': 'Google Calendar',
  'google-sheets': 'Google Sheets',
  calendly: 'Calendly',
  salesforce: 'Salesforce',
  'zoho-crm': 'Zoho CRM',
  bitrix24: 'Bitrix24',
  'tiktok-ads': 'TikTok Ads',
  make: 'Make',
  zapier: 'Zapier',
}

/** O nome da Integração para o logo, já na primeira pintura, antes da lista assíncrona chegar. */
export function nomeDaIntegracao(id: IntegracaoId, nome?: string) {
  return nome && nome !== id ? nome : NOME_DA_INTEGRACAO[id]
}

/** O logo de uma Integração, com 16px. `nome` é o nome da Integração, lido por leitores de tela. */
export function LogoDaIntegracao({ id, nome, className }: { id: IntegracaoId; nome: string; className?: string }) {
  const vetor = VETORES[id]
  if (vetor) {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={nome} fill={vetor.cor} className={cn('size-4 shrink-0', className)}>
        <title>{nome}</title>
        <path d={vetor.d} />
      </svg>
    )
  }
  const imagem = IMAGENS[id]
  if (imagem) {
    return <img src={imagem} alt={nome} title={nome} className={cn('size-4 shrink-0 rounded-[3px] object-contain', className)} />
  }
  // Sem logo cadastrado, as iniciais num quadrado discreto, como nas Contas-alvo: nunca uma imagem quebrada.
  return (
    <span
      role="img"
      aria-label={nome}
      title={nome}
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[3px] border border-al-line bg-al-surface text-[0.5rem] font-semibold text-al-muted',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}

/**
 * O logo de uma Conta-alvo, com 24px, ou as iniciais do nome num quadrado discreto quando não há logo.
 * `nome` é o nome da Conta-alvo, lido por leitores de tela, como nos logos das Integrações.
 */
export function LogoDaConta({
  nome,
  logo,
  deUmaCor,
  className,
}: {
  nome: string
  logo?: string
  /** O logo é de uma cor só: como imagem, sumiria num dos temas, e por isso é pintado com a cor do texto. */
  deUmaCor?: boolean
  className?: string
}) {
  if (logo && deUmaCor) {
    return (
      <span
        role="img"
        aria-label={nome}
        style={{ maskImage: `url(${logo})` }}
        className={cn('size-6 shrink-0 bg-al-ink p-px mask-contain mask-center mask-no-repeat mask-origin-content', className)}
      />
    )
  }
  if (logo) {
    return <img src={logo} alt={nome} className={cn('size-6 shrink-0 object-contain p-px', className)} />
  }
  return (
    <span
      role="img"
      aria-label={nome}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-[4px] border border-al-line bg-al-surface text-[0.6875rem] font-semibold text-al-muted',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  )
}

/**
 * O logo do Workspace, que a Fonte de onboarding resolve a partir do site do Cliente (o SVG ou o favicon). Sem logo,
 * ou quando a imagem não carrega, mostra a inicial do nome. `nome` é o nome do Workspace, lido por leitores de tela.
 */
export function LogoDoWorkspace({
  nome,
  endereco,
  className,
}: {
  nome: string
  endereco: string | null
  className?: string
}) {
  // Uma imagem que falhou não impede o próximo logo: recomeça quando o endereço muda.
  return <LogoOuInicial key={endereco ?? ''} nome={nome} endereco={endereco} className={className} />
}

function LogoOuInicial({ nome, endereco, className }: { nome: string; endereco: string | null; className?: string }) {
  const [falhou, setFalhou] = useState(false)
  const rotulo = `Logo de ${nome}`
  if (endereco && !falhou) {
    return (
      <img
        src={endereco}
        alt={rotulo}
        onError={() => setFalhou(true)}
        className={cn('size-7 shrink-0 rounded-md object-contain', className)}
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={rotulo}
      className={cn('grid size-7 shrink-0 place-items-center rounded-lg bg-al-ink text-sm font-medium text-al-bg', className)}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  )
}

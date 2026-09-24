// O perfil firmográfico de um público personalizado: localização, porte, tempo de empresa e atividade (CNAE).
// As listas do Brasil (CNAE 2.3 e localidades) vêm do IBGE e são carregadas sob demanda.

export interface Faixa {
  min?: number
  max?: number
}

export type OndeTemOCnae = 'principal' | 'principal-ou-secundario'

/** Filtro vazio significa "Qualquer". Localidades e CNAEs guardam o rótulo exibido, que é único. */
export interface PerfilFirmografico {
  pais?: string
  /** Só no Brasil: grandes regiões, UFs, regiões intermediárias do IBGE e cidades ("Campinas (SP)"). */
  regioes?: string[]
  ufs?: string[]
  intermediarias?: string[]
  cidades?: string[]
  /** Fora do Brasil: estados, províncias ou departamentos. */
  estados?: string[]
  funcionarios?: Faixa
  faturamento?: Faixa
  tempoDeEmpresa?: Faixa
  /** Códigos CNAE em qualquer nível: seção "J", divisão "62", grupo "62.0", classe "62.01-5", subclasse "6201-5/01". */
  cnaes?: string[]
  ondeTemOCnae?: OndeTemOCnae
}

export const PAISES = ['Brasil', 'México', 'Colômbia', 'Argentina', 'Chile', 'Estados Unidos']

export const REGIOES_DO_BRASIL = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul']

export const ESTADOS_FORA_DO_BRASIL: Record<string, string[]> = {
  México: [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México',
    'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán',
    'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
    'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
  ],
  Colômbia: [
    'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare',
    'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena',
    'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander',
    'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
  ],
  Argentina: [
    'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Ciudad Autónoma de Buenos Aires', 'Córdoba', 'Corrientes',
    'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
    'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
  ],
  Chile: [
    'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana de Santiago',
    "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
  ],
  'Estados Unidos': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia',
    'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
    'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
    'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
}

export interface Degrau {
  valor: number
  rotulo: string
}

export interface FaixaFirmografica {
  id: 'funcionarios' | 'faturamento' | 'tempoDeEmpresa'
  rotulo: string
  minimos: Degrau[]
  maximos: Degrau[]
  /** Como a faixa aparece no resumo. */
  resumir: (faixa: Faixa) => string
}

const numero = (valor: number) => valor.toLocaleString('pt-BR')
const degraus = (valores: number[], rotular: (v: number) => string) => valores.map((valor) => ({ valor, rotulo: rotular(valor) }))

function real(valor: number): string {
  if (valor >= 1_000_000_000) return `R$ ${numero(valor / 1_000_000_000)} bi`
  if (valor >= 1_000_000) return `R$ ${numero(valor / 1_000_000)} mi`
  return `R$ ${numero(valor / 1_000)} mil`
}

const LIMITES_DE_PORTE: Record<number, string> = { 81_000: 'MEI', 360_000: 'ME', 4_800_000: 'EPP' }
/** Os limites de faturamento do MEI, da ME e da EPP aparecem marcados no degrau. */
const realComPorte = (valor: number) => (LIMITES_DE_PORTE[valor] ? `${real(valor)} · ${LIMITES_DE_PORTE[valor]}` : real(valor))

const FATURAMENTO = [
  81_000, 360_000, 1_000_000, 2_000_000, 4_800_000, 10_000_000, 30_000_000, 50_000_000, 100_000_000, 300_000_000,
  500_000_000, 1_000_000_000, 5_000_000_000,
]
const ANOS = [1, 2, 3, 5, 10, 15, 20, 30]
const anos = (valor: number) => `${valor} ${valor === 1 ? 'ano' : 'anos'}`

/** "a a b", "a partir de a" ou "até b", com os valores formatados. */
function faixaEmTexto({ min, max }: Faixa, formatar: (v: number) => string): string {
  if (min !== undefined && max !== undefined) return `${formatar(min)} a ${formatar(max)}`
  if (min !== undefined) return `a partir de ${formatar(min)}`
  return `até ${formatar(max!)}`
}

export const FAIXAS: FaixaFirmografica[] = [
  {
    id: 'funcionarios',
    rotulo: 'Funcionários',
    minimos: degraus([1, 2, 6, 11, 21, 51, 101, 201, 501, 1_001, 2_001, 5_001, 10_001], numero),
    maximos: degraus([1, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 50_000], numero),
    resumir: (faixa) => `${faixaEmTexto(faixa, numero)} funcionários`,
  },
  {
    id: 'faturamento',
    rotulo: 'Faturamento anual',
    minimos: degraus(FATURAMENTO, realComPorte),
    maximos: degraus(FATURAMENTO, realComPorte),
    resumir: (faixa) => `faturamento ${faixaEmTexto(faixa, real)}`,
  },
  {
    id: 'tempoDeEmpresa',
    rotulo: 'Tempo de empresa',
    minimos: degraus(ANOS, anos),
    maximos: degraus(ANOS, anos),
    // "2 a 5 anos", e não "2 anos a 5 anos".
    resumir: (faixa) =>
      `${faixa.min !== undefined && faixa.max !== undefined ? `${faixa.min} a ${anos(faixa.max)}` : faixaEmTexto(faixa, anos)} de empresa`,
  },
]

/** O perfil escolhido, em texto curto para a lista de Monitoramentos e a revisão. */
export function resumoDoPerfil(perfil: PerfilFirmografico): string {
  const partes: string[] = []
  if (perfil.pais) partes.push(perfil.pais)
  for (const locais of [perfil.regioes, perfil.ufs, perfil.intermediarias, perfil.cidades, perfil.estados]) {
    if (locais?.length) partes.push(locais.join(', '))
  }
  for (const faixa of FAIXAS) {
    const valor = perfil[faixa.id]
    if (valor?.min !== undefined || valor?.max !== undefined) partes.push(faixa.resumir(valor))
  }
  if (perfil.cnaes?.length) {
    const onde = perfil.ondeTemOCnae === 'principal-ou-secundario' ? 'principal ou secundário' : 'principal'
    partes.push(`CNAE ${perfil.cnaes.join(', ')} (${onde})`)
  }
  return partes.length > 0 ? partes.join(' · ') : 'qualquer empresa'
}

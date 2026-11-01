// Converte um negócio ganho de cada CRM no formato que `inferirIcpDosGanhos` lê.
// HubSpot: deal (amount, createdate, closedate) e a empresa associada (industry, numberofemployees, state, country).
// Pipedrive: deal (value, add_time, won_time) e a organização (endereço). A organização padrão do Pipedrive não tem
// setor nem funcionários (people_count conta contatos), então esses dois ficam vazios.
import type { NegocioGanho } from './inferir.ts';

type Propriedades = Record<string, unknown>;
export type DealDoHubspot = { properties?: Propriedades };
export type EmpresaDoHubspot = { properties?: Propriedades };
export type DealDoPipedrive = Propriedades;
export type OrganizacaoDoPipedrive = Propriedades;

const DIA_EM_MS = 86_400_000;

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

function dias(inicio: unknown, fim: unknown): number | null {
  const a = Date.parse(String(inicio ?? ''));
  const b = Date.parse(String(fim ?? ''));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / DIA_EM_MS);
}

const FAIXAS: [number, string][] = [
  [10, '1-10'],
  [50, '11-50'],
  [200, '51-200'],
  [500, '201-500'],
  [1000, '501-1000'],
  [5000, '1001-5000'],
  [10000, '5001-10000'],
];

export function porteDeFuncionarios(funcionarios: number | null): string | null {
  if (funcionarios === null || !Number.isFinite(funcionarios) || funcionarios < 1) return null;
  return FAIXAS.find(([teto]) => funcionarios <= teto)?.[1] ?? '10001+';
}

function setorDoHubspot(industry: unknown): string | null {
  const v = texto(industry);
  if (!v) return null;
  const frase = v.replace(/_/g, ' ').toLocaleLowerCase('pt-BR');
  return frase.charAt(0).toLocaleUpperCase('pt-BR') + frase.slice(1);
}

export function ganhoDoHubspot(deal: DealDoHubspot, empresa: EmpresaDoHubspot | null): NegocioGanho {
  const d = deal.properties ?? {};
  const e = empresa?.properties ?? {};
  return {
    setor: setorDoHubspot(e.industry),
    porte: porteDeFuncionarios(numero(e.numberofemployees)),
    regiao: texto(e.state) ?? texto(e.country),
    valor: numero(d.amount),
    cicloDias: dias(d.createdate, d.closedate),
  };
}

export function ganhoDoPipedrive(deal: DealDoPipedrive, organizacao: OrganizacaoDoPipedrive | null): NegocioGanho {
  const o = organizacao ?? {};
  return {
    setor: null,
    porte: null,
    regiao: texto(o.address_admin_area_level_1) ?? texto(o.address_country),
    valor: numero(deal.value),
    cicloDias: dias(deal.add_time, deal.won_time),
  };
}

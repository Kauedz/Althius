// ICP pelos negócios ganhos do CRM (decisão 6 do plano "Como o Althius deve ser"):
// setor, porte e região dos ganhos, pesando ticket maior e ciclo mais curto.
// O CRM pesa mais que o site; onde discordam, a divergência vai para a pessoa escolher.

export type NegocioGanho = {
  setor: string | null;
  porte: string | null;
  regiao: string | null;
  valor: number | null;
  cicloDias: number | null;
};

export type CampoInferido = {
  valor: string | null;
  // Parte do peso (0 a 1, duas casas) que ficou com o valor vencedor.
  fatia: number;
  // Quantos negócios tinham esse campo preenchido.
  comDado: number;
};

export type IcpDoCrm = {
  setor: CampoInferido;
  porte: CampoInferido;
  regiao: CampoInferido;
  negocios: number;
};

export type IcpDoSite = {
  setor: string | null;
  porte: string | null;
  regiao: string | null;
};

export type Divergencia = {
  campo: keyof IcpDoSite;
  doCrm: string;
  doSite: string;
  sugerido: 'crm';
};

const CAMPOS = ['setor', 'porte', 'regiao'] as const;
const PESO_MINIMO = 0.25;
const PESO_MAXIMO = 4;

const positivo = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

const limitar = (n: number) => Math.min(PESO_MAXIMO, Math.max(PESO_MINIMO, n));
const chave = (texto: string) => texto.trim().toLocaleLowerCase('pt-BR');
const texto = (v: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function pesos(negocios: NegocioGanho[]): number[] {
  const valorTipico = mediana(negocios.map((n) => n.valor).filter(positivo));
  const cicloTipico = mediana(negocios.map((n) => n.cicloDias).filter(positivo));
  return negocios.map((n) => {
    const peloTicket = positivo(n.valor) && valorTipico ? limitar(n.valor / valorTipico) : 1;
    const peloCiclo = positivo(n.cicloDias) && cicloTipico ? limitar(cicloTipico / n.cicloDias) : 1;
    return peloTicket * peloCiclo;
  });
}

function inferirCampo(negocios: NegocioGanho[], peso: number[], campo: (typeof CAMPOS)[number]): CampoInferido {
  const grupos = new Map<string, { grafia: string; peso: number }>();
  let total = 0;
  let comDado = 0;
  negocios.forEach((n, i) => {
    const v = texto(n[campo]);
    if (!v) return;
    comDado += 1;
    total += peso[i];
    const grupo = grupos.get(chave(v));
    if (grupo) grupo.peso += peso[i];
    else grupos.set(chave(v), { grafia: v, peso: peso[i] });
  });
  let vencedor: { grafia: string; peso: number } | null = null;
  for (const grupo of grupos.values()) if (!vencedor || grupo.peso > vencedor.peso) vencedor = grupo;
  if (!vencedor) return { valor: null, fatia: 0, comDado: 0 };
  return { valor: vencedor.grafia, fatia: Math.round((vencedor.peso / total) * 100) / 100, comDado };
}

export function inferirIcpDosGanhos(negocios: NegocioGanho[]): IcpDoCrm | null {
  if (negocios.length === 0) return null;
  const peso = pesos(negocios);
  return {
    setor: inferirCampo(negocios, peso, 'setor'),
    porte: inferirCampo(negocios, peso, 'porte'),
    regiao: inferirCampo(negocios, peso, 'regiao'),
    negocios: negocios.length,
  };
}

export function divergenciasDoIcp(doCrm: IcpDoCrm, doSite: IcpDoSite | null): Divergencia[] {
  if (!doSite) return [];
  const divergencias: Divergencia[] = [];
  for (const campo of CAMPOS) {
    const crm = doCrm[campo].valor;
    const site = texto(doSite[campo]);
    if (crm && site && chave(crm) !== chave(site)) {
      divergencias.push({ campo, doCrm: crm, doSite: site, sugerido: 'crm' });
    }
  }
  return divergencias;
}

// O recorte "agro" do ICP H: os grupos de CNAE (prefixos de 2 a 7 dígitos) das atividades que uma cooperativa agro exerce e
// de quem vende insumo, máquina ou armazenagem ao produtor. Critério revisável: é uma escolha do produto, não da Receita.
// Serve a "nova cooperativa" (descarta a de crédito, de saúde ou de transporte) e à busca por CNAE da alternativa.
export const CNAES_AGRO: string[] = [
  '01', // agricultura, pecuária e serviços relacionados
  '02', // produção florestal
  '1051', // preparação do leite
  '1052', // fabricação de laticínios
  '1061', // beneficiamento de arroz
  '1062', // moagem de trigo
  '462', // comércio atacadista de matérias-primas agrícolas e animais vivos (soja, café, milho, ração)
  '4661', // comércio atacadista de máquinas e equipamentos para uso agropecuário
  '4683', // comércio atacadista de defensivos agrícolas, adubos e fertilizantes
  '5211', // armazéns gerais e depósitos de mercadorias
]

/** O CNAE (com ou sem pontuação) está num dos grupos do agro. */
export function ehCnaeAgro(cnae: unknown, grupos: string[] = CNAES_AGRO): boolean {
  const digitos = typeof cnae === 'string' || typeof cnae === 'number' ? String(cnae).replace(/\D/g, '') : ''
  return digitos.length >= 2 && grupos.some((g) => digitos.startsWith(g))
}

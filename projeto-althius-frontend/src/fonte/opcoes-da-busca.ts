export const SETORES_DA_BUSCA = [
  'Agronegócio', 'Alimentos e bebidas', 'Construção', 'Educação', 'Energia', 'Finanças', 'Fintech', 'Logística',
  'Manufatura', 'Marketing e publicidade', 'Mineração', 'Saúde', 'Seguros', 'SaaS', 'Software', 'Tecnologia', 'Telecomunicações',
  'Varejo', 'Serviços profissionais', 'Turismo', 'Imobiliário',
]

/** As faixas de Porte que a busca aceita: as de funcionários e as da Receita. */
export const PORTES_DO_ICP = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
  'MEI',
  'ME',
  'EPP',
  'DEMAIS',
] as const

export const ROTULOS_DOS_PORTES: Record<string, string> = {
  '1-10': '1 a 10 funcionários', '11-50': '11 a 50 funcionários', '51-200': '51 a 200 funcionários', '201-500': '201 a 500 funcionários',
  '501-1000': '501 a 1.000 funcionários', '1001-5000': '1.001 a 5.000 funcionários', '5001-10000': '5.001 a 10.000 funcionários',
  '10001+': '10.001+ funcionários', MEI: 'MEI', ME: 'ME', EPP: 'EPP', DEMAIS: 'Demais',
}

/** As faixas da Receita (MEI, ME, EPP, Demais): só fazem sentido quando a fonte da busca é a Receita. */
export const PORTES_DA_RECEITA: readonly string[] = ['MEI', 'ME', 'EPP', 'DEMAIS']

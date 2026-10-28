export const SETORES_DA_BUSCA = [
  'Agronegócio', 'Alimentos e bebidas', 'Construção', 'Educação', 'Energia', 'Finanças', 'Fintech', 'Logística',
  'Manufatura', 'Marketing e publicidade', 'Mineração', 'Saúde', 'Seguros', 'SaaS', 'Software', 'Tecnologia', 'Telecomunicações',
  'Varejo', 'Serviços profissionais', 'Turismo', 'Imobiliário',
]

export const ROTULOS_DOS_PORTES: Record<string, string> = {
  '1-10': '1 a 10 funcionários', '11-50': '11 a 50 funcionários', '51-200': '51 a 200 funcionários', '201-500': '201 a 500 funcionários',
  '501-1000': '501 a 1.000 funcionários', '1001-5000': '1.001 a 5.000 funcionários', '5001-10000': '5.001 a 10.000 funcionários',
  '10001+': '10.001+ funcionários', MEI: 'MEI', ME: 'ME', EPP: 'EPP', DEMAIS: 'Demais',
}

/** As faixas da Receita (MEI, ME, EPP, Demais): só fazem sentido quando a fonte da busca é a Receita. */
export const PORTES_DA_RECEITA: readonly string[] = ['MEI', 'ME', 'EPP', 'DEMAIS']

// O registro dos passos que o servidor sabe executar, por `handler` (a coluna `signal_cascade_steps.handler`). Cada fatia
// de ICP acrescenta os seus. O banco diz QUAIS passos formam cada cascata; o código diz COMO cada um roda.
import type { RegistroDePassos } from '../tipos.ts'
import { brasilApiCnpj, cnpjDaConta } from './cnpj-da-conta.ts'
import { casarComContas } from './casar-com-contas.ts'
import { linkedinEmpresa } from './empresa-linkedin.ts'
import { confirmarVaga, linkedinVagas } from './vagas.ts'

export function registroDePassos(fetchFn: typeof fetch = fetch): RegistroDePassos {
  return {
    passos: {
      linkedin_vagas: linkedinVagas,
      confirmar_vaga_comex: confirmarVaga,
      linkedin_empresa: linkedinEmpresa,
      casar_com_contas: casarComContas,
      cnpj_da_conta: cnpjDaConta,
    },
    fontes: {
      brasilapi_cnpj: brasilApiCnpj(fetchFn),
    },
  }
}

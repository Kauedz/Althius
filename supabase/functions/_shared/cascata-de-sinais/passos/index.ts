// O registro dos passos que o servidor sabe executar, por `handler` (a coluna `signal_cascade_steps.handler`). Cada fatia
// de ICP acrescenta os seus. O banco diz QUAIS passos formam cada cascata; o código diz COMO cada um roda.
import type { RegistroDePassos } from '../tipos.ts'
import { brasilApiCnpj, cnpjDaConta } from './cnpj-da-conta.ts'
import { casarComContas } from './casar-com-contas.ts'
import { casarFatosComContas } from './empresas.ts'
import { linkedinEmpresa } from './empresa-linkedin.ts'
import { confirmarVaga, linkedinVagas } from './vagas.ts'
import { passosDoMercado } from './vagas-mercado.ts'
import { passosDoIcp_a_resto } from './icp-a-resto.ts'
import { passosDoIcp_b } from './icp-b.ts'
import { passosDoIcp_c } from './icp-c.ts'
import { passosDoIcp_d } from './icp-d.ts'
import { passosDoIcp_e } from './icp-e.ts'
import { passosDoIcp_f } from './icp-f.ts'
import { passosDoIcp_g } from './icp-g.ts'
import { passosDoIcp_h } from './icp-h.ts'

export function registroDePassos(fetchFn: typeof fetch = fetch): RegistroDePassos {
  const dosIcps = [passosDoIcp_a_resto(fetchFn), passosDoIcp_b(fetchFn), passosDoIcp_c(fetchFn), passosDoIcp_d(fetchFn), passosDoIcp_e(fetchFn), passosDoIcp_f(fetchFn), passosDoIcp_g(fetchFn), passosDoIcp_h(fetchFn)]
  return {
    passos: {
      ...Object.assign({}, ...dosIcps.map((r) => r.passos)),
      casar_fatos_com_contas: casarFatosComContas,
      linkedin_vagas: linkedinVagas,
      confirmar_vaga_comex: confirmarVaga,
      linkedin_empresa: linkedinEmpresa,
      casar_com_contas: casarComContas,
      cnpj_da_conta: cnpjDaConta,
      ...passosDoMercado,
    },
    fontes: {
      ...Object.assign({}, ...dosIcps.map((r) => r.fontes)),
      brasilapi_cnpj: brasilApiCnpj(fetchFn),
    },
  }
}

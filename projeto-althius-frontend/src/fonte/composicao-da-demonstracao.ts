// A composição da Demonstração: só as fontes simuladas, no navegador. Fica fora de `composicao` para não entrar no
// pacote principal: quem a usa carrega este módulo por `import()`, depois de saber que pode vê-la.

import type { Ambiente } from './ambiente'
import { criarFonteDeAutomacaoSimulada } from './simulada-automacao'
import { criarFonteDoPlaybookSimulada } from './simulada-playbook'
import { criarFonteSimulada } from './simulada'
import { criarFonteDeConexoesSimulada } from './simulada-conexoes'
import { criarFonteDeContasSimulada } from './simulada-contas'
import { criarFonteDeContasRemetentesDaDemonstracao } from './simulada-contas-remetentes'
import { criarFonteDeOnboardingSimulada } from './simulada-onboarding'
import { criarFonteDeSequenciasSimulada } from './simulada-sequencias'
import { criarFonteDeSinaisSimulada } from './simulada-sinais'
import { criarFonteDeDescobertasSimulada } from './simulada-descobertas'
import { criarFonteDoAgenteSimulada } from './simulada-agente'

/** A Demonstração: todas as fontes simuladas, ligadas entre si, com o estado que sobrevive no `armazenamento`. */
export function criarAmbienteDeDemonstracao({ armazenamento }: { armazenamento: Storage }): Ambiente {
  const fonteDeContas = criarFonteDeContasSimulada({ armazenamento })
  const fonteDeSequencias = criarFonteDeSequenciasSimulada({ armazenamento })
  const fonteDeSinais = criarFonteDeSinaisSimulada({ fonteDeContas })
  fonteDeContas.vincularFonteDeSequencias(fonteDeSequencias)
  fonteDeSinais.vincularFonteDeContas(fonteDeContas)
  const fonte = criarFonteSimulada({ armazenamento })
  return {
    modo: 'demonstracao',
    fonte,
    fonteDeContas,
    fonteDeSequencias,
    fonteDeOnboarding: criarFonteDeOnboardingSimulada({ armazenamento }),
    fonteDeSinais,
    fonteDeConexoes: criarFonteDeConexoesSimulada({ armazenamento }),
    fonteDeContasRemetentes: criarFonteDeContasRemetentesDaDemonstracao(),
    fonteDoPlaybook: criarFonteDoPlaybookSimulada(),
    fonteDeAutomacao: criarFonteDeAutomacaoSimulada({ agentes: () => fonte.agentes() }),
    fonteDeDescobertas: criarFonteDeDescobertasSimulada({ armazenamento, fonteDeContas }),
    fonteDoAgente: criarFonteDoAgenteSimulada(),
    indisponiveis: new Set(),
  }
}

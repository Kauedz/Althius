// Os adaptadores por tipo de Sinal (sinais-reais 03 a 06): cada um monta a entrada do actor e lê o resultado dele, num
// módulo por tipo em `adaptadores/`. Os campos seguem o esquema de entrada e o README publicados de cada actor; o actor
// só passa a "disponível" no registro depois de uma execução real que os confirme (passo do Nan). Sem adaptador, o
// Monitoramento daquele tipo espera ("Ainda não há adaptador").
import type { AdaptadorDeSinal } from './handler.ts'
import { anuncioDeMovimentacao } from './adaptadores/anuncio-de-movimentacao.ts'
import { anuncioLinkedin } from './adaptadores/anuncio-linkedin.ts'
import { anuncioMeta } from './adaptadores/anuncio-meta.ts'
import { avaliacoesGoogleMaps } from './adaptadores/avaliacoes-google-maps.ts'
import { entradasESaidas } from './adaptadores/entradas-e-saidas.ts'
import { mudancaDeEmprego } from './adaptadores/mudanca-de-emprego.ts'
import { novaLideranca } from './adaptadores/nova-lideranca.ts'
import { vagaIndeed } from './adaptadores/vaga-indeed.ts'
import { vagaLinkedin } from './adaptadores/vaga-linkedin.ts'

const TODOS: AdaptadorDeSinal[] = [
  vagaLinkedin,
  vagaIndeed,
  mudancaDeEmprego,
  novaLideranca,
  entradasESaidas,
  anuncioDeMovimentacao,
  anuncioLinkedin,
  anuncioMeta,
  avaliacoesGoogleMaps,
]

export const ADAPTADORES: Record<string, AdaptadorDeSinal> = Object.fromEntries(TODOS.map((a) => [a.signalType, a]))

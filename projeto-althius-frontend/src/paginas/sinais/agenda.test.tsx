import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ErroDaAgenda, type AgendaDoSinal } from '@/fonte/agenda-do-sinal'
import type { PlanoDoSinal } from '@/fonte/plano-do-sinal'
import type { FonteDeSinais, Monitoramento } from '@/fonte/sinais-tipos'
import { renderizarApp, renderizarAppCom } from '@/test/renderizar'

// A Agenda do Sinal (agente-de-sinal 03): a pessoa escolhe os horários (de 15 em 15 minutos) e os dias, vê o que a regra aceita,
// as próximas rodadas e quantas rodadas por semana a Agenda faz, e grava. Só aparece no Monitoramento que tem Plano (ou Agenda).
// Sobre a Fonte da Demonstração, que guarda a Agenda em memória; a ligação com o banco é testada à parte
// (agenda-no-operacional.test.tsx).

const ROTA = '/sinais/tipos/abertura-de-vagas/vagas-engenharia-de-dados'
const MONITOR = 'vagas-engenharia-de-dados'

const PLANO: PlanoDoSinal = {
  versao: 1,
  origem: 'briefing',
  escopo: { tipo: 'contas', contaIds: ['nubank'] },
  sinais: [{ tipo: 'vaga_linkedin', criterios: { funcoes: ['RevOps e GTM'], periodo: 'Últimos 30 dias' } }],
  explicacao: 'Vamos acompanhar “Abertura de vagas”.',
  maxEmpresasPorRodada: 50,
}

interface Ajustes {
  contas?: number
  estado?: Monitoramento['estado']
  proximas?: string[]
  /** Troca a gravação da Agenda (para o servidor recusar, por exemplo). */
  salvar?: (monitoramentoId: string, agenda: AgendaDoSinal) => Promise<Monitoramento>
  semPlano?: boolean
}

/** A Fonte da Demonstração com o Plano no Monitoramento de exemplo (a Agenda é a da própria Fonte, em memória). */
function fonteComPlano(ajustes: Ajustes = {}) {
  const gravadas: AgendaDoSinal[] = []
  const sinais = (fonte: FonteDeSinais): FonteDeSinais => {
    const ajustar = (m: Monitoramento): Monitoramento => {
      if (m.id !== MONITOR) return m
      return {
        ...m,
        ...(ajustes.estado ? { estado: ajustes.estado } : {}),
        ...(ajustes.semPlano ? {} : { plano: PLANO, versaoDoPlano: 1, briefing: 'Quero saber quando abrirem vagas de dados.' }),
        ...(ajustes.contas ? { publico: { ...m.publico, listas: Array.from({ length: ajustes.contas }, (_, i) => `conta-${i}`) } } : {}),
      }
    }
    return {
      ...fonte,
      monitoramentos: async () => (await fonte.monitoramentos()).map(ajustar),
      monitoramento: async (id) => ajustar(await fonte.monitoramento(id)),
      monitoramentosDoTipo: async (tipo) => (await fonte.monitoramentosDoTipo(tipo)).map(ajustar),
      salvarAgenda: (id, agenda) => {
        gravadas.push(agenda)
        return ajustes.salvar ? ajustes.salvar(id, agenda) : fonte.salvarAgenda!(id, agenda)
      },
      ...(ajustes.proximas ? { proximasRodadas: () => Promise.resolve(ajustes.proximas!) } : {}),
    }
  }
  return { sinais, gravadas }
}

async function abrir(ajustes: Ajustes = {}) {
  const { sinais, gravadas } = fonteComPlano(ajustes)
  const { usuario } = renderizarAppCom(ROTA, { sinais })
  const bloco = await screen.findByRole('region', { name: 'Agenda' })
  return { usuario, bloco, gravadas }
}

const chips = (bloco: HTMLElement) =>
  within(bloco).queryAllByRole('listitem').map((item) => item.textContent)

afterEach(cleanup)

describe('A Agenda na página do Monitoramento', () => {
  it('só aparece no Monitoramento que tem Plano', async () => {
    renderizarApp(ROTA)

    expect(await screen.findByRole('textbox', { name: 'Nome do monitoramento' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Agenda' })).not.toBeInTheDocument()
  })

  it('mostra o padrão: um horário, dias úteis, a regra e as rodadas por semana', async () => {
    const { bloco } = await abrir()

    expect(chips(bloco)).toEqual(['08:00'])
    for (const dia of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']) expect(within(bloco).getByRole('checkbox', { name: dia })).toBeChecked()
    for (const dia of ['Sáb', 'Dom']) expect(within(bloco).getByRole('checkbox', { name: dia })).not.toBeChecked()
    expect(within(bloco).getByText(/Até 6 rodadas por dia, com pelo menos 2 horas entre elas\./)).toBeInTheDocument()
    expect(bloco.textContent).toMatch(/Rodadas por semana\s*5/)
    expect(within(bloco).getByText(/o relógio acorda o Sinal a cada 10 minutos/i)).toBeInTheDocument()
    // Sem agenda salva, o Sinal segue a cada 24 horas; a sugestão pode ser salva como está.
    expect(within(bloco).getByText(/Sem agenda salva, o Sinal roda a cada 24 horas/)).toBeInTheDocument()
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeEnabled()
    // Só rodadas, créditos e horários: nada de dólar, de Teto nem de fornecedor.
    expect(bloco.textContent).not.toMatch(/US\$|\$|teto|apify|actor/i)
  })

  it('adiciona e remove horários, e a rodada por semana acompanha', async () => {
    const { usuario, bloco } = await abrir()

    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '14:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    expect(chips(bloco)).toEqual(['08:00', '14:00'])
    expect(bloco.textContent).toMatch(/Rodadas por semana\s*10/)

    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 08:00' }))
    expect(chips(bloco)).toEqual(['14:00'])
    expect(bloco.textContent).toMatch(/Rodadas por semana\s*5/)
  })

  it('oferece os horários de 15 em 15 minutos', async () => {
    const { bloco } = await abrir()

    const opcoes = within(within(bloco).getByLabelText('Novo horário')).getAllByRole('option').map((o) => o.textContent)
    expect(opcoes).toHaveLength(96)
    expect(opcoes.slice(0, 3)).toEqual(['00:00', '00:15', '00:30'])
    expect(opcoes.at(-1)).toBe('23:45')
  })

  it('recusa em linha o horário com menos de 2 horas, o repetido e o sétimo, sem adicioná-los', async () => {
    const { usuario, bloco } = await abrir()
    const adicionar = async (horario: string) => {
      await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), horario)
      await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    }

    await adicionar('09:45')
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Deixe pelo menos 2 horas entre uma rodada e outra.')
    expect(chips(bloco)).toEqual(['08:00'])

    await adicionar('08:00')
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Esse horário já está na agenda.')

    for (const horario of ['00:00', '04:00', '12:00', '16:00', '20:00']) await adicionar(horario)
    expect(chips(bloco)).toHaveLength(6)
    expect(within(bloco).queryByRole('alert')).not.toBeInTheDocument()

    await adicionar('22:00')
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Até 6 rodadas por dia.')
    expect(chips(bloco)).toHaveLength(6)
  })

  it('a virada do dia vale: 23:00 e 01:00 são 2 horas; 23:15 e 01:00, não', async () => {
    const { usuario, bloco } = await abrir()
    const adicionar = async (horario: string) => {
      await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), horario)
      await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    }
    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 08:00' }))

    await adicionar('23:15')
    await adicionar('01:00')
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Deixe pelo menos 2 horas entre uma rodada e outra.')
    expect(chips(bloco)).toEqual(['23:15'])
  })

  it('sem nenhum horário, avisa em linha e não deixa salvar', async () => {
    const { usuario, bloco } = await abrir()

    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 08:00' }))

    expect(within(bloco).getByText('Nenhum horário escolhido.')).toBeInTheDocument()
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Escolha ao menos um horário.')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
    expect(bloco.textContent).not.toMatch(/Rodadas por semana/)
  })

  it('liga e desliga os dias; sem nenhum dia avisa em linha e não deixa salvar', async () => {
    const { usuario, bloco } = await abrir()

    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))
    expect(within(bloco).getByRole('checkbox', { name: 'Sáb' })).toBeChecked()
    expect(bloco.textContent).toMatch(/Rodadas por semana\s*6/)

    for (const dia of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) await usuario.click(within(bloco).getByRole('checkbox', { name: dia }))
    expect(within(bloco).getByRole('alert')).toHaveTextContent('Escolha ao menos um dia da semana.')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
  })

  it('mostra as próximas 3 rodadas, em Brasília e com "por volta de"', async () => {
    const { bloco } = await abrir({
      proximas: ['2026-10-26T11:00:00.000Z', '2026-10-26T17:00:00.000Z', '2026-10-27T11:00:00.000Z'],
    })

    expect(await within(bloco).findByText(
      'Próximas rodadas: seg 26/10 por volta de 08:00, seg 26/10 por volta de 14:00 e ter 27/10 por volta de 08:00.',
    )).toBeInTheDocument()
  })

  it('na Demonstração, as próximas rodadas saem do mesmo cálculo do servidor', async () => {
    const { bloco } = await abrir()

    const linha = await within(bloco).findByText(/^Próximas rodadas:/)
    expect(linha.textContent).toMatch(/por volta de 08:00.*por volta de 08:00.*por volta de 08:00\.$/)
    expect(linha.textContent).not.toMatch(/sáb|dom/)
  })

  it('o Sinal que ainda não está ativo diz que as rodadas começam ao ativar', async () => {
    const { bloco } = await abrir({ estado: 'rascunho' })

    expect(await within(bloco).findByText('O Sinal ainda não está ativo: as rodadas começam quando você o ativar.')).toBeInTheDocument()
  })

  it('o Sinal pausado diz que as rodadas voltam ao retomar', async () => {
    const { bloco } = await abrir({ estado: 'pausado' })

    expect(await within(bloco).findByText('O Sinal está pausado: as rodadas voltam quando você o retomar.')).toBeInTheDocument()
  })

  it('com mais de 50 Contas no escopo, o aviso aparece e o segundo horário é recusado', async () => {
    const { usuario, bloco } = await abrir({ contas: 51 })

    expect(within(bloco).getByText('Com mais de 50 Contas, o Sinal roda 1 vez por dia.')).toBeInTheDocument()
    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '14:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))

    expect(within(bloco).getByRole('alert')).toHaveTextContent('Com mais de 50 Contas, o Sinal roda 1 vez por dia.')
    expect(chips(bloco)).toEqual(['08:00'])
  })

  it('com 50 Contas, o aviso não aparece e dois horários cabem', async () => {
    const { usuario, bloco } = await abrir({ contas: 50 })

    expect(within(bloco).queryByText('Com mais de 50 Contas, o Sinal roda 1 vez por dia.')).not.toBeInTheDocument()
    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '14:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    expect(chips(bloco)).toHaveLength(2)
  })
})

describe('Salvar a Agenda', () => {
  it('grava os horários e os dias, em ordem, e confirma', async () => {
    const { usuario, bloco, gravadas } = await abrir()
    await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), '14:00')
    await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(gravadas).toEqual([{ horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5, 6] }]))
    expect(await within(bloco).findByRole('status')).toHaveTextContent('Agenda salva.')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
    expect(within(bloco).queryByText(/Sem agenda salva/)).not.toBeInTheDocument()
  })

  it('o servidor recusa o que a tela deixou passar e a frase aparece', async () => {
    const { usuario, bloco } = await abrir({ salvar: () => Promise.reject(new ErroDaAgenda('intervalo_curto')) })
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    expect(await within(bloco).findByRole('alert')).toHaveTextContent('Deixe pelo menos 2 horas entre uma rodada e outra.')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeEnabled()
  })

  it('uma falha qualquer vira a frase neutra, sem texto técnico', async () => {
    const { usuario, bloco } = await abrir({ salvar: () => Promise.reject(new Error('duplicate key value violates constraint "x"')) })
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    const alerta = await within(bloco).findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível salvar a agenda. Tente de novo.')
    expect(alerta.textContent).not.toMatch(/duplicate|constraint/i)
  })
})

describe('A Agenda na revisão antes de ativar', () => {
  it('entra na lista do que a pessoa confere', async () => {
    const { usuario, bloco } = await abrir({ estado: 'rascunho' })
    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))
    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))
    await within(bloco).findByRole('status')

    await usuario.click(screen.getByRole('button', { name: 'Revisar e ativar' }))

    const revisao = await screen.findByRole('region', { name: 'Revisão antes de ativar' })
    expect(within(revisao).getByText('Agenda')).toBeInTheDocument()
    expect(within(revisao).getByText('08:00, seg, ter, qua, qui, sex e sáb')).toBeInTheDocument()
  })
})

describe('A Fonte que não oferece Agenda', () => {
  it('não mostra o bloco', async () => {
    const { sinais } = fonteComPlano()
    renderizarAppCom(ROTA, {
      sinais: (fonte) => {
        const { salvarAgenda: _salvar, proximasRodadas: _proximas, ...resto } = sinais(fonte)
        return resto
      },
    })

    expect(await screen.findByRole('textbox', { name: 'Nome do monitoramento' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Agenda' })).not.toBeInTheDocument()
  })
})

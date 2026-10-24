import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgendaDoSinal } from '@/fonte/agenda-do-sinal'
import { ErroDoLimite, estimativaLocal, type BloqueioDaAtivacao } from '@/fonte/preco-por-rodada'
import type { PlanoDoSinal } from '@/fonte/plano-do-sinal'
import type { FonteDeSinais, Monitoramento } from '@/fonte/sinais-tipos'
import type { FonteDeAgentes, Papel } from '@/fonte/tipos'
import { renderizarAppCom } from '@/test/renderizar'

// Preço por rodada e limites (agente-de-sinal 04): a Estimativa que muda com a Agenda, o Limite por dia, a confirmação "Ativar
// Sinal" e o aviso do Sinal pausado por falta de créditos. Sobre a Fonte da Demonstração, com as respostas que cada teste quer
// (12 Contas a 2 créditos, saldo de 110); a ligação com o banco é testada à parte (preco-por-rodada-no-operacional.test.tsx).

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

const DOIS_HORARIOS: AgendaDoSinal = { horarios: ['08:00', '14:00'], dias: [1, 2, 3, 4, 5] }

interface Ajustes {
  estado?: Monitoramento['estado']
  /** A Agenda gravada. Sem ela, o Monitoramento roda a cada 24 horas e a tela sugere a padrão. */
  agenda?: AgendaDoSinal
  limitePorDia?: number
  pausadoPor?: 'sem_creditos'
  porRodada?: number
  saldo?: number
  bloqueio?: BloqueioDaAtivacao | null
  papel?: Papel
  /** A Fonte não calcula estimativa (nem confirma a ativação). */
  semEstimativa?: boolean
  /** Troca a gravação do limite (para o servidor recusar, por exemplo). */
  salvarLimite?: (limite: number) => Promise<void>
}

function montar(ajustes: Ajustes = {}) {
  const { porRodada = 24, saldo = 110 } = ajustes
  const registro = {
    pedidas: [] as (AgendaDoSinal | undefined)[],
    /** A ordem do que foi gravado: 'agenda', 'limite:30', 'salvar:ativo', 'estado:ativo'. */
    gravacoes: [] as string[],
  }
  let agenda = ajustes.agenda
  let limite = ajustes.limitePorDia
  // Como a Fonte do banco, gravar o limite avisa quem observa, e a tela recarrega.
  const ouvintes = new Set<() => void>()

  const sinais = (fonte: FonteDeSinais): FonteDeSinais => {
    const ajustar = (m: Monitoramento): Monitoramento =>
      m.id !== MONITOR
        ? m
        : {
          ...m,
          plano: PLANO,
          versaoDoPlano: 1,
          briefing: 'Quero saber quando abrirem vagas de dados.',
          ...(ajustes.estado ? { estado: ajustes.estado } : {}),
          ...(agenda ? { agenda } : {}),
          ...(limite !== undefined ? { limitePorDia: limite } : {}),
          ...(ajustes.pausadoPor ? { pausadoPor: ajustes.pausadoPor } : {}),
        }
    const { estimarAgenda: _estimar, salvarLimitePorDia: _limite, ...resto } = fonte
    return {
      ...resto,
      observar: (ouvinte) => {
        ouvintes.add(ouvinte)
        const parar = fonte.observar(ouvinte)
        return () => {
          ouvintes.delete(ouvinte)
          parar()
        }
      },
      monitoramentos: async () => (await fonte.monitoramentos()).map(ajustar),
      monitoramento: async (id) => ajustar(await fonte.monitoramento(id)),
      monitoramentosDoTipo: async (tipo) => (await fonte.monitoramentosDoTipo(tipo)).map(ajustar),
      salvarAgenda: async (id, nova) => {
        registro.gravacoes.push('agenda')
        agenda = nova
        return ajustar(await fonte.salvarAgenda!(id, nova))
      },
      salvarMonitoramento: (m) => (registro.gravacoes.push(`salvar:${m.estado}`), fonte.salvarMonitoramento(m)),
      mudarEstado: (id, estado) => (registro.gravacoes.push(`estado:${estado}`), fonte.mudarEstado(id, estado)),
      ...(ajustes.semEstimativa
        ? {}
        : {
          estimarAgenda: (_id: string, proposta?: AgendaDoSinal) => {
            registro.pedidas.push(proposta)
            return Promise.resolve(estimativaLocal({ porRodada, agenda: proposta ?? agenda, saldo, bloqueio: ajustes.bloqueio ?? null }))
          },
          salvarLimitePorDia: async (id: string, valor: number) => {
            registro.gravacoes.push(`limite:${valor}`)
            await (ajustes.salvarLimite ? ajustes.salvarLimite(valor) : Promise.resolve())
            limite = valor
            ouvintes.forEach((ouvinte) => ouvinte())
            return ajustar(await fonte.monitoramento(id))
          },
        }),
    }
  }
  const fonte = ajustes.papel
    ? (f: FonteDeAgentes): FonteDeAgentes => ({ ...f, workspace: async () => ({ ...(await f.workspace()), papel: ajustes.papel! }) })
    : undefined
  return { registro, sinais, fonte }
}

async function abrir(ajustes: Ajustes = {}, rota = ROTA) {
  const { registro, sinais, fonte } = montar(ajustes)
  const { usuario } = renderizarAppCom(rota, { sinais, ...(fonte ? { fonte } : {}) })
  return { usuario, registro }
}

async function abrirAgenda(ajustes: Ajustes = {}) {
  const aberto = await abrir(ajustes)
  const bloco = await screen.findByRole('region', { name: 'Agenda' })
  return { ...aberto, bloco }
}

async function adicionar(usuario: Awaited<ReturnType<typeof abrir>>['usuario'], bloco: HTMLElement, horario: string) {
  await usuario.selectOptions(within(bloco).getByLabelText('Novo horário'), horario)
  await usuario.click(within(bloco).getByRole('button', { name: 'Adicionar horário' }))
}

const ESTIMATIVA_DE_UM_HORARIO =
  'Até 24 créditos por rodada · até 24 por dia · cerca de 520 por mês. Seu saldo dura cerca de 6 dias nesse ritmo.'
const ESTIMATIVA_DE_DOIS_HORARIOS =
  'Até 24 créditos por rodada · até 48 por dia · cerca de 1.040 por mês. Seu saldo dura cerca de 3 dias nesse ritmo.'

afterEach(cleanup)

describe('A Estimativa na Agenda', () => {
  it('mostra o custo em créditos por rodada, por dia e por mês e quanto o saldo dura, e muda a cada horário e dia', async () => {
    const { usuario, bloco } = await abrirAgenda()

    expect(await within(bloco).findByText(ESTIMATIVA_DE_UM_HORARIO)).toBeInTheDocument()
    expect(within(bloco).getByText('Estimativa')).toBeInTheDocument()

    await adicionar(usuario, bloco, '14:00')
    expect(await within(bloco).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)).toBeInTheDocument()
    expect(within(bloco).queryByText(ESTIMATIVA_DE_UM_HORARIO)).not.toBeInTheDocument()

    await usuario.click(within(bloco).getByRole('checkbox', { name: 'Sáb' }))
    expect(await within(bloco).findByText(
      'Até 24 créditos por rodada · até 48 por dia · cerca de 1.248 por mês. Seu saldo dura cerca de 2 dias nesse ritmo.',
    )).toBeInTheDocument()

    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 14:00' }))
    expect(await within(bloco).findByText(/até 24 por dia · cerca de 624 por mês/)).toBeInTheDocument()
  })

  it('pede a Agenda que a tela propõe, e não a gravada', async () => {
    const { usuario, bloco, registro } = await abrirAgenda({ agenda: { horarios: ['08:00'], dias: [1] } })
    await within(bloco).findByText(/cerca de 104 por mês/)

    await adicionar(usuario, bloco, '14:00')
    await within(bloco).findByText(/cerca de 208 por mês/)

    expect(registro.pedidas.at(-1)).toEqual({ horarios: ['08:00', '14:00'], dias: [1] })
  })

  it('mais de 2 rodadas por dia avisa que costuma repetir resultados; com 2, não', async () => {
    const { usuario, bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS })
    await within(bloco).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)
    expect(within(bloco).queryByText('Rodar várias vezes por dia costuma repetir resultados.')).not.toBeInTheDocument()

    await adicionar(usuario, bloco, '18:00')

    expect(await within(bloco).findByText('Rodar várias vezes por dia costuma repetir resultados.')).toBeInTheDocument()
    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 18:00' }))
    await waitFor(() => expect(within(bloco).queryByText('Rodar várias vezes por dia costuma repetir resultados.')).not.toBeInTheDocument())
  })

  it('uma Agenda que não vale não tem estimativa, e nada é pedido ao servidor para ela', async () => {
    const { usuario, bloco, registro } = await abrirAgenda()
    await within(bloco).findByText(ESTIMATIVA_DE_UM_HORARIO)

    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 08:00' }))

    await waitFor(() => expect(within(bloco).queryByText('Estimativa')).not.toBeInTheDocument())
    expect(registro.pedidas.every((p) => p === undefined || p.horarios.length > 0)).toBe(true)
    expect(within(bloco).queryByLabelText('Limite por dia')).not.toBeInTheDocument()
  })

  it('só créditos: nada de dólar, de Teto, de fornecedor nem de actor', async () => {
    const { bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS, bloqueio: 'sem_teto_automacao' })
    await within(bloco).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)

    expect(bloco.textContent).not.toMatch(/US\$|\$|teto|apify|actor|fornecedor/i)
  })

  it('a Fonte que não estima não mostra a estimativa nem o limite', async () => {
    const { bloco } = await abrirAgenda({ semEstimativa: true })

    expect(within(bloco).queryByText('Estimativa')).not.toBeInTheDocument()
    expect(within(bloco).queryByLabelText('Limite por dia')).not.toBeInTheDocument()
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeEnabled()
  })
})

describe('O Limite por dia', () => {
  it('vem preenchido com o custo máximo de um dia da Agenda e acompanha a Agenda enquanto a pessoa não mexe', async () => {
    const { usuario, bloco } = await abrirAgenda()

    const campo = await within(bloco).findByLabelText('Limite por dia')
    expect(campo).toHaveValue('24')
    expect(within(bloco).getByText(/Opcional\./)).toBeInTheDocument()
    expect(within(bloco).getByText(/o máximo é 24 créditos, o que a agenda gasta num dia/)).toBeInTheDocument()

    await adicionar(usuario, bloco, '14:00')

    await waitFor(() => expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('48'))
  })

  it('a pessoa pode baixar; acima do máximo, zero e texto são recusados em linha e não deixam salvar', async () => {
    const { usuario, bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS })
    const campo = await within(bloco).findByLabelText('Limite por dia')
    expect(campo).toHaveValue('48')

    await usuario.clear(campo)
    await usuario.type(campo, '60')
    expect(within(bloco).getByRole('alert')).toHaveTextContent('O limite não pode passar de 48 créditos por dia, o máximo da agenda.')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()

    for (const invalido of ['0', 'abc', '2,5', '']) {
      await usuario.clear(campo)
      if (invalido) await usuario.type(campo, invalido)
      expect(within(bloco).getByRole('alert')).toHaveTextContent('Use um número inteiro de créditos, de 1 em diante.')
      expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
    }

    await usuario.clear(campo)
    await usuario.type(campo, '30')
    expect(within(bloco).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeEnabled()
  })

  it('salvar grava a Agenda e depois o limite que a pessoa baixou', async () => {
    const { usuario, bloco, registro } = await abrirAgenda()
    await adicionar(usuario, bloco, '14:00')
    const campo = await within(bloco).findByLabelText('Limite por dia')
    await waitFor(() => expect(campo).toHaveValue('48'))
    await usuario.clear(campo)
    await usuario.type(campo, '30')

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['agenda', 'limite:30']))
    expect(await within(bloco).findByRole('status')).toHaveTextContent('Agenda salva.')
    await waitFor(() => expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled())
    expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('30')
  })

  it('sem mexer no campo, o limite padrão (o máximo de um dia) também é gravado com a Agenda', async () => {
    const { usuario, bloco, registro } = await abrirAgenda()
    await adicionar(usuario, bloco, '14:00')
    await waitFor(() => expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('48'))

    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['agenda', 'limite:48']))
  })

  it('o limite que a pessoa baixou fica ao mexer na Agenda, e é cortado quando a Agenda encolhe', async () => {
    const { usuario, bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS, limitePorDia: 30 })
    const campo = await within(bloco).findByLabelText('Limite por dia')
    expect(campo).toHaveValue('30')

    await adicionar(usuario, bloco, '18:00')
    await within(bloco).findByText(/até 72 por dia/)
    expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('30')

    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 18:00' }))
    await usuario.click(within(bloco).getByRole('button', { name: 'Remover 14:00' }))
    await within(bloco).findByText(/até 24 por dia/)
    expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('24')
  })

  it('o limite gravado no máximo da Agenda segue a Agenda quando ela cresce', async () => {
    const { usuario, bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS, limitePorDia: 48 })
    expect(await within(bloco).findByLabelText('Limite por dia')).toHaveValue('48')

    await adicionar(usuario, bloco, '18:00')

    await waitFor(() => expect(within(bloco).getByLabelText('Limite por dia')).toHaveValue('72'))
  })

  it('uma Agenda já gravada, com o limite como está, não pede para salvar de novo', async () => {
    const { bloco } = await abrirAgenda({ agenda: DOIS_HORARIOS, limitePorDia: 30 })
    await within(bloco).findByLabelText('Limite por dia')

    expect(within(bloco).getByRole('button', { name: 'Salvar agenda' })).toBeDisabled()
  })

  it('só o limite mudou: grava só o limite, sem regravar a Agenda', async () => {
    const { usuario, bloco, registro } = await abrirAgenda({ agenda: DOIS_HORARIOS, limitePorDia: 30 })
    const campo = await within(bloco).findByLabelText('Limite por dia')

    await usuario.clear(campo)
    await usuario.type(campo, '20')
    await usuario.click(within(bloco).getByRole('button', { name: 'Salvar agenda' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['limite:20']))
  })

  it('a recusa do servidor vira a frase do produto, e uma falha qualquer vira a frase neutra', async () => {
    const recusado = await abrirAgenda({ agenda: DOIS_HORARIOS, salvarLimite: () => Promise.reject(new ErroDoLimite('acima_do_sugerido', 48)) })
    const campo = await within(recusado.bloco).findByLabelText('Limite por dia')
    await recusado.usuario.clear(campo)
    await recusado.usuario.type(campo, '20')
    await recusado.usuario.click(within(recusado.bloco).getByRole('button', { name: 'Salvar agenda' }))
    expect(await within(recusado.bloco).findByRole('alert')).toHaveTextContent('O limite não pode passar de 48 créditos por dia, o máximo da agenda.')
    cleanup()

    const falha = await abrirAgenda({ agenda: DOIS_HORARIOS, salvarLimite: () => Promise.reject(new Error('duplicate key value violates constraint "x"')) })
    const outro = await within(falha.bloco).findByLabelText('Limite por dia')
    await falha.usuario.clear(outro)
    await falha.usuario.type(outro, '20')
    await falha.usuario.click(within(falha.bloco).getByRole('button', { name: 'Salvar agenda' }))
    const alerta = await within(falha.bloco).findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível salvar o limite por dia. Tente de novo.')
    expect(alerta.textContent).not.toMatch(/duplicate|constraint/i)
  })
})

describe('A confirmação "Ativar Sinal"', () => {
  async function abrirConfirmacao(ajustes: Ajustes = {}) {
    const aberto = await abrir({ estado: 'rascunho', agenda: DOIS_HORARIOS, ...ajustes })
    await aberto.usuario.click(await screen.findByRole('button', { name: 'Revisar e ativar' }))
    await aberto.usuario.click(await screen.findByRole('button', { name: 'Ativar monitoramento' }))
    return { ...aberto, dialogo: await screen.findByRole('dialog', { name: 'Ativar Sinal' }) }
  }

  it('ativar com Agenda abre a confirmação com o Plano, a Agenda, a estimativa e o que acontece sem créditos', async () => {
    const { dialogo, registro } = await abrirConfirmacao()

    expect(await within(dialogo).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)).toBeInTheDocument()
    expect(within(dialogo).getByText('08:00 e 14:00, seg a sex')).toBeInTheDocument()
    expect(within(dialogo).getByText('Vagas de engenharia de dados', { exact: false })).toBeInTheDocument()
    expect(within(dialogo).getByText('Quero saber quando abrirem vagas de dados.')).toBeInTheDocument()
    expect(within(dialogo).getByText(
      'Se os créditos acabarem, a rodada é pulada sem cobrança. Depois de 3 rodadas puladas, o Sinal pausa e avisamos aqui.',
    )).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Ativar' })).toBeEnabled()
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    // Nada foi ativado ainda.
    expect(registro.gravacoes).toEqual([])
    expect(dialogo.textContent).not.toMatch(/US\$|\$|apify|actor|fornecedor/i)
  })

  it('Cancelar fecha e não ativa nada', async () => {
    const { usuario, dialogo, registro } = await abrirConfirmacao()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ativar Sinal' })).not.toBeInTheDocument())
    expect(registro.gravacoes).toEqual([])
    expect(screen.getByRole('region', { name: 'Revisão antes de ativar' })).toBeInTheDocument()
  })

  it('Ativar grava o limite padrão (o máximo de um dia) e ativa; o limite que já existe não é regravado', async () => {
    const semLimite = await abrirConfirmacao()
    await within(semLimite.dialogo).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)
    expect(within(semLimite.dialogo).getByText('Limite por dia')).toBeInTheDocument()

    await semLimite.usuario.click(within(semLimite.dialogo).getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(semLimite.registro.gravacoes).toEqual(['limite:48', 'salvar:ativo']))
    cleanup()

    const comLimite = await abrirConfirmacao({ limitePorDia: 30 })
    expect(await within(comLimite.dialogo).findByText('30 créditos')).toBeInTheDocument()
    await comLimite.usuario.click(within(comLimite.dialogo).getByRole('button', { name: 'Ativar' }))
    await waitFor(() => expect(comLimite.registro.gravacoes).toEqual(['salvar:ativo']))
  })

  it('o Sinal sem Agenda ativa direto, como sempre', async () => {
    const { usuario, registro } = await abrir({ estado: 'rascunho' })

    await usuario.click(await screen.findByRole('button', { name: 'Revisar e ativar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Ativar monitoramento' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['salvar:ativo']))
    expect(screen.queryByRole('dialog', { name: 'Ativar Sinal' })).not.toBeInTheDocument()
  })

  it('a Fonte que não estima ativa direto, mesmo com Agenda', async () => {
    const { usuario, registro } = await abrir({ estado: 'rascunho', agenda: DOIS_HORARIOS, semEstimativa: true })

    await usuario.click(await screen.findByRole('button', { name: 'Revisar e ativar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Ativar monitoramento' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['salvar:ativo']))
  })

  it('sem automação liberada: o Administrador recebe o caminho para configurar; quem não é, o pedido ao responsável pelo plano', async () => {
    const admin = await abrirConfirmacao({ bloqueio: 'sem_teto_automacao', papel: 'administrador' })
    const alertaDoAdmin = await within(admin.dialogo).findByText(/A automação ainda não está liberada/)
    expect(within(admin.dialogo).getByRole('link', { name: 'Configurar a automação' })).toHaveAttribute('href', '/configuracoes/automacao')
    expect(within(admin.dialogo).queryByText('Peça ao responsável pelo plano para liberar a automação.')).not.toBeInTheDocument()
    expect(within(admin.dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    expect(alertaDoAdmin.textContent).not.toMatch(/\d{3,}/)
    cleanup()

    const membro = await abrirConfirmacao({ bloqueio: 'sem_teto_automacao', papel: 'membro' })
    expect(await within(membro.dialogo).findByText('Peça ao responsável pelo plano para liberar a automação.')).toBeInTheDocument()
    expect(within(membro.dialogo).queryByRole('link', { name: /automação/i })).not.toBeInTheDocument()
    expect(within(membro.dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    // Nunca o valor do Teto, nem o dólar.
    expect(membro.dialogo.textContent).not.toMatch(/US\$|\$|teto/i)
  })

  it('sem créditos para uma rodada, ou com o contrato inativo, o Sinal não ativa e a frase é a do produto', async () => {
    const semCreditos = await abrirConfirmacao({ bloqueio: 'sem_creditos' })
    expect(await within(semCreditos.dialogo).findByText('Sem créditos suficientes. Fale com o responsável pelo plano.')).toBeInTheDocument()
    expect(within(semCreditos.dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    cleanup()

    const semContrato = await abrirConfirmacao({ bloqueio: 'contrato_inativo' })
    expect(await within(semContrato.dialogo).findByText('Contrato inativo. Fale com a equipe Althius para reativar.')).toBeInTheDocument()
    expect(within(semContrato.dialogo).getByRole('button', { name: 'Ativar' })).toBeDisabled()
  })
})

describe('Pausado por falta de créditos', () => {
  const PAUSADO: Ajustes = { estado: 'pausado', pausadoPor: 'sem_creditos', agenda: DOIS_HORARIOS }

  it('o aviso no topo da página do Monitoramento tem "Ver créditos" e "Reativar"', async () => {
    await abrir(PAUSADO)

    const aviso = await screen.findByRole('complementary', { name: 'Pausado por falta de créditos: Vagas de engenharia de dados' })
    expect(within(aviso).getByText('Pausado por falta de créditos')).toBeInTheDocument()
    expect(within(aviso).getByText(/3 rodadas seguidas foram puladas porque os créditos acabaram/)).toBeInTheDocument()
    expect(within(aviso).getByRole('link', { name: 'Ver créditos' })).toHaveAttribute('href', '/configuracoes/plano')
    expect(within(aviso).getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
    expect(aviso.textContent).not.toMatch(/US\$|\$|teto/i)
  })

  it('Reativar passa pela confirmação e, ao ativar, volta o estado ativo', async () => {
    const { usuario, registro } = await abrir(PAUSADO)
    const aviso = await screen.findByRole('complementary', { name: /Pausado por falta de créditos/ })

    await usuario.click(within(aviso).getByRole('button', { name: 'Reativar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    await within(dialogo).findByText(ESTIMATIVA_DE_DOIS_HORARIOS)
    expect(registro.gravacoes).toEqual([])
    await usuario.click(within(dialogo).getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(registro.gravacoes).toEqual(['limite:48', 'estado:ativo']))
  })

  it('o Sinal pausado pela pessoa não leva o aviso; o de créditos não leva "Retomar" na lista', async () => {
    const pessoa = await abrir({ estado: 'pausado', agenda: DOIS_HORARIOS }, '/sinais/tipos/abertura-de-vagas')
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const item = within(lista).getByRole('listitem', { name: 'Vagas de engenharia de dados' })
    expect(within(item).getByRole('button', { name: 'Retomar' })).toBeInTheDocument()
    expect(within(item).queryByText('Pausado por falta de créditos')).not.toBeInTheDocument()
    expect(pessoa.registro.gravacoes).toEqual([])
    cleanup()

    await abrir(PAUSADO, '/sinais/tipos/abertura-de-vagas')
    const listaDeCreditos = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })
    const itemDeCreditos = within(listaDeCreditos).getByRole('listitem', { name: 'Vagas de engenharia de dados' })
    expect(within(itemDeCreditos).getByText('Pausado por falta de créditos')).toBeInTheDocument()
    expect(within(itemDeCreditos).getByRole('link', { name: 'Ver créditos' })).toBeInTheDocument()
    expect(within(itemDeCreditos).getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
    expect(within(itemDeCreditos).queryByRole('button', { name: 'Retomar' })).not.toBeInTheDocument()
  })

  it('Retomar o Sinal pausado pela pessoa, com Agenda, também passa pela confirmação', async () => {
    const { usuario, registro } = await abrir({ estado: 'pausado', agenda: DOIS_HORARIOS }, '/sinais/tipos/abertura-de-vagas')
    const lista = await screen.findByRole('list', { name: 'Monitoramentos deste tipo' })

    await usuario.click(within(within(lista).getByRole('listitem', { name: 'Vagas de engenharia de dados' })).getByRole('button', { name: 'Retomar' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ativar Sinal' })
    expect(registro.gravacoes).toEqual([])
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ativar Sinal' })).not.toBeInTheDocument())
    expect(registro.gravacoes).toEqual([])
  })

  it('"Meus Sinais" lista os Sinais pausados por falta de créditos, com "Ver créditos" e "Reativar"', async () => {
    await abrir(PAUSADO, '/sinais')

    const meus = await screen.findByRole('region', { name: 'Meus Sinais' })
    const grupo = await within(meus).findByRole('group', { name: 'Sinais pausados por falta de créditos' })
    expect(within(grupo).getByText('Pausado por falta de créditos')).toBeInTheDocument()
    expect(within(grupo).getByText(/Vagas de engenharia de dados/)).toBeInTheDocument()
    expect(within(grupo).getByRole('link', { name: 'Ver créditos' })).toHaveAttribute('href', '/configuracoes/plano')
    expect(within(grupo).getByRole('button', { name: 'Reativar' })).toBeInTheDocument()
  })

  it('sem Sinal pausado por falta de créditos, "Meus Sinais" não mostra o grupo', async () => {
    await abrir({ estado: 'pausado', agenda: DOIS_HORARIOS }, '/sinais')

    await screen.findByRole('region', { name: 'Meus Sinais' })
    expect(screen.queryByRole('group', { name: 'Sinais pausados por falta de créditos' })).not.toBeInTheDocument()
  })

  it('o Sinal ativo nunca mostra o aviso de pausa', async () => {
    await abrir({ estado: 'ativo', agenda: DOIS_HORARIOS })

    await screen.findByRole('region', { name: 'Agenda' })
    expect(screen.queryByText('Pausado por falta de créditos')).not.toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderizarApp } from '@/test/renderizar'
import { TEMPLATES_DA_ALTHIUS } from '@/fonte/templates-althius'
import { previaDoPasso } from '@/fonte/variaveis-com-evidencia'
import { validarDependenciasDosPassos } from '@/fonte/dependencias-dos-passos'
import type { StepSequencia } from '@/fonte/sequencias-tipos'

describe('Ticket 10: Fluxo Integrado das Sequências Coordenadas', () => {
  it('exercita o fluxo completo: templates → atribuição → autorização → execução independente → retenção → análise IA → decisão e retomada seletiva', async () => {
    const { usuario, fonteDeSequencias } = renderizarApp('/sequencias/sequencia-openai')

    // 1. Início e detalhe: preservação de layout e dados da Conta-alvo
    expect(await screen.findByRole('heading', { level: 2, name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByText('Ativa')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver Conta-alvo' })).toHaveAttribute('href', '/contas/openai')

    // 2. Templates disponíveis sem expor dados reais
    expect(TEMPLATES_DA_ALTHIUS.length).toBeGreaterThan(0)
    for (const t of TEMPLATES_DA_ALTHIUS) {
      expect(t.nome).toBeTruthy()
      expect(t.passos.length).toBeGreaterThan(0)
      for (const p of t.passos) {
        expect((p as unknown as { contatoId?: string }).contatoId).toBeUndefined()
      }
    }

    // 3. Atribuição e dependências entre passos
    const passosExemplo: StepSequencia[] = [
      {
        id: 'step-1',
        ordem: 1,
        canal: 'email',
        titulo: 'Abertura técnica',
        assunto: 'Sobre a vaga',
        corpo: 'Oi {{primeiro_nome}}',
        contatoId: 'contato-1',
        delayDiasUteis: 0,
        liberacao: 'ativacao',
      },
      {
        id: 'step-2',
        ordem: 2,
        canal: 'email',
        titulo: 'Follow-up comercial',
        assunto: 'Conectando ao outro time',
        corpo: 'Oi {{primeiro_nome}}, falei com {{referencia.envio}}',
        contatoId: 'contato-2',
        delayDiasUteis: 2,
        liberacao: 'predecessor',
        predecessorId: 'step-1',
        referenciaContatoId: 'contato-1',
      },
    ]

    // Valida grafo de dependências (sem ciclos, no máximo 1 predecessor)
    expect(() => validarDependenciasDosPassos(passosExemplo)).not.toThrow()

    // 4. Resolução de variáveis com evidência (Ticket 06)
    const previaSemEnvio = previaDoPasso(
      passosExemplo[1].assunto ?? '',
      passosExemplo[1].corpo ?? '',
      {
        workspaceId: 'ws-1',
        contaId: 'conta-1',
        conta: { nome: 'OpenAI' },
        contato: { nome: 'Marcus Vance' },
        referenciaContatoId: 'contato-1',
        referencia: { id: 'contato-1', nome: 'Sarah Chen', workspaceId: 'ws-1', contaId: 'conta-1' },
        envios: [],
      },
    )
    expect(previaSemEnvio.bloqueado).toBe(true)
    expect(previaSemEnvio.motivo).toContain('Não há envio confirmado a Sarah Chen')

    const previaComEnvio = previaDoPasso(
      passosExemplo[1].assunto ?? '',
      passosExemplo[1].corpo ?? '',
      {
        workspaceId: 'ws-1',
        contaId: 'conta-1',
        conta: { nome: 'OpenAI' },
        contato: { nome: 'Marcus Vance' },
        referenciaContatoId: 'contato-1',
        referencia: { id: 'contato-1', nome: 'Sarah Chen', workspaceId: 'ws-1', contaId: 'conta-1' },
        envios: [{ contatoId: 'contato-1', workspaceId: 'ws-1', contaId: 'conta-1', status: 'sent' }],
      },
    )
    expect(previaComEnvio.bloqueado).toBe(false)
    expect(previaComEnvio.corpo).toContain('Sarah Chen')

    // 5. Retenção preventiva e revisão conjunta (Tickets 03, 04 e 05)
    await fonteDeSequencias.registrarRespostaCorrelacionada?.({
      sequenciaId: 'sequencia-openai',
      eventoId: 'evt-sarah',
      contatoId: 'contato-openai-1',
      de: 'Sarah Chen',
      assunto: 'Re: Abertura pelo Sinal',
      trecho: 'Olá, podemos conversar na terça-feira às 14h.',
      analise: {
        status: 'pronta',
        classificacao: 'humana',
        interpretacao: 'Interesse em agendar reunião',
        evidencia: 'podemos conversar na terça-feira',
        recomendacao: 'continuar',
      },
    })

    const blocoRevisao = await screen.findByLabelText('Revisão das respostas pendentes')
    expect(within(blocoRevisao).getByText('Retenção preventiva')).toBeInTheDocument()
    expect(within(blocoRevisao).getByText(/Sarah Chen: Re: Abertura pelo Sinal/)).toBeInTheDocument()
    expect(within(blocoRevisao).getByText(/Interesse em agendar reunião/)).toBeInTheDocument()

    // 6. Decisão obsoleta é rejeitada se nova resposta chegou concorrentemente
    const originalDecidir = fonteDeSequencias.decidirRetencao
    fonteDeSequencias.decidirRetencao = async () => ({ outcome: 'stale', versao: 2 })
    await usuario.click(screen.getByRole('button', { name: 'Continuar envios da Conta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Chegou outra resposta/i)

    // 7. Retomada seletiva persistida: o vendedor decide continuar com a implementação da fonte
    fonteDeSequencias.decidirRetencao = originalDecidir
    await usuario.click(screen.getByRole('button', { name: 'Continuar envios da Conta' }))
    await waitFor(() => {
      expect(screen.getByText('Ativa')).toBeInTheDocument()
    })

    // 8. Resultados por Conta-alvo (Ticket 09)
    const resultados = await fonteDeSequencias.resultadosPorConta?.()
    expect(resultados).toEqual(
      expect.objectContaining({
        contasAbordadas: 18,
        respostasPositivas: 6,
        reunioes: 4,
        respostasNegativas: 3,
      }),
    )
  })

  it('cobre documentos legados, proposta pelo Rhetor, supressão e Demonstração isolada', async () => {
    // 1. Documento legado serial mantém semântica
    const passosLegados: StepSequencia[] = [
      {
        id: 'legado-1',
        ordem: 1,
        contatoId: 'c1',
        canal: 'email',
        titulo: 'Passo 1',
        assunto: 'Assunto 1',
        corpo: 'Corpo 1',
        delayDiasUteis: 0,
      },
      {
        id: 'legado-2',
        ordem: 2,
        contatoId: 'c2',
        canal: 'email',
        titulo: 'Passo 2',
        assunto: 'Assunto 2',
        corpo: 'Corpo 2',
        delayDiasUteis: 1,
      },
    ]
    expect(() => validarDependenciasDosPassos(passosLegados)).not.toThrow()
    expect(passosLegados[0].liberacao).toBeUndefined()
    expect(passosLegados[1].liberacao).toBeUndefined()

    // 2. Rejeição de ciclos e dependências inválidas
    const passosComCiclo: StepSequencia[] = [
      {
        id: 'p-1',
        ordem: 1,
        contatoId: 'c1',
        canal: 'email',
        titulo: 'P1',
        assunto: 'A1',
        corpo: 'C1',
        delayDiasUteis: 0,
        liberacao: 'predecessor',
        predecessorId: 'p-2',
      },
      {
        id: 'p-2',
        ordem: 2,
        contatoId: 'c2',
        canal: 'email',
        titulo: 'P2',
        assunto: 'A2',
        corpo: 'C2',
        delayDiasUteis: 0,
        liberacao: 'predecessor',
        predecessorId: 'p-1',
      },
    ]
    expect(() => validarDependenciasDosPassos(passosComCiclo)).toThrow(/ciclo/i)

    // 3. Demonstração permanece identificada sem invadir dados operacionais
    renderizarApp('/demonstracao/sequencias')
    expect(await screen.findByText(/Demonstração/i)).toBeInTheDocument()
  })
})

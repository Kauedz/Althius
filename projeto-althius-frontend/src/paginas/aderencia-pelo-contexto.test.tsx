// A Aderência das empresas encontradas pelo Contexto da empresa (contexto-da-empresa, ticket 05): atende, não atende,
// sem dado e a verificar ficam separados; critério sem verificação deixa o encaixe não confirmado; os pendentes da
// busca ficam à vista no detalhe; a explicação mostra o contexto (versão e trecho) que a busca usou.
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContaDescoberta } from '@/fonte/descobertas-tipos'
import { criarSupabaseFalso, sessaoDe } from '@/test/supabase-falso'
import { criarFonteDeDescobertasSupabase } from '@/fonte/supabase-descobertas'
import { renderizarAppCom } from '@/test/renderizar'

const linha = (nome: string, fitLevel: string, reasons: unknown[]) => ({
  id: `id-${nome}`, run_id: 'run-1', state: 'nova', name: nome, website: null, domain: null, cnpj: null, linkedin_url: null,
  location: 'São Paulo, SP', uf: 'SP', sector: 'Insurance', size_label: null, employee_count: null, description: null, tags: [],
  source_actor: 'busca:linkedin', fit_level: fitLevel, reasons, signals: [], target_account_id: null, decided_by: null,
  decided_at: null, discard_reason: null, created_at: '2026-11-06T10:00:00Z', origin: 'busca', reopened_by_signal_at: null,
  reopened_discard_reason: null, signal_reasons: [],
})

const SETOR_OK = { criterio: 'setor', atende: true, texto: 'Setor: atua em Insurance, que combina com "seguros".' }
const PERFIL = { criterio: 'perfil', atende: null, texto: 'Perfil: Corretoras.' }
const PENDENTE = { criterio: 'pendente', atende: null, texto: 'A verificar na qualificação: Faturamento acima de R$ 10 mi (a fonte não traz esse dado).' }

const LINHAS = [
  linha('Encaixe Pleno', 'alto', [SETOR_OK, { criterio: 'regiao', atende: true, texto: 'Região: sede em SP.' }, PERFIL]),
  linha('Fora do Porte', 'medio', [SETOR_OK, { criterio: 'porte', atende: false, texto: 'Porte: 5.000 funcionários, fora de 51-200.' }, PERFIL]),
  linha('Parcial Pendente', 'alto', [SETOR_OK, PERFIL, PENDENTE]),
  // Um critério verificado não bate; a nota alta vem dos Sinais, que não confirmam o encaixe.
  linha('Fora com Sinais', 'alto', [SETOR_OK, { criterio: 'porte', atende: false, texto: 'Porte: 3 funcionários, fora de 51-200.' }]),
  linha('Sem Região', 'alto', [SETOR_OK, { criterio: 'regiao', atende: null, texto: 'Região: a fonte não informou onde fica a empresa.' }]),
]

async function listar(): Promise<ContaDescoberta[]> {
  const { cliente } = criarSupabaseFalso({
    sessao: sessaoDe({ id: 'u1', email: 'ana@cliente.com.br' }),
    rpcs: { list_discovered_accounts: () => LINHAS },
  })
  return criarFonteDeDescobertasSupabase(cliente, () => 'ws-1').listarDescobertas('nova')
}

describe('Aderência das empresas encontradas pelo contexto', () => {
  it('a fonte separa atende, não atende, sem dado e a verificar, e só confirma com tudo verificado', async () => {
    const [pleno, fora, parcial, , semRegiao] = await listar()
    expect(pleno.aderencia).toMatchObject({ situacao: 'atende', naoAtendidos: [], semDado: [], aVerificar: [] })
    expect(fora.aderencia).toMatchObject({ situacao: 'nao_atende', naoAtendidos: ['Porte: 5.000 funcionários, fora de 51-200.'] })
    expect(parcial.aderencia).toMatchObject({ situacao: 'nao_confirmada', atendidos: [SETOR_OK.texto], aVerificar: [PENDENTE.texto] })
    // Dado ausente não conta como atendido.
    expect(semRegiao.aderencia).toMatchObject({
      situacao: 'nao_confirmada',
      atendidos: [SETOR_OK.texto],
      semDado: ['Região: a fonte não informou onde fica a empresa.'],
    })
  })

  it('a Caixa mostra encaixe não confirmado, deixa os pendentes à vista e explica contra o contexto da busca', async () => {
    const candidatas = await listar()
    const explicarAderencia = vi.fn().mockResolvedValue({
      explicacao: 'Aderência não confirmada. Atende: Setor: atua em Insurance, que combina com "seguros".',
      origem: 'regra',
      nivel: 'alto',
      situacao: 'nao_confirmada',
      criterios: {
        atendidos: [SETOR_OK.texto],
        naoAtendidos: [],
        semDado: [],
        aVerificar: ['Faturamento acima de R$ 10 mi: a fonte não traz esse dado; conferir na qualificação.'],
      },
      contexto: { versao: 4, perfis: ['Corretoras'], trechos: ['corretoras de seguros'] },
    })
    const { usuario } = renderizarAppCom('/contas/descobertas', {
      opcoesOnboarding: {},
      descobertas: (fonte) => {
        vi.spyOn(fonte, 'cotarBusca').mockResolvedValue({ creditos: 5, saldoDisponivel: 100, emAndamento: false, estadoDoActor: 'available', podeTestar: true })
        return Object.assign(fonte, { listarDescobertas: vi.fn().mockResolvedValue(candidatas), explicarAderencia })
      },
    })

    const linhaDe = async (nome: string) => (await screen.findByText(nome)).closest('tr') as HTMLElement
    expect(within(await linhaDe('Encaixe Pleno')).getByText('Encaixe alto')).toBeInTheDocument()
    expect(within(await linhaDe('Fora do Porte')).getByText('Encaixe medio')).toBeInTheDocument()
    // Requisito sem verificação: o nível da nota não vira encaixe confirmado.
    const parcial = await linhaDe('Parcial Pendente')
    expect(within(parcial).getByText('Encaixe não confirmado')).toBeInTheDocument()
    expect(within(parcial).queryByText('Encaixe alto')).not.toBeInTheDocument()
    expect(within(await linhaDe('Sem Região')).getByText('Encaixe não confirmado')).toBeInTheDocument()
    expect(within(await linhaDe('Fora com Sinais')).getByText('Encaixe medio')).toBeInTheDocument()

    await usuario.click(within(parcial).getByRole('button', { name: /Ver detalhes de Parcial Pendente/ }))
    const detalhe = screen.getByRole('group', { name: 'Detalhes de Parcial Pendente' })
    // Os pendentes da busca ficam à vista antes de qualquer explicação.
    expect(within(detalhe).getByRole('list', { name: 'A verificar na qualificação' })).toHaveTextContent('Faturamento acima de R$ 10 mi')

    await usuario.click(within(detalhe).getByRole('button', { name: 'Por que essa Aderência?' }))
    const explicacao = await within(detalhe).findByRole('status')
    expect(within(explicacao).getByRole('list', { name: 'Atende' })).toHaveTextContent('combina com "seguros"')
    expect(within(explicacao).queryByRole('list', { name: 'Não atende' })).not.toBeInTheDocument()
    expect(within(explicacao).getByRole('list', { name: 'A verificar' })).toHaveTextContent('conferir na qualificação')
    expect(explicacao).toHaveTextContent('versão 4 do Perfil de cliente ideal')
    expect(explicacao).toHaveTextContent('“corretoras de seguros”')
    expect(explicarAderencia).toHaveBeenCalledWith('id-Parcial Pendente')
  })
})

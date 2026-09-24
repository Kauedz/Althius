import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIA_EM_MS, estaValido, foiDisparado, VALIDADE_EM_DIAS } from '@/fonte/regras-sinais'
import { criarFonteDeContasSimulada } from '@/fonte/simulada-contas'
import { renderizarApp } from '@/test/renderizar'

describe('ADR 0007: Sinal disparado torna a Conta-alvo Quente', () => {
  describe('Regras canônicas de validade de sinais (30 dias)', () => {
    const hoje = new Date('2026-09-24T12:00:00Z')

    it('sinal com 29 dias e 23 horas é válido', () => {
      const dataSinalQuaseExpirando = new Date(hoje.getTime() - (29 * 24 + 23) * 60 * 60 * 1000)
      expect(foiDisparado(dataSinalQuaseExpirando, hoje)).toBe(true)
      expect(estaValido(dataSinalQuaseExpirando, hoje)).toBe(true)
    })

    it('sinal no limite exato de 30 dias é considerado expirado (hoje < expiraEm)', () => {
      const dataSinalExato30Dias = new Date(hoje.getTime() - VALIDADE_EM_DIAS * DIA_EM_MS)
      expect(foiDisparado(dataSinalExato30Dias, hoje)).toBe(true)
      expect(estaValido(dataSinalExato30Dias, hoje)).toBe(false)
    })

    it('sinal com mais de 30 dias é expirado', () => {
      const dataSinal31Dias = new Date(hoje.getTime() - 31 * DIA_EM_MS)
      expect(foiDisparado(dataSinal31Dias, hoje)).toBe(true)
      expect(estaValido(dataSinal31Dias, hoje)).toBe(false)
    })

    it('sinal com data futura não é considerado disparado nem válido', () => {
      const dataFutura = new Date(hoje.getTime() + 1000 * 60 * 60 * 24)
      expect(foiDisparado(dataFutura, hoje)).toBe(false)
      expect(estaValido(dataFutura, hoje)).toBe(false)
    })
  })

  describe('Dinâmica de sinais na FonteDeContas', () => {
    it('adiciona sinal e torna a conta Quente', async () => {
      const hoje = new Date('2026-09-24T12:00:00Z')
      const fonte = criarFonteDeContasSimulada({ atrasoMs: 0, hoje })

      // Miro começa como Fit, sem sinais válidos
      const miroInicial = await fonte.conta('miro')
      expect(miroInicial?.aderencia).toBe('fit')
      expect(miroInicial?.totalSinaisValidos).toBe(0)
      expect(miroInicial?.quente).toBe(false)

      // Adiciona um sinal válido
      await fonte.adicionarSinal({
        contaId: 'miro',
        acontecimentoId: 'vaga-miro-01',
        tipo: 'vaga',
        titulo: 'Vaga de Engenharia no Brasil',
        descricao: 'Contratando equipe remota no Brasil',
        dataAcontecimento: new Date('2026-09-20T10:00:00Z'),
      })

      const miroAtualizada = await fonte.conta('miro')
      expect(miroAtualizada?.aderencia).toBe('fit') // Aderência preservada!
      expect(miroAtualizada?.totalSinaisValidos).toBe(1)
      expect(miroAtualizada?.quente).toBe(true)
      expect(miroAtualizada?.ultimoSinal?.frase).toBe('Vaga de Engenharia no Brasil')
    })

    it('reencontro do mesmo sinal não duplica, mantém data original e registra reencontro', async () => {
      const hoje = new Date('2026-09-24T12:00:00Z')
      const fonte = criarFonteDeContasSimulada({ atrasoMs: 0, hoje })
      const dataOriginal = new Date('2026-09-10T08:00:00Z')

      await fonte.adicionarSinal({
        contaId: 'miro',
        acontecimentoId: 'vaga-miro-duplicada',
        tipo: 'vaga',
        titulo: 'Vaga de Tech Lead',
        dataAcontecimento: dataOriginal,
      })

      const miroCom1 = await fonte.conta('miro')
      expect(miroCom1?.totalSinaisValidos).toBe(1)

      // Reencontra o mesmo sinal dias depois
      const dataReencontro = new Date('2026-09-22T14:00:00Z')
      await fonte.adicionarSinal({
        contaId: 'miro',
        acontecimentoId: 'vaga-miro-duplicada',
        tipo: 'vaga',
        titulo: 'Vaga de Tech Lead (Reanunciada)',
        dataAcontecimento: dataReencontro,
      })

      const miroAposReencontro = await fonte.conta('miro')
      expect(miroAposReencontro?.totalSinaisValidos).toBe(1) // Não incrementou

      const sinaisMiro = await fonte.sinaisDaConta('miro')
      expect(sinaisMiro).toHaveLength(1)
      expect(new Date(sinaisMiro[0].dataAcontecimento!).getTime()).toBe(dataOriginal.getTime())
      expect(sinaisMiro[0].reencontrado).toBeDefined()
      expect(sinaisMiro[0].reencontrado?.vezes).toBe(1)
    })

    it('conta com 2 sinais: expiração do primeiro reduz para 1 (continua Quente); expiração do segundo zera (deixa de ser Quente)', async () => {
      const dataBase = new Date('2026-08-01T12:00:00Z')
      const fonte = criarFonteDeContasSimulada({ atrasoMs: 0, hoje: dataBase })

      // Sinal 1 disparado em 01/08 (expira em 31/08)
      await fonte.adicionarSinal({
        contaId: 'miro',
        acontecimentoId: 'sinal-1',
        tipo: 'noticia',
        titulo: 'Sinal 1',
        dataAcontecimento: dataBase,
      })

      // Sinal 2 disparado em 15/08 (expira em 14/09)
      const dataSinal2 = new Date('2026-08-15T12:00:00Z')
      await fonte.adicionarSinal({
        contaId: 'miro',
        acontecimentoId: 'sinal-2',
        tipo: 'vaga',
        titulo: 'Sinal 2',
        dataAcontecimento: dataSinal2,
      })

      // Em 20/08: ambos válidos -> 2 sinais, Quente
      fonte.definirHoje(new Date('2026-08-20T12:00:00Z'))
      const miroEmAgosto = await fonte.conta('miro')
      expect(miroEmAgosto?.totalSinaisValidos).toBe(2)
      expect(miroEmAgosto?.quente).toBe(true)

      // Em 05/09: Sinal 1 expirou, Sinal 2 ainda válido -> 1 sinal, continua Quente
      fonte.definirHoje(new Date('2026-09-05T12:00:00Z'))
      const miroEmSetembro = await fonte.conta('miro')
      expect(miroEmSetembro?.totalSinaisValidos).toBe(1)
      expect(miroEmSetembro?.quente).toBe(true)

      // Em 20/09: Sinal 2 também expirou -> 0 sinais, deixa de ser Quente
      fonte.definirHoje(new Date('2026-09-20T12:00:00Z'))
      const miroAposExpiracaoTotal = await fonte.conta('miro')
      expect(miroAposExpiracaoTotal?.totalSinaisValidos).toBe(0)
      expect(miroAposExpiracaoTotal?.quente).toBe(false)
      // Aderência permanece intacta como 'fit'
      expect(miroAposExpiracaoTotal?.aderencia).toBe('fit')
    })
  })

  describe('UI da tabela /contas (ADR 0007)', () => {
    it('mostra Quente e Aderência em colunas separadas e respeita a ordenação por prioridade', async () => {
      renderizarApp('/contas')

      const tabela = await screen.findByRole('table', { name: 'Tabela de Contas' })
      const linhas = within(tabela).getAllByRole('row').slice(1)

      // Primeira linha: OpenAI é Quente com 2 sinais e Aderência Fit
      const celulasOpenAI = within(linhas[0]).getAllByRole('cell')
      expect(celulasOpenAI[0]).toHaveTextContent('OpenAI')
      expect(celulasOpenAI[1]).toHaveTextContent('2 sinais')
      expect(within(celulasOpenAI[1]).getByLabelText('Quente, 2 sinais válidos')).toBeInTheDocument()
      expect(celulasOpenAI[2]).toHaveTextContent('Fit')

      // Todas as primeiras 18 contas são Quentes
      for (let i = 0; i < 18; i++) {
        const celulas = within(linhas[i]).getAllByRole('cell')
        expect(celulas[1].textContent).toMatch(/\d+ (sinal|sinais)/)
        expect(celulas[2]).toHaveTextContent('Fit')
      }

      // A partir da linha 19, contas não quentes: primeiro Fit (SAP até Oracle), depois Não fit (Mercado Livre até Banorte), depois não avaliada (BBVA México)
      const celulasSAP = within(linhas[18]).getAllByRole('cell')
      expect(celulasSAP[0]).toHaveTextContent('SAP')
      expect(celulasSAP[1]).toHaveTextContent('—')
      expect(celulasSAP[2]).toHaveTextContent('Fit')

      const celulasBanorte = within(linhas[28]).getAllByRole('cell')
      expect(celulasBanorte[0]).toHaveTextContent('Banorte')
      expect(celulasBanorte[1]).toHaveTextContent('—')
      expect(celulasBanorte[2]).toHaveTextContent('Não fit')

      const celulasBBVA = within(linhas[29]).getAllByRole('cell')
      expect(celulasBBVA[0]).toHaveTextContent('BBVA México')
      expect(celulasBBVA[1]).toHaveTextContent('—')
      expect(within(celulasBBVA[2]).getByTitle('Aderência ainda não avaliada')).toBeInTheDocument()
    })
  })

  describe('UI do detalhe da conta /contas/:contaId (ADR 0007)', () => {
    it('exibe Foguinho e badge de aderência no cabeçalho, e badges Válido/Expirado nos sinais', async () => {
      renderizarApp('/contas/openai')

      // Cabeçalho da conta
      expect(await screen.findByRole('heading', { level: 2, name: 'OpenAI' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Quente, 2 sinais válidos' })).toBeInTheDocument()
      expect(screen.getByText('Fit')).toBeInTheDocument()

      // Na seção de Sinais
      const secaoSinais = screen.getByRole('region', { name: 'Sinais' })
      expect(within(secaoSinais).getAllByText('Válido')).toHaveLength(2)
    })

    it('conta sem sinais válidos exibe apenas o badge de aderência no cabeçalho', async () => {
      renderizarApp('/contas/miro')

      expect(await screen.findByRole('heading', { level: 2, name: 'Miro' })).toBeInTheDocument()
      expect(screen.queryByLabelText(/Quente,/)).not.toBeInTheDocument()
      expect(screen.getByText('Fit')).toBeInTheDocument()
    })
  })
})

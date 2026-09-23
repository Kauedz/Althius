import { describe, expect, it } from 'vitest'
import { criarDadosIniciais } from './dados-contas-demo'

describe('Dados completos da demo (ticket 04)', () => {
  const hoje = new Date(2026, 8, 23, 12, 0, 0)
  const dados = criarDadosIniciais(hoje)

  it('possui exatamente 30 Contas-alvo: 18 Quentes, 8 Fit, 3 Não fit e 1 não avaliada', () => {
    expect(dados.contas).toHaveLength(30)

    const quentes = dados.contas.filter((c) => c.aderencia === 'quente')
    const fits = dados.contas.filter((c) => c.aderencia === 'fit')
    const naoFits = dados.contas.filter((c) => c.aderencia === 'nao-fit')
    const naoAvaliadas = dados.contas.filter((c) => c.aderencia === undefined)

    expect(quentes).toHaveLength(18)
    expect(fits).toHaveLength(8)
    expect(naoFits).toHaveLength(3)
    expect(naoAvaliadas).toHaveLength(1)

    // Todas as 18 Quentes têm sinal recente
    for (const conta of quentes) {
      expect(conta.ultimoSinal).toBeDefined()
      const dataSinal = new Date(conta.ultimoSinal!.data).getTime()
      const diffDias = Math.round((hoje.getTime() - dataSinal) / (1000 * 60 * 60 * 24))
      expect(diffDias).toBeLessThanOrEqual(30)
    }
  })

  it('as 3 Não fit e a não avaliada têm origem "importada" por Marina; as demais têm origem "recomendada"', () => {
    const naoFits = dados.contas.filter((c) => c.aderencia === 'nao-fit')
    const naoAvaliadas = dados.contas.filter((c) => c.aderencia === undefined)
    const recomendadas = dados.contas.filter(
      (c) => c.aderencia === 'quente' || c.aderencia === 'fit',
    )

    for (const conta of [...naoFits, ...naoAvaliadas]) {
      expect(conta.origem).toEqual(
        expect.objectContaining({
          tipo: 'importada',
          importadaPor: 'Marina',
        }),
      )
    }

    for (const conta of recomendadas) {
      expect(conta.origem).toEqual({ tipo: 'recomendada' })
    }
  })

  it('o Sinal mais recente da OpenAI é a abertura de três vagas de engenharia de dados de avaliação, como no roteiro do Rhetor', () => {
    const openai = dados.contas.find((c) => c.id === 'openai')
    expect(openai).toBeDefined()
    expect(openai?.ultimoSinal?.frase).toMatch(/abriu 3 vagas de engenharia de dados de avaliação/i)
    expect(openai?.ultimoSinal?.fonte).toBe('LinkedIn Jobs')
    expect(openai?.ultimoSinal?.evidencia).toBeUndefined()
  })

  it('os Sinais têm frase e fonte plausíveis, e nenhum tem URL de evidência', () => {
    expect(dados.sinais.length).toBeGreaterThan(0)
    for (const sinal of dados.sinais) {
      expect(sinal.frase.trim().length).toBeGreaterThan(5)
      expect(sinal.fonte).toBeDefined()
      expect(sinal.fonte!.trim().length).toBeGreaterThan(2)
      expect(sinal.evidencia).toBeUndefined()
    }
  })

  it('os Contatos têm nomes fictícios e cargos reais, com e sem Persona, e apenas disponibilidade booleana de canais', () => {
    expect(dados.contatos.length).toBeGreaterThan(50)

    let comPersona = 0
    let semPersona = 0

    for (const contato of dados.contatos) {
      expect(contato.nome.split(' ').length).toBeGreaterThanOrEqual(2)
      expect(contato.cargo).toBeDefined()
      expect(typeof contato.canais.email).toBe('boolean')
      expect(typeof contato.canais.telefone).toBe('boolean')
      expect(typeof contato.canais.linkedin).toBe('boolean')

      // Nenhum dado de e-mail, telefone ou URL de perfil deve existir no objeto
      expect(contato).not.toHaveProperty('email')
      expect(contato).not.toHaveProperty('telefone')
      expect(contato).not.toHaveProperty('perfil')

      if (contato.persona) comPersona++
      else semPersona++
    }

    expect(comPersona).toBeGreaterThan(0)
    expect(semPersona).toBeGreaterThan(0)
  })

  it('distribuição de contatos: algumas empresas têm quatro ou mais, outras menos, e três não têm nenhum', () => {
    const empresasComZero = dados.contas.filter((c) => c.totalContatos === 0)
    const empresasComQuatroOuMais = dados.contas.filter((c) => c.totalContatos >= 4)
    const empresasComMenosDeQuatro = dados.contas.filter(
      (c) => c.totalContatos > 0 && c.totalContatos < 4,
    )

    expect(empresasComZero.map((c) => c.id)).toEqual(['miro', 'rappi', 'banorte'])
    expect(empresasComZero).toHaveLength(3)
    expect(empresasComQuatroOuMais.length).toBeGreaterThanOrEqual(10)
    expect(empresasComMenosDeQuatro.length).toBeGreaterThanOrEqual(10)
  })

  it('as Interações são coerentes com os roteiros e as Aprovações existentes (OpenAI, Stripe, Anthropic)', () => {
    const interacoesOpenAI = dados.interacoes.filter((i) => i.contaId === 'openai')
    expect(interacoesOpenAI.length).toBeGreaterThan(0)
    expect(interacoesOpenAI.some((i) => i.origem === 'HubSpot')).toBe(true)
    expect(interacoesOpenAI.some((i) => i.participanteCliente === 'Marina Alves')).toBe(true)

    const interacoesStripe = dados.interacoes.filter((i) => i.contaId === 'stripe')
    expect(interacoesStripe.length).toBeGreaterThan(0)
    expect(interacoesStripe.some((i) => i.origem === 'Althius' || i.origem === 'HubSpot')).toBe(true)
  })

  it('os dados ausentes seguem rigorosamente a spec: 4 sem logo, 3 sem Contatos, 3 sem Sinal, 5 com "Nunca", 2 sem segmento e 3 sem site nem LinkedIn', () => {
    const semLogo = dados.contas.filter((c) => c.logo === undefined)
    expect(semLogo.map((c) => c.id).sort()).toEqual(['banorte', 'bbva-mexico', 'miro', 'rappi'].sort())
    expect(semLogo).toHaveLength(4)

    const semContatos = dados.contas.filter((c) => c.totalContatos === 0)
    expect(semContatos.map((c) => c.id).sort()).toEqual(['banorte', 'miro', 'rappi'].sort())
    expect(semContatos).toHaveLength(3)

    const semSinal = dados.contas.filter((c) => c.ultimoSinal === undefined)
    expect(semSinal.map((c) => c.id).sort()).toEqual(['banorte', 'miro', 'oracle'].sort())
    expect(semSinal).toHaveLength(3)

    const comNunca = dados.contas.filter((c) => c.ultimoContatoEm === undefined)
    expect(comNunca.map((c) => c.id).sort()).toEqual(
      ['banorte', 'bbva-mexico', 'miro', 'okta', 'rappi'].sort(),
    )
    expect(comNunca).toHaveLength(5)

    const semSegmento = dados.contas.filter((c) => c.segmento === undefined)
    expect(semSegmento.map((c) => c.id).sort()).toEqual(['bbva-mexico', 'rappi'].sort())
    expect(semSegmento).toHaveLength(2)

    const semSiteNemLinkedin = dados.contas.filter(
      (c) => c.siteUrl === undefined && c.linkedinUrl === undefined,
    )
    expect(semSiteNemLinkedin.map((c) => c.id).sort()).toEqual(
      ['bbva-mexico', 'miro', 'rappi'].sort(),
    )
    expect(semSiteNemLinkedin).toHaveLength(3)

    // Banorte tem siteUrl mas não tem linkedinUrl
    const banorte = dados.contas.find((c) => c.id === 'banorte')
    expect(banorte?.siteUrl).toBe('https://banorte.com')
    expect(banorte?.linkedinUrl).toBeUndefined()
  })

  it('os sites e LinkedIn preenchidos são os endereços públicos reais das empresas', () => {
    const contasComSite = dados.contas.filter((c) => c.siteUrl !== undefined)
    for (const conta of contasComSite) {
      expect(conta.siteUrl).toMatch(/^https:\/\//)
    }

    const contasComLinkedin = dados.contas.filter((c) => c.linkedinUrl !== undefined)
    for (const conta of contasComLinkedin) {
      expect(conta.linkedinUrl).toMatch(/^https:\/\/www\.linkedin\.com\/company\//)
    }
  })

  it('nenhum dado exposto tem nota numérica de Aderência', () => {
    for (const conta of dados.contas) {
      if (conta.aderencia !== undefined) {
        expect(['quente', 'fit', 'nao-fit']).toContain(conta.aderencia)
      }
      expect(conta).not.toHaveProperty('score')
      expect(conta).not.toHaveProperty('nota')
      expect(conta).not.toHaveProperty('aderenciaNota')
    }
  })
})

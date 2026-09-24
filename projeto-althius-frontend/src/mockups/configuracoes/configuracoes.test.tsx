import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MockupDeConfiguracoes } from './mockup'

function renderizarMockup(rota = '/configuracoes/perfil') {
  const usuario = userEvent.setup()
  render(<MockupDeConfiguracoes rotaInicial={rota} atrasoMs={0} />)
  return { usuario }
}

describe('Mockup de Configurações', () => {
  it('navega por todas as seções, separando o que é pessoal do que é do Workspace', async () => {
    const { usuario } = renderizarMockup('/')

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    const pessoal = screen.getByRole('navigation', { name: 'Pessoal' })
    const workspace = screen.getByRole('navigation', { name: 'Workspace Databricks' })
    expect(within(pessoal).getAllByRole('link').map((l) => l.textContent)).toEqual(['Meu perfil', 'Preferências'])
    expect(within(workspace).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Pessoas e acesso',
      'Memória do Workspace',
      'Plano',
    ])

    const secoes: [string, string][] = [
      ['Preferências', 'Só você'],
      ['Pessoas e acesso', 'Compartilhado com o Workspace'],
      ['Memória do Workspace', 'Compartilhado com o Workspace'],
      ['Plano', 'Compartilhado com o Workspace'],
      ['Ajuda e informações', 'Althius'],
      ['Meu perfil', 'Só você'],
    ]
    for (const [secao, alcance] of secoes) {
      await usuario.click(screen.getByRole('link', { name: secao }))
      expect(screen.getByRole('heading', { level: 2, name: secao })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: secao })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByText(alcance, { selector: '.selo' })).toBeInTheDocument()
    }
  })

  it('valida o perfil, salva o nome no menu pessoal e cancela sem mudar nada', async () => {
    const { usuario } = renderizarMockup()
    const nome = screen.getByLabelText('Nome')
    const email = screen.getByLabelText('E-mail')

    await usuario.clear(nome)
    await usuario.clear(email)
    await usuario.type(email, 'marina@')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument()
    expect(screen.getByText('Informe um e-mail válido, como nome@empresa.com.')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(nome).toHaveValue('Marina Alves')
    expect(email).toHaveValue('marina.alves@databricks.com')

    await usuario.clear(nome)
    await usuario.type(nome, 'Marina A. Costa')
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Perfil salvo')
    expect(screen.getByRole('button', { name: 'Menu do usuário: Marina A. Costa' })).toBeInTheDocument()

    // Sem foto, o perfil mostra as iniciais; um arquivo que não é imagem é recusado.
    await usuario.click(screen.getByRole('button', { name: 'Remover foto' }))
    expect(screen.getByText('MA', { selector: 'span' })).toBeInTheDocument()
    // O seletor do sistema ainda deixa escolher "Todos os arquivos", apesar do accept.
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText('Arquivo da foto'), new File(['x'], 'notas.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('Escolha um arquivo de imagem (JPG, PNG ou WebP).')).toBeInTheDocument()
  })

  it('o formulário de senha valida a confirmação e termina limpo, sem alegar troca real', async () => {
    const { usuario } = renderizarMockup()
    await usuario.click(screen.getByRole('button', { name: 'Alterar senha' }))
    const formulario = screen.getByRole('form', { name: 'Alterar senha' })

    await usuario.type(within(formulario).getByLabelText('Senha atual'), 'antiga-123')
    await usuario.type(within(formulario).getByLabelText('Nova senha'), 'nova-senha-1')
    await usuario.type(within(formulario).getByLabelText('Confirmar nova senha'), 'outra-coisa')
    await usuario.click(within(formulario).getByRole('button', { name: 'Alterar senha' }))
    expect(screen.getByText('A confirmação não é igual à nova senha.')).toBeInTheDocument()
    expect(within(formulario).getByLabelText('Nova senha')).toHaveAttribute('type', 'password')

    await usuario.clear(within(formulario).getByLabelText('Confirmar nova senha'))
    await usuario.type(within(formulario).getByLabelText('Confirmar nova senha'), 'nova-senha-1')
    await usuario.click(within(formulario).getByRole('button', { name: 'Alterar senha' }))
    expect(screen.getByRole('status')).toHaveTextContent('Demonstração: nenhuma senha foi alterada.')

    await usuario.click(screen.getByRole('button', { name: 'Alterar senha' }))
    for (const campo of ['Senha atual', 'Nova senha', 'Confirmar nova senha']) {
      expect(screen.getByLabelText(campo)).toHaveValue('')
    }
  })

  it('representa notificações desligadas, ativadas, bloqueadas e não suportadas, pedindo permissão só depois do clique', async () => {
    const { usuario } = renderizarMockup('/configuracoes/preferencias')
    const interruptor = screen.getByRole('switch', { name: 'Ativar notificações do navegador' })
    expect(interruptor).not.toBeChecked()
    expect(screen.getByText('Desligadas')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Bloquear no pedido simulado do navegador não ativa nada.
    await usuario.click(interruptor)
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bloquear' }))
    expect(screen.getByText('Bloqueadas pelo navegador')).toBeInTheDocument()
    expect(interruptor).not.toBeChecked()

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Navegador simulado' }), 'Ainda não pediu permissão')
    await usuario.click(interruptor)
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Permitir' }))
    expect(screen.getByText('Ativadas')).toBeInTheDocument()
    expect(interruptor).toBeChecked()
    expect(screen.getByText('Revisão do ICP ou das Personas aguardando sua decisão em Aprovações')).toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Navegador simulado' }), 'Sem suporte a notificações')
    expect(screen.getByText('Não suportadas')).toBeInTheDocument()
    expect(interruptor).toHaveAttribute('aria-disabled', 'true')
  })

  it('Administradores convidam, mudam papéis e removem do Workspace, preservando a Conta de usuário e o último Administrador', async () => {
    const { usuario } = renderizarMockup('/configuracoes/pessoas')

    await usuario.click(screen.getByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = screen.getByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('E-mail'), 'joana.lima@databricks.com')
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Administrador' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar convite' }))
    expect(screen.getByRole('status')).toHaveTextContent('nenhum e-mail foi enviado')
    const convites = screen.getByRole('list', { name: 'Convites pendentes' })
    expect(within(convites).getByRole('listitem', { name: 'joana.lima@databricks.com' })).toHaveTextContent('Administrador')
    expect(screen.queryByRole('row', { name: /joana/i })).not.toBeInTheDocument()

    // Rebaixar Rafael deixa Marina como último Administrador: o papel dela fica travado.
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Papel de Rafael Couto' }), 'Membro')
    expect(screen.getByRole('combobox', { name: 'Papel de Marina Alves' })).toBeDisabled()
    const marina = screen.getByRole('row', { name: /Marina Alves/ })
    expect(within(marina).getByText('Último Administrador')).toBeInTheDocument()
    expect(within(marina).getByRole('button', { name: 'Remover do Workspace' })).toBeDisabled()

    await usuario.click(within(screen.getByRole('row', { name: /Thiago Ramos/ })).getByRole('button', { name: 'Remover do Workspace' }))
    const remocao = screen.getByRole('dialog')
    expect(remocao).toHaveTextContent('Conta de usuário (thiago.ramos@databricks.com)')
    expect(remocao).toHaveTextContent('Workspace Evolut Trading · Membro')
    await usuario.click(within(remocao).getByRole('button', { name: 'Remover do Workspace' }))
    expect(screen.queryByRole('row', { name: /Thiago Ramos/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('A Conta de usuário continua ativa, assim como a participação em Evolut Trading')
  })

  it('Membros consultam as pessoas do Workspace sem ações administrativas', async () => {
    const { usuario } = renderizarMockup('/configuracoes/pessoas')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Ver como' }), 'Lucas Moreira · Membro')

    expect(screen.getByRole('row', { name: /Marina Alves/ })).toHaveTextContent('Administrador')
    expect(screen.queryByRole('combobox', { name: /Papel de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover do Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convidar pessoa' })).not.toBeInTheDocument()
  })

  it('um Membro pede revisão do ICP ao Scopus; só um Administrador aprova, e a aprovação atualiza a Memória e as dependências', async () => {
    const { usuario } = renderizarMockup('/configuracoes/memoria/icp')
    const verComo = screen.getByRole('combobox', { name: 'Ver como' })
    await usuario.selectOptions(verComo, 'Lucas Moreira · Membro')

    await usuario.click(screen.getByRole('button', { name: 'Solicitar revisão ao Scopus' }))
    await usuario.type(screen.getByLabelText('O que deveria mudar?'), 'Estamos fechando com empresas menores na Colômbia.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar ao Scopus' }))
    await usuario.click(await screen.findByRole('link', { name: 'Ver em Aprovações' }))

    // Pendente: um pedido só, e o Membro não decide.
    const cartao = screen.getByRole('article', { name: 'Revisar o ICP do Workspace' })
    expect(cartao).toHaveTextContent('Pedido por Lucas Moreira')
    expect(within(cartao).getByRole('region', { name: 'Alterações propostas' })).toHaveTextContent('Brasil, México, Colômbia e Chile')
    expect(within(cartao).queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(cartao).toHaveTextContent('Somente Administradores aprovam ou recusam')
    expect(screen.getByRole('link', { name: 'Aprovações, 1 pendente' })).toBeInTheDocument()

    // Enquanto pendente, o ICP vigente não muda.
    await usuario.click(screen.getByRole('link', { name: 'Configurações' }))
    await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))
    await usuario.click(screen.getByRole('link', { name: 'ICP' }))
    expect(screen.getByRole('region', { name: 'ICP vigente' })).toHaveTextContent('Brasil e México.')
    expect(screen.getByRole('listitem', { name: 'Público recomendado dos Monitoramentos' })).toHaveTextContent('2.000 funcionários ou mais · Brasil e México')

    await usuario.selectOptions(verComo, 'Marina Alves · Administrador')
    await usuario.click(screen.getByRole('link', { name: 'Aprovações, 1 pendente' }))
    await usuario.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(screen.getByRole('article', { name: 'Revisar o ICP do Workspace' })).toHaveTextContent('Aprovada por Marina Alves')
    expect(screen.getByRole('heading', { name: 'Pendentes · 0' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)

    await usuario.click(screen.getByRole('link', { name: 'Configurações' }))
    await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))
    await usuario.click(screen.getByRole('link', { name: 'ICP' }))
    const icp = screen.getByRole('region', { name: 'ICP vigente' })
    expect(icp).toHaveTextContent('Brasil, México, Colômbia e Chile.')
    expect(icp).not.toHaveTextContent('Brasil e México.')
    expect(screen.getByRole('listitem', { name: 'Público recomendado dos Monitoramentos' })).toHaveTextContent(
      '1.000 funcionários ou mais · Brasil, México, Colômbia e Chile',
    )
  })

  it('recusar mantém o contexto; duas aprovações seguidas deixam só a última vigente', async () => {
    const { usuario } = renderizarMockup('/configuracoes/memoria/personas')

    async function pedirEDecidir(decisao: 'Aprovar' | 'Recusar') {
      await usuario.click(screen.getByRole('link', { name: 'Configurações' }))
      await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))
      await usuario.click(screen.getByRole('link', { name: 'Personas' }))
      await usuario.click(screen.getByRole('button', { name: 'Solicitar revisão ao Ethos' }))
      await usuario.click(screen.getByLabelText('O que deveria mudar?'))
      await usuario.paste('Revise com as calls do mês.')
      await usuario.click(screen.getByRole('button', { name: 'Enviar ao Ethos' }))
      await usuario.click(await screen.findByRole('link', { name: 'Ver em Aprovações' }))
      // A Administradora que pediu também decide.
      await usuario.click(screen.getByRole('button', { name: decisao }))
      await usuario.click(screen.getByRole('link', { name: 'Configurações' }))
      await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))
      await usuario.click(screen.getByRole('link', { name: 'Personas' }))
    }

    await pedirEDecidir('Recusar')
    expect(screen.getByRole('region', { name: 'Personas vigente' })).not.toHaveTextContent('Líder de governança de dados')
    expect(screen.getByText(/foi recusada por Marina Alves/)).toBeInTheDocument()

    await pedirEDecidir('Aprovar')
    await pedirEDecidir('Aprovar')
    const personas = screen.getByRole('region', { name: 'Personas vigente' })
    expect(personas).toHaveTextContent('Líder de governança de dados')
    expect(personas).toHaveTextContent('Entra depois da prova de conceito')
    expect(personas).not.toHaveTextContent('Avalia arquitetura, custo de nuvem e governança')
    expect(screen.getByRole('listitem', { name: 'Classificação de Contatos por Persona' })).toHaveTextContent('5 Personas')
    expect(screen.queryByText(/versões anteriores|restaurar/i)).not.toBeInTheDocument()
  }, 30000)

  it('o Resumo da memória abre primeiro; um Membro lê e pergunta, mas não edita nem atualiza', async () => {
    const { usuario } = renderizarMockup('/configuracoes/perfil')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Ver como' }), 'Lucas Moreira · Membro')
    await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))

    const resumo = screen.getByRole('region', { name: 'Resumo da memória' })
    expect(within(resumo).getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(resumo).toHaveTextContent('Atualizado automaticamente')
    expect(screen.queryByRole('button', { name: 'Editar resumo' })).not.toBeInTheDocument()

    const campo = screen.getByLabelText('Pergunte ou atualize as informações')
    await usuario.type(campo, 'Quais são as prioridades?')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('log', { name: 'Conversa sobre o resumo' })).toHaveTextContent('Segundo o resumo')

    await usuario.type(campo, 'Adicione que a Colômbia virou prioridade.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(screen.getByRole('log', { name: 'Conversa sobre o resumo' })).toHaveTextContent('Só Administradores atualizam o resumo')
    expect(resumo).not.toHaveTextContent('A Colômbia virou prioridade')
  })

  it('um Administrador atualiza o resumo pelo campo e editando o texto; a IA também atualiza sozinha', async () => {
    const { usuario } = renderizarMockup('/configuracoes/memoria/resumo')
    const resumo = screen.getByRole('region', { name: 'Resumo da memória' })

    await usuario.type(screen.getByLabelText('Pergunte ou atualize as informações'), 'Adicione que a Colômbia virou prioridade.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(resumo).toHaveTextContent('A Colômbia virou prioridade.')
    expect(resumo).toHaveTextContent('Atualizado agora por Marina Alves')

    await usuario.click(screen.getByRole('button', { name: 'Editar resumo' }))
    const visaoGeral = screen.getByLabelText('Visão geral')
    await usuario.clear(visaoGeral)
    await usuario.type(visaoGeral, 'Texto revisado pela Marina.')
    await usuario.click(screen.getByRole('button', { name: 'Salvar resumo' }))
    expect(resumo).toHaveTextContent('Texto revisado pela Marina.')

    await usuario.click(screen.getByRole('button', { name: 'Simular atualização da IA' }))
    expect(resumo).toHaveTextContent('Atualizado automaticamente agora pelo Oraculum')
    // O ICP não muda com o resumo: continua exigindo aprovação.
    await usuario.click(screen.getByRole('link', { name: 'ICP' }))
    expect(screen.getByRole('region', { name: 'ICP vigente' })).toHaveTextContent('Brasil e México.')
  })

  it('com notificações ativadas, avisa os Administradores do pedido e quem pediu do resultado', async () => {
    const { usuario } = renderizarMockup('/configuracoes/preferencias')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Navegador simulado' }), 'Permissão concedida')
    await usuario.click(screen.getByRole('switch', { name: 'Ativar notificações do navegador' }))
    const verComo = screen.getByRole('combobox', { name: 'Ver como' })

    await usuario.selectOptions(verComo, 'Lucas Moreira · Membro')
    await usuario.click(screen.getByRole('link', { name: 'Memória do Workspace' }))
    await usuario.click(screen.getByRole('link', { name: 'ICP' }))
    await usuario.click(screen.getByRole('button', { name: 'Solicitar revisão ao Scopus' }))
    await usuario.click(screen.getByLabelText('O que deveria mudar?'))
    await usuario.paste('Inclua a Colômbia.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar ao Scopus' }))
    await usuario.click(await screen.findByRole('link', { name: 'Ver em Aprovações' }))
    expect(screen.queryByRole('list', { name: 'Avisos do navegador (simulados)' })).not.toBeInTheDocument()

    await usuario.selectOptions(verComo, 'Rafael Couto · Administrador')
    expect(screen.getByRole('list', { name: 'Avisos do navegador (simulados)' })).toHaveTextContent('Revisão do ICP aguardando Aprovação')
    await usuario.click(screen.getByRole('button', { name: 'Recusar' }))

    await usuario.selectOptions(verComo, 'Lucas Moreira · Membro')
    expect(screen.getByRole('list', { name: 'Avisos do navegador (simulados)' })).toHaveTextContent('Sua revisão do ICP foi recusada')
  })

  it('mostra o plano com participantes, Execuções no período e upgrade “Em breve”, e abre ajuda, feedback, termos e privacidade', async () => {
    const { usuario } = renderizarMockup('/configuracoes/plano')
    const plano = screen.getByRole('region', { name: 'Plano atual' })
    expect(plano).toHaveTextContent('Demonstração')
    expect(within(plano).getByRole('button', { name: 'Fazer upgrade' })).toBeDisabled()
    expect(within(plano).getByText('Em breve')).toBeInTheDocument()
    expect(screen.getByText('Período: 01/09/2026 a 24/09/2026.')).toBeInTheDocument()
    expect(screen.getByText('1.284')).toBeInTheDocument()
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Ajuda e informações' }))
    expect(screen.getByRole('region', { name: 'Central de ajuda' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Enviar feedback' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar feedback' }))
    expect(screen.getByText('Escreva seu feedback antes de enviar.')).toBeInTheDocument()
    await usuario.type(screen.getByLabelText('Mensagem'), 'Gostei da Memória do Workspace.')
    await usuario.click(screen.getByRole('button', { name: 'Enviar feedback' }))
    expect(screen.getByRole('status')).toHaveTextContent('Nada foi enviado para fora da Althius.')

    for (const documento of ['Termos de serviço', 'Política de privacidade']) {
      await usuario.click(screen.getByRole('link', { name: documento }))
      const pagina = screen.getByRole('article', { name: documento })
      expect(within(pagina).getByText('Conteúdo provisório')).toBeInTheDocument()
      expect(within(pagina).getByRole('navigation', { name: `Seções de ${documento}` })).toBeInTheDocument()
    }
  })
})

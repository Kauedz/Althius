# 27: Vários e-mails e telefones por Contato, e escolher qual usar em cada passo da Sequência

**What to build:** um Contato passa a ter até três e-mails e até três telefones, cada um com seu tipo, e cada passo de e-mail ou de telefone da Sequência escolhe qual deles usar (o número 1 no primeiro passo, o número 3 no último).

**Blocked by:** a edição de Contato na tela (nota nos Comments do ticket 05). Depois dela, o formulário de edição ganha as listas.

**Status:** ready-for-agent

## Decisões do Nan (2026-09-29)

1. Rótulo por **lista fixa**, não texto livre. E-mail: Trabalho, Pessoal, Outro. Telefone: **Celular** ou **Fixo**.
2. **Limite de 3** e-mails e de 3 telefones por Contato.
3. Um e-mail (e um telefone, e um LinkedIn) continua pertencendo a **um só Contato** no Workspace, como hoje.
4. WhatsApp existe também em telefone fixo. Por isso "usa WhatsApp" é uma marca **por telefone**, independente de ser celular ou fixo: o passo de WhatsApp escolhe entre os telefones marcados, e um passo de ligação (quando existir) entre todos.
5. Pode mexer nas funções do outro desenvolvedor, **sem quebrar nada**.

## Desenho (o agente pode ajustar o detalhe, não o contrato)

- **O principal continua onde está.** `contacts.email` e `contacts.phone` (hoje o WhatsApp do Contato) seguem sendo o e-mail e o telefone **principais**. Por isso `create_contact`, `update_contact`, `link_contact`, `end_contact_link`, a importação por CSV, a foto, o arquivar e o apagar continuam funcionando sem mudança. Não redefinir essas cinco funções.
- **Os adicionais entram em tabelas novas**, com RLS, sem acesso direto dos papéis do app, no Workspace do Contato: até 2 e-mails adicionais (rótulo) e até 2 telefones adicionais (tipo celular ou fixo, e a marca "usa WhatsApp"), com posição. O principal também tem tipo e marca de WhatsApp (colunas novas anuláveis em `contacts`, com padrão que preserve o que existe: o telefone atual é celular e usa WhatsApp).
- **Unicidade no Workspace** entre principal e adicionais: um valor não pode estar em dois Contatos, nem duas vezes no mesmo. Gatilhos nos dois lados (o índice único não cruza tabelas). E-mail comparado sem diferença de maiúsculas, telefone pela mesma normalização de hoje.
- **Funções novas, só para authenticated**, com a mesma regra de permissão do `update_contact` (Administrador, ou o responsável por todas as Contas em que o Contato atua), `security definer`, `search_path` vazio: ler todos os canais de um Contato (principal primeiro, depois os adicionais, na ordem) e gravar a lista inteira de uma vez (troca atômica, permitindo mudar qual é o principal). Limite de 3 e valores duplicados recusados com erro claro.
- **Passo da Sequência.** O passo (documento privado) ganha `destino`, a posição 1 a 3 do e-mail ou do telefone (1 é o principal; ausente vale 1), sem migração de dados. Na tela do passo, o seletor mostra os e-mails (ou telefones) do Contato com o rótulo, e "número 1, número 2, número 3".
- **`confirm_sequence_step_send` (e a versão do WhatsApp, se já existir na main)** escolhe o e-mail da posição indicada em vez de `contacts.email`, e recusa com erro claro se essa posição não existe. **O envio (`release`)** hoje bloqueia com `destination_changed` se o e-mail atual do Contato difere do destino fixado: passa a bloquear se o destino fixado **deixou de ser qualquer um dos e-mails do Contato**. Esse é o ponto mais delicado: manter o destino fixado na confirmação (ADR-0014) e nunca enviar para um endereço que o Contato não tem mais. Estas funções foram escritas nas migrations de envios de passo por e-mail, variáveis do passo e executor; redefinir por `create or replace` numa migration nova, conferindo antes qual é a definição mais recente na main.
- **Formulário de edição** (do agente anterior): listas com o rótulo, a marca de WhatsApp, "tornar principal" e remover, respeitando o limite de 3.
- **Contatos e Conta:** a lista mostra o principal e um "+2" (ou similar) para os demais, sem quebrar a tabela.
- **Apagar (CRM-18):** as tabelas novas têm dado pessoal. Apagar o Contato as apaga junto (cascata), e as varreduras por e-mail e telefone (linhas cruas do CSV, Memória dos Agentes, contatos legados, Interações) passam a considerar também os valores adicionais. Estender o pgTAP de varredura.
- **Fora deste ticket (anotar como pendência):** colunas "Email 2", "Telefone 2" na importação por CSV; LinkedIn continua um só por Contato.

## Critérios

- [ ] O Contato guarda até 3 e-mails e 3 telefones, com rótulo e tipo da lista fixa, e a marca de WhatsApp por telefone; o principal continua em `contacts.email` e `contacts.phone`.
- [ ] Nada que existe quebra: `create_contact`, `update_contact`, `link_contact`, `end_contact_link`, a importação, a foto, o arquivar e o apagar seguem passando nos pgTAP atuais sem alterar o teste.
- [ ] Um valor não pertence a dois Contatos do Workspace, entre principal e adicionais, em qualquer ordem de escrita, inclusive sob concorrência.
- [ ] Trocar o principal funciona e mantém os campos de `contacts` coerentes.
- [ ] O passo escolhe a posição do e-mail ou do telefone; a confirmação fixa esse destino; o envio só sai para um endereço que o Contato ainda tem.
- [ ] Apagar o Contato remove todos os canais e as varreduras acham zero resíduo.
- [ ] Tela: editar as listas, ver o principal e os demais na lista, escolher o destino no passo. Só no Workspace operacional; a Demonstração não muda.

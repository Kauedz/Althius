# Handoff: enriquecimento-03, ação em lote de revelar e-mail com custo máximo

Branch: `ralph/enriquecimento-03-lote-email-custo-maximo`. Ticket: `.scratch/enriquecimento-em-cascata/issues/03-revelar-email-e-telefone.md`. Worktree a partir da `main` 515c2eb.

## Gate

Passou, com escopo reduzido pelos próprios Comments do ticket (datados de 2026-10-07 e 2026-10-08): os critérios 1 (não achou não debita) e 2 (unicidade entre Contatos) já estão cobertos pelo B3 da `prospeccao-funcional`, já em `main`. O único em aberto era o critério 3: "Ação em lote mostra o custo máximo antes de rodar". Telefone fica fora de tudo: o PR #263 (B5, recusa de telefone na RPC `begin_reveal_contact`) ainda não está em `main` nesta data, mas isso não bloqueava o critério 3 — a tela e o handler já recusavam telefone antes desta sessão, e a UI nova nunca o oferece.

## O que entrou

Só frontend, sem migration:

- `src/paginas/revelar-email-em-lote.tsx` (novo): `DialogoRevelarEmailEmLote`. Custo máximo calculado no cliente, sem RPC — `2 × quantidade de Contatos selecionados sem e-mail` (quem já tem e-mail entra na seleção mas custa 0, é só informativo no resumo). Confirmar chama `fonte.revelarContato(id, 'email')` um Contato de cada vez, só para quem precisa; a falha de um (try/catch por item) não trava os demais. Reaproveita `mensagemDaRevelacaoDeEmail`.
- `src/paginas/comite-e-enriquecimento.tsx`: extraída `mensagemDaRevelacaoDeEmail(res)` (já encontrado / encontrado com custo / nenhum novo) de dentro de `confirmarRevelacao` em `BotoesRevelarContato`, para a ação por linha e a em lote não duplicarem o texto. Comportamento e as três frases são exatamente as mesmas de antes; os testes existentes dessa tela não mudaram.
- `src/paginas/tabela-de-contatos.tsx`: `TabelaDeContatos` ganhou duas props opcionais, `selecionados` e `aoAlternarSelecao`. Sem elas (como em `detalhe-conta.tsx`, que não foi tocado), a tabela fica idêntica a antes. Com elas, cada linha ganha um checkbox `aria-label="Selecionar <nome>"`, inserido como **primeiro filho** da `div` da célula Nome, **antes** do `AvatarDoContato` — de propósito, para não mudar qual elemento é o `lastElementChild` dessa `div` (`contatos.test.tsx` usa `getAllByRole('cell')[0].lastElementChild?.lastElementChild?.textContent` para pegar o nome em dois testes).
- `src/paginas/contatos.tsx`: estado `selecionados`/`loteAberto`, botão "Revelar E-mail em lote" no cabeçalho (só aparece com `fonte.revelarContato` e pelo menos um selecionado, mesmo padrão de `contas.tsx`/"Criar Sequências"), e o `DialogoRevelarEmailEmLote` montado com os Contatos selecionados.
- `src/paginas/revelar-email-em-lote.test.tsx` (novo, 4 testes).

Nenhuma migration, Edge Function ou `set_contact_channels` tocados. Nenhum arquivo da lista "Não mexa" do ticket.

## Loop

Vermelho primeiro: com a implementação revertida via `git stash` (e o arquivo novo movido para fora do repo), `revelar-email-em-lote.test.tsx` deu 3 de 4 vermelhos (o único verde era "sem seleção o botão não aparece", trivial sem a feature). Restaurado e verde de novo.

Resultados:

- `npx tsc -b`: limpo.
- `npx oxlint`: só os avisos pré-existentes do tipo `react(only-export-components)` (o mesmo padrão já usado em `tabela-de-contatos.tsx` para `temDadosDeContato` e em `contas.tsx`); nenhum erro.
- `npx vitest run` nos arquivos tocados e em todo consumidor conhecido de `TabelaDeContatos`/`BotoesRevelarContato`: `revelar-email-em-lote.test.tsx` (4), `contatos.test.tsx` (18), `contas.test.tsx`, `arquivar-e-apagar.test.tsx`, `comite-e-enriquecimento-revelar.test.tsx`, `cotacao-revelacao.test.tsx`, `comite-e-enriquecimento-nao-recobrar.test.tsx`, `detalhe-conta.test.tsx` — 84 testes, todos verdes, nenhum teste existente mudou. A suíte Vitest completa (`npx vitest run`) foi disparada em background mas não terminou dentro do tempo desta sessão (máquina compartilhada com outras sessões Ralph rodando ao mesmo tempo); os arquivos acima cobrem toda a superfície tocada.
- pgTAP: confirmados de novo (sem alterar nada) os dois arquivos que provam os critérios 1 e 2, já em `main`: `revelar_email_so_cobra_valor_novo.sql` 29/29 e `enriquecimento_e_comite.sql` 29/29, via `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_enriquecimento_03 <arquivo>`. Nenhum pgTAP novo: nenhuma migration nesta sessão.
- Autorrevisão (`code-review`, dois agentes paralelos Standards/Spec): nenhuma violação de padrão documentado nem scope creep (telefone não aparece em lugar nenhum da UI nova; o cálculo do custo é 100% local, sem chamada de rede). Achado aplicado: duplicação literal da mensagem de resultado entre `BotoesRevelarContato` e o lote — corrigida extraindo `mensagemDaRevelacaoDeEmail`. Também limpo, no mesmo gesto, um estado `erro` morto que sobrou de um rascunho anterior do `FormularioDoLote` (nunca era populado, já que o erro por Contato vai para a lista de resultados).

## Avisos

- Depois de fechar o diálogo do lote, a seleção (`selecionados`) não é limpa automaticamente — mesmo comportamento de `contas.tsx`/`DialogoCriacaoEmLote` (não limpa `selecionadas` ao fechar), mantido por consistência. Reabrir o lote com os mesmos Contatos marcados já mostra custo 0 para quem foi revelado com sucesso.
- O botão do lote é gated só por `fonte.revelarContato` (não pelo `comAcoes` que controla a coluna Ações/BotoesRevelarContato por linha): são capacidades diferentes, e a tela de Contatos da Demonstração tem `revelarContato` mas não tem `editarContato`/`arquivarContato`/`apagarContato`, então o botão em lote aparece ali mesmo sem a coluna Ações.

## Pendente de deploy

Nenhum. Sem migration, sem Edge Function, sem segredo.

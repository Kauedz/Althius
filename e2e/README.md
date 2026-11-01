# Smoke de produção (e2e)

Verificação automática depois de cada deploy, contra a produção (`https://app.althius.com.br`), com uma conta QA isolada. Serve para nenhum critério de aceite ficar como "pendente de verificação humana": o bot roda a suíte, guarda o relatório e anexa a evidência ao ticket.

A suíte **não roda no CI**. Ela fala com a produção e precisa de segredos que só existem na máquina de quem roda.

## O que cada teste cobre

| Arquivo | Critério |
| --- | --- |
| `tests/01-entrada.spec.ts` | `/entrar` mostra o formulário (sem enviar). Com a sessão do QA, `/` abre o Workspace operacional (não a Demonstração), com `bootstrap_personal_workspace` e `list_my_contracted_workspaces` em 200 e o Workspace QA entre os contratados. |
| `tests/02-day0-icp.spec.ts` | Day0 operacional: papel, empresa, domínio e "como conheceu" vão para `save_my_day0`, sobrevivem a um recarregamento e voltam por `get_my_day0`; o Day0 termina concluído. ICP: o texto da seção ICP do Playbook (começando pelo ICP de teste do QA) é salvo e volta depois de recarregar; a tela não mostra mais os Campos do ICP. |
| `tests/03-para-o-seu-nicho.spec.ts` | `/sinais`: a prateleira "Para o seu nicho" com cards e o subtítulo pelos Segmentos do ICP da Memória (ou o texto de sem nicho), sem chamar `list_signal_catalog_for_my_icp`. A letra interna do nicho (A–H) não aparece. |
| `tests/04-link-de-acao.spec.ts` | `/a/<token inválido>` com sessão mostra "Este link não existe ou pertence a outra Conta.", sem botões de decisão. Sem sessão, manda para `/entrar` guardando o destino. |
| `tests/05-sinais.spec.ts` | `/sinais` abre no Workspace operacional, com `list_signal_monitors` e `list_signal_catalog` em 200 e sem alerta de erro. |
| `tests/api/06-signal-plan.spec.ts` | A função `signal-plan` publicada, chamada com o JWT do QA, devolve um Plano da IA (sem aviso de regra) que cita setor, porte ou geografia do ICP do QA. Não grava Sinal: quem grava é `save_signal_plan`, que a suíte nunca chama. Conta 1 no limite de 20 Planos por dia do Workspace QA. |
| `tests/09-pedir-sequencia.spec.ts` | Sinais first 11: no detalhe de uma Conta Quente sob a responsabilidade do QA, "Gerar Sequência" (antes "Pedir Sequência ao Rhetor"; agora em qualquer Conta-alvo) começa uma Conversa coordenada nova e vai para `/conversa`, nunca para `/agentes/<id>/conversa`. O QA não tem Conta-alvo, então a Conta é de mentira, só no navegador (`target_accounts`, `sales_responsibilities`, o foguinho de `list_account_signals` e as RPCs de leitura com o id dela são respondidos pelo teste). O pedido à `agent-conversation` é interceptado e respondido com recusa: o teste confere `action: send`, `agentId: null`, `conversationId: null` e o id da Conta no texto. O clique tem que ser em "Gerar Sequência", e não em "Criar sequência" ao lado, que abre um modal sem navegar. O relatório guarda o bundle no ar, a URL antes e depois e um print depois do clique (cadencia-pela-ia 04). Nenhuma escrita sai. |

Todos os testes de tela também reprovam com erro de JavaScript na página ou resposta 5xx de `/rest/v1`, `/functions/v1` ou `/auth/v1`. Em falha, ficam o print, o trace e o contexto da página no relatório.

## Como rodar

```bash
cd e2e
npm ci
npx playwright install chromium
npm run smoke:prod                       # relatório em e2e/relatorio/<data>/
SMOKE_OUT=/caminho/do/relatorio npm run smoke:prod
npm run smoke:relatorio -- /caminho/do/relatorio/html   # abre o HTML
```

## Variáveis

Lidas do ambiente ou de um arquivo `KEY=VALUE` fora do repositório (`ALTHIUS_QA_ENV_FILE`, padrão `~/.althius-qa.env`, com `chmod 600`). O ambiente vale mais que o arquivo. Nada disso entra no git.

- `ALTHIUS_QA_BASE_URL`, `ALTHIUS_QA_SUPABASE_URL`, `ALTHIUS_QA_PUBLISHABLE_KEY` (a chave publicável, a mesma do app)
- `ALTHIUS_QA_EMAIL`, `ALTHIUS_QA_WORKSPACE_ID`
- `SUPABASE_SERVICE_ROLE_KEY`: só para abrir a sessão do QA (veja abaixo)
- `SUPABASE_ACCESS_TOKEN`: não é mais usado pela suíte (o ICP de teste entra pela RPC do Playbook com a sessão do QA)
- `ALTHIUS_QA_PROJECT_REF` (opcional; sai do `ALTHIUS_QA_SUPABASE_URL`)

## Por que a sessão vem de um link mágico do Admin

O login com senha de produção tem CAPTCHA (Turnstile), que um robô não resolve, e não queremos desligar o CAPTCHA. O `globalSetup` gera um link mágico do QA pelo Admin do Supabase Auth e o verifica como o navegador faria; a sessão resultante vai para o `localStorage` do navegador do teste (`e2e/.auth/`, fora do git). O formulário de entrada é conferido à parte, sem enviar.

## Isolamento da conta QA

- O Workspace "QA Althius (automação)" é só do QA: sem Contas-alvo nem Contatos reais, sem créditos, sem canais conectados, sem Automação e com o Teto interno no mínimo. Ele não consegue enviar LinkedIn, WhatsApp nem e-mail, nem disparar uma varredura paga.
- Os testes nunca ativam Sinal, enviam mensagem, conectam canal, compram ou criam Sequência.
- O ICP de teste (logística e transporte, 51 a 200 funcionários, Sul do Brasil e México) entra, quando falta, como uma versão nova da seção ICP do Playbook pela RPC `save_playbook_section` (ADR-0034), com a sessão do QA e só no Workspace QA.

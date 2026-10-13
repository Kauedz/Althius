# 14: Fontes que os testes reais reprovaram

**What to build:** Corrigir as quatro fontes que o teste real de 13/10/2026 (relatório em anexo) mostrou erradas, sem gravar Sinal ruim e sem citar fornecedor de coleta para o usuário.

1. **DOU** (`mudanca_regulatoria` e `licenca_instalacao_dou`): o principal que ignora termo e data (sempre devolve atos de abril de 2026 e cobra caro) deixa de ser o primeiro. O monitor do Diário Oficial, com entrada `{q:[...], s:'DO1'}`, passa a ser o principal das duas. Ele só olha cerca de 3 dias e casa palavra solta: a regra fica só com a frase exata (por exemplo "licença de instalação") dentro da janela. `licenca_instalacao_dou` ganha caminho de reserva. A reserva dispara também quando o principal devolve resultado que não confere com a consulta nem com a janela de datas, não só quando a execução falha.
2. **Grupo A cativo** (`grupo_a_cativo`): a lista aberta de consumidores livres responde 403 "Acesso bloqueado" (API e o download do CSV, daqui e da VPS). Sem outra URL que responda, a cascata degrada de forma explícita: o Sinal sai sem a exclusão, marcado de que a lista não foi consultada. Lista maior do que o limite de leitura continua sem afirmar "cativo".
3. **Nova cooperativa** (`nova_cooperativa`): só empresa ativa, aberta dentro da janela da cascata e de CNAE do agro. Cooperativa baixada, de 2007 ou fora do agro não vira Sinal. A busca principal pede os CNAEs do agro entre as empresas novas; se o que volta não passa no filtro, a outra base assume.
4. **CNPJ novo** (`cnpj_novo`): MEI e empresário individual (natureza jurídica 2135, e natureza parecida de pessoa, ou razão social com CPF) são descartados antes de gravar Sinal. Nenhum nome de pessoa segue.

**Blocked by:** nenhum (os tickets 05, 06, 07, 08 e 11 já semearam as cascatas; esta correção é migração nova por cima).

**Status:** ready-for-human

## Pode mexer

- Migração nova em `supabase/migrations/` com timestamp maior que `20261014130000`, e o pgTAP novo em `supabase/tests/`. Ajustar só as asserções dos pgTAP antigos que cravam o actor ou o teto que esta migração troca (`cascatas_icp_c.sql`, `cascatas_icp_e.sql`, `cascatas_icp_h.sql`).
- `supabase/functions/_shared/cascata-de-sinais/motor.ts` e `tipos.ts`: a reserva dispara quando o resultado não confere com a consulta e a janela, além da falha. O gancho é opcional (`confereConsulta`); passo que não o declara segue como hoje.
- `passos/icp-c.ts`, `passos/icp-e-licencas.ts`, `passos/icp-d.ts`, `passos/icp-h.ts`, `passos/icp-b.ts` e os testes desses passos, mais `motor.test.ts` e as fixtures que espelham a semente (`icp-d-fixtures.ts` e as defs dentro dos testes).
- `.scratch/sinais-cascata/` (este ticket e o status) e `.scratch/RALPH-STATUS.md`.

## Não mexa

- Migrações já escritas (não se edita arquivo aplicado; a correção é arquivo novo).
- Segredos, Supabase Auth, deploy de função e `apply_migration` / `execute_sql` de escrita no projeto remoto.
- Frontend, Hermes, catálogo da tela e os outros ICPs (A, F, G e o resto de B, C, D, E, H).
- A regra de lista incompleta do Grupo A: lista que não cabe no limite de leitura continua sem afirmar mercado cativo.

## Critérios

- [x] O principal das duas cascatas do DOU é o monitor, com `{q, s:'DO1'}`. `licenca_instalacao_dou` tem reserva. Resultado fora da consulta ou da janela dispara a reserva mesmo com execução bem-sucedida; resultado vazio de verdade não dispara.
- [x] A regra do DOU só emite Sinal com a frase exata dentro da janela. A cadência acompanha a janela de cerca de 3 dias.
- [x] 403 na lista de consumidores livres grava Sinal marcado de que a exclusão não foi feita, sem dizer que a empresa está fora da lista. A lista que não cabe no limite continua falhando sem Sinal.
- [x] Cooperativa baixada, antiga ou fora do agro não vira Sinal; a busca principal pede CNAE do agro.
- [x] Natureza 2135 (e razão com CPF) não vira Sinal, nem quando o CNPJ é de uma Conta. Nome e CPF não aparecem.
- [x] Nenhum texto que o usuário lê cita fornecedor de coleta. pgTAP novo e os deno das cascatas provam.
- [x] Migração só no repositório. Nada aplicado no remoto.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar `supabase/migrations/20261014140000_fontes_das_cascatas_corrigidas.sql` no projeto `ycbdilsmydvzezhlymty`, como manda `docs/agents/migrations.md` (bloco atômico no `execute_sql`, não `apply_migration`). Não aplicar antes do CI. Não é destrutivo: só atualiza a definição dessas cascatas.
2. Publicar as funções que carregam o motor, no PowerShell, na raiz do repositório:

```powershell
npx supabase functions deploy signal-cascade --project-ref ycbdilsmydvzezhlymty
npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty
```

3. Não chamar `set_signal_cascade_state` para `available`: estas cascatas seguem em teste até uma execução real que grave Sinal válido.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Origem: teste real das fontes em 13/10/2026. A lista da CCEE (API e download) respondeu 403 também nesta sessão; não há URL reserva conferida, então a degradação explícita é o caminho.

# icp-site-read

Lê a página inicial do site da empresa e **propõe** o ICP do Workspace (ticket sinais-first 16, ADR-0033 D5): o que vende, para quem (mini-ICP), por que compram, personas e os campos estruturados **Setor**, **Porte** e **Região**. A função **não grava nada** e não cobra créditos: a sugestão aparece no checklist do Day0 e só vira dado quando a pessoa revisa e salva (`save_my_day0` e `save_my_workspace_icp_fields`).

## Quem chama

O navegador, com o JWT da pessoa (`verify_jwt = true`), logo depois de confirmar o domínio no Day0 (ou em "Tentar de novo"). Corpo:

```json
{ "workspaceId": "<uuid>", "dominio": "empresa.com.br" }
```

Resposta `200`: `{ "leitura": { "oQueVende", "miniIcp", "porQueCompram", "personas": [], "setor", "porte", "regiao" } }` ou `{ "leitura": null }` quando não deu para ler (site fora do ar, página que não é HTML, motor desligado, saída inválida ou demora). Com `null` nada é inventado: a pessoa preenche os campos.

## O que faz

1. Valida a entrada (`400` para Workspace ou domínio inválido; IP, `localhost` e domínio sem TLD não passam).
2. `get_my_day0`, com a sessão da pessoa: só lê quando a pessoa é a **criadora** do Workspace (ramo `criador`) e o domínio pedido é **o domínio confirmado** no Day0 (`403` caso contrário).
3. Busca só `https://<domínio>/`: no máximo 3 redirecionamentos, todos no mesmo domínio ou no `www.`, 8 s de prazo, até 512 KB e só `text/html`. Remove scripts, estilos e marcação e guarda até 12.000 caracteres de texto.
4. Monta a sugestão com o motor dos Sinais (`escolherLlmDosSinais`, `SIGNALS_LLM_PROVIDER`), esperando no máximo 25 s. O texto do site vai só na mensagem do usuário, entre `<site>` e `</site>`, e o prompt de sistema manda ignorar qualquer instrução dentro dele.
5. Confere a saída: textos cortados nos limites, Porte só com as faixas aceitas pelo banco (`1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5001-10000`, `10001+`, `MEI`, `ME`, `EPP`, `DEMAIS`), até 10 setores e regiões e 8 personas. Saída inválida vira `{ "leitura": null }`.

Erros em palavras do produto, sem texto do modelo, do site ou do fornecedor: `400`, `401` sem sessão, `403` sem permissão para ler esse domínio, `405`. O motivo técnico (`sem_motor`, `site_indisponivel`, `saida_invalida`, `falhou`) fica no log, sem o texto do site.

## Motor e segredos

Nenhum segredo novo e nenhum fornecedor pago novo: os mesmos de `signal-plan` (`SIGNALS_LLM_PROVIDER` e, com `openai`, `OPENAI_API_KEY` e `OPENAI_MODEL`; `APP_ORIGIN`, `SUPABASE_URL` e a chave de serviço para a fila do Hermes). Com `regra` ou sem valor, a função responde `{ "leitura": null }`.

## Testes

`deno test supabase/functions/icp-site-read` (sem rede: o `fetch` e o motor são falsos).

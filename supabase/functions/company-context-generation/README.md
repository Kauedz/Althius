# company-context-generation

Gera o **Contexto da empresa** (Empresa, Perfil de cliente ideal e Personas) lendo o site da empresa. Spec: `.scratch/contexto-da-empresa/` (ticket 02).

## Quem chama

O navegador, com o JWT de um Administrador (`verify_jwt = true`), em Configurações → Contexto da empresa (e, no ticket 03, ao fim do onboarding). Corpo:

```json
{ "workspaceId": "<uuid>", "site": "empresa.com.br" }
```

`site` é opcional: sem ele, lê o site já cadastrado. Resposta `202 { "generationId", "estado": "gerando" }`. O andamento e o resultado chegam pela tela, em `get_company_context` (`generation`).

## O que faz

1. Valida a entrada (`400` para Workspace inválido ou site que não é domínio público: IP, `localhost`, `.local`, `.internal`, sem TLD).
2. `start_company_context_generation`, com a sessão da pessoa: só Administrador ativo (`403`); grava o site informado no cadastro da empresa; sem site nenhum, `422`. Havendo leitura em andamento, devolve a mesma e não lê de novo: repetir não gasta nem grava em dobro.
3. Em segundo plano (`EdgeRuntime.waitUntil`): lê `https://<site>/` e até cinco páginas pertinentes que ela liga (soluções, produtos, serviços, sobre, clientes, casos, segmentos), só no mesmo domínio ou no `www.`, só https, sem porta nem credencial, até 3 redirecionamentos dentro do domínio, 8 s e 512 KB por página, 28 mil caracteres no total.
4. Pede os três textos ao motor dos Sinais (`escolherLlmDosSinais`), esperando até 90 s. O texto das páginas vai só na mensagem do usuário, entre `<pagina>` e `</pagina>`; o prompt manda ignorar qualquer instrução dentro delas, distinguir a empresa, os compradores dela e os clientes deles, marcar inferências como sugestão e nunca inventar clientes ou números.
5. Confere a saída (só os três textos, até 12 mil caracteres cada) e grava com a chave de serviço (`finish_company_context_generation`), com as páginas lidas, o motor, a versão do prompt (`contexto-v1`) e o custo, para diagnóstico.

O banco decide o que acontece com o resultado: sem nenhuma versão no Workspace, a geração fica vigente; com versão (inclusive uma salva à mão durante a leitura), vira sugestão para o Administrador aceitar ou descartar; falha, descarte e resposta repetida nunca mexem na versão vigente. Uma leitura que não responde em 5 minutos vira falha e libera nova tentativa.

Falhas, em palavras do produto na tela: `site_insuficiente` (o site não basta; nada é inventado), `site_indisponivel`, `sem_motor`, `saida_invalida`, `falhou`. Nada do texto do site, do modelo ou do fornecedor vai para o log ou para o navegador.

## Custo

Ler o site não cobra crédito. O custo do motor fica registrado na Geração.

## Testes e avaliação

- `deno test supabase/functions/company-context-generation` (sem rede: `fetch` e motor falsos), incluindo os seis casos de avaliação da spec em `__fixtures__/sites.ts`.
- Com o modelo de verdade: `OPENAI_API_KEY=... OPENAI_MODEL=... deno run --allow-env --allow-net scripts/avaliar-contexto-da-empresa.ts`. O resultado é revisado por uma pessoa (ticket 08).

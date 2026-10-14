# 05: Nota com Encaixe ICP mais o peso dos Sinais

**What to build:** `pontuacao.ts` com pesos por tipo e decaimento, e a nota calculada na leitura em SQL com a mesma curva; a tela só recebe o nível.

**GATE:** só migração nova (versão maior que `20261017160000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail); textos da tela em pt-BR, sem letra de nicho A–H e sem emojis; nenhuma mudança de rota, menu ou layout.

**Blocked by:** 01.

**Status:** ready-for-agent

## Critérios
- [ ] Pesos por tipo de Sinal numa constante documentada em `pontuacao.ts`; peso cheio até 30 dias, zero em 90.
- [ ] A nota é Encaixe ICP mais os Sinais, com teto para os Sinais; o nível (alto, médio, baixo, sem dado) sai da nota.
- [ ] `list_discovered_accounts` ordena pela nota e, no empate, pelo Sinal mais recente, e devolve o nível, nunca o número (ADR-0006).
- [ ] A curva, o teto e os cortes de nível são os mesmos no TypeScript e no SQL, com teste dos dois lados.

## Passos do Nan

Aplicar as migrações do PR na ordem e publicar as Edge Functions listadas no corpo do PR (`docs/agents/migrations.md`).
Não usar `apply_migration`; conferir `md5(statements[1])` contra o `md5sum` do arquivo.

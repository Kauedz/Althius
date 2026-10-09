# B3: Revelar e-mail só cobra valor novo

**What to build:** revelar o e-mail de um Contato cobra os 2 créditos só quando grava um e-mail que esse Contato ainda não tinha. O e-mail entra nos canais dele (o principal ou um adicional em `contact_emails`, até três). A origem gravada respeita `p_source`. Se o actor não acha e-mail novo, nada é debitado e o e-mail que já estava permanece. Se o actor falha, a tela mostra falha, não "não encontrado". O telefone aparece indisponível e não reserva crédito.

**Blocked by:** B2. Os dois editam o provedor de contatos, o handler e `comite-e-enriquecimento.tsx`. O merge na `main` espera o 00.

**Status:** ready-for-human (código fechado, com a leitura do e-mail confirmada na execução real; faltam aplicar a migration e publicar a função)

- [x] A entrada de `harvestapi~linkedin-profile-scraper` é a do schema do build atual na API do Apify. Leia o schema nessa hora. Não trate `profileUrls` e `findEmail` como corretos e não invente a substituição. Vale o mesmo para o campo do e-mail na saída: o registro do actor já diz que esse nome não estava documentado; confirme no build e, se o schema não trouxer o campo, pare e pergunte. Não chute o nome.
- [x] `finish_reveal_contact` deixa de usar `coalesce(email, …)`. E-mail igual a um que o Contato já tem (principal ou adicional) não debita e não é regravado. E-mail novo entra no primeiro lugar livre, até três, pela escrita de canais que já existe (`set_contact_channels` e `private.contact_emails`). Com os três lugares ocupados por outros e-mails, não debita e não apaga nenhum.
- [x] `p_source` é usado. A origem do campo fica `automatico`. O texto de `p_source` (o provedor) fica gravado onde o schema já guarda a procedência do dado coletado. A origem não vira o literal `apify` no check que só aceita `manual`, `importacao` e `automatico`. Um `update` direto em `contacts.email` deixa de marcar a origem como manual por acidente do gatilho.
- [x] Falha do actor (exceção, timeout) libera a reserva, debita zero e a resposta diz que falhou. "Não encontrado" fica para o actor que terminou sem e-mail novo.
- [x] O custo em dólares da execução fica gravado no mesmo registro de custo dos outros actors.
- [x] A tela de telefone não abre cotação, não chama `revelar-contato` com `telefone` e não mostra "5 créditos". Mostra que a revelação de telefone está indisponível. O handler recusa `telefone` antes de reservar crédito e antes de chamar o actor.
- [x] Deno cobre: e-mail novo debita 2 e grava; e-mail repetido debita 0; falha não parece "não encontrado"; `telefone` não reserva. pgTAP cobre `contact_emails`, a origem e que outro Workspace não lê o e-mail.

## Pode mexer

- `revelarContato` em `supabase/functions/_shared/provedor-de-contatos.ts`
- O ramo `revelar-contato` de `supabase/functions/account-enrichment/handler.ts` e o teste em `handler.test.ts`
- `finish_reveal_contact`, redefinida numa migration nova a partir do corpo de `20261001190000_enriquecimento_e_comite.sql` (não edite esse arquivo)
- Os botões de revelar em `projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx`
- `revelarContato` e `cotarRevelacaoContato` em `supabase-contas.ts`, no que o telefone passa a recusar
- pgTAP novo

## Não mexa

- O ramo `cnpj-receita` e o ramo `comite-compra` como o B1 e o B2 os deixarem.
- `buscarPessoas` e a Persona do Contato.
- Implementar busca de telefone. A recusa é o comportamento.
- `grant_credits`.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.
- Testes antigos de `varios_emails_e_telefones_por_contato.sql` e de `enriquecimento_e_comite.sql`. O caso novo vai no pgTAP novo.

## Migration

Uma, timestamp UTC maior que `20261002112000`, para `finish_reveal_contact` e, se ainda não houver lugar para o provedor de `p_source`, a coluna mínima que o guarda junto do e-mail. Não alargue o check de `origin` para aceitar nome de provedor. pgTAP próprio.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`.
2. Publicar a função, no PowerShell, na raiz:

```powershell
npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty
```

Quem executa o ticket não aplica migration nem deploy no remoto.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os sete critérios estão em aberto. O ticket cobre os critérios 1 e 2 do enriquecimento 03 (lá marcados como duplicados), a parte do revelar do `creditos-e-planos` 01 e a Origem do revelar do enriquecimento 01.
  - Entrada: manda `profileUrls` e `findEmail` (`supabase/functions/_shared/provedor-de-contatos.ts:177-180`); o adaptador validado usa `queries` com a URL inteira (`signal-runner/adaptadores/mudanca-de-emprego.ts:29`). Adivinha o campo do e-mail entre `email`, `personalEmail` e `workEmail` (`:194-198`); o registro do actor diz que esse campo não está documentado (`20261001170000:279`).
  - `finish_reveal_contact`: `coalesce` em `20261001190000_enriquecimento_e_comite.sql:605,610`, liquidando antes em `:600`; `p_source` (`:581`) nunca é usado; `contact_emails` é ignorado. A origem só sai `automatico` porque a chamada vem do cliente admin.
  - Falha: o `catch` devolve `null` (`:218-220`) e a tela diz "Dado não encontrado. Nenhum crédito foi debitado." (`src/paginas/comite-e-enriquecimento.tsx:456`).
  - Custo: não gravado.
  - Telefone: o handler aceita `telefone` (`account-enrichment/handler.ts:495`), `begin_reveal_contact` reserva `phone_revealed` (`:554-555`) e a tela mostra "Revelar Telefone" com 5 créditos (`comite-e-enriquecimento.tsx:482-492,512`; ver o [detalhe da Conta](../../crm-real-e-stack/issues/prints/17-detalhe-da-conta-com-sequencia.jpg)).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed (só "handler revelar-contato: debita 2 créditos para e-mail e só quando acha" e "…quando NÃO acha, não debita nenhum crédito (0 créditos)"); pgTAP `enriquecimento_e_comite.sql` e `varios_emails_e_telefones_por_contato.sql` ok no CI 37707955273.
  - Acréscimo a este ticket, vindo do enriquecimento 03 (critério 2): um e-mail que já é de outro Contato não debita, não grava e libera a reserva. Hoje o 23505 do gatilho de unicidade desfaz tudo, o handler devolve 500 (`account-enrichment/handler.ts:578-582`) e a reserva fica presa até a faxina. Deno e pgTAP para esse caso.
- 2026-10-08: seis dos sete critérios fechados, na branch `ralph/B3-revelar-email`. O critério 1 fica aberto: a entrada está feita, a leitura do e-mail na saída espera a execução real.
  - Schema lido na API pública do Apify em 08/10: build `0.0.135` (`e4ZOkNXYXUbMX2OSY`, 2026-09-03). Entrada: `profileScraperMode` `"Profile details + email search ($10 per 1k)"` e `queries` com a URL do perfil, `maxItems` 1. O build não tem schema de saída, e o exemplo do README (modo sem e-mail) não traz o campo. O `company-employees` e o `profile-search` também não o documentam. Perguntei ao Renan; ele decidiu (08/10) fazer a execução real em produção, depois do merge e do deploy. Até lá, `emailDoPerfil` (`_shared/provedor-de-contatos.ts`) lança "o campo do e-mail na saída do actor ainda não foi confirmado". Um perfil que voltou vira falha, com a reserva liberada e o custo gravado. Não vira "não encontrado". Dataset vazio continua "não encontrado".
  - Migration `20261009030000_revelar_email_so_cobra_valor_novo.sql`. `finish_reveal_contact` grava o e-mail novo no primeiro lugar livre (principal, ou posição 2 ou 3 de `contact_emails`), com as travas de `set_contact_channels`, e só então liquida 2. Repetido (principal ou adicional), de outro Contato, sem lugar, texto que não é e-mail, nada achado e telefone liberam a reserva sem erro. O 23505 do gatilho também libera. A origem do principal gravado é `automatico`, escrita pela função. O provedor fica em `provider`, coluna nova de `private.contact_field_sources` e de `private.contact_emails`. Um gatilho novo zera `provider` na procedência em toda escrita sem o aviso `althius.provedor_da_coleta`, para uma correção manual não herdar o fornecedor (o Renan decidiu manter). A função também confere se a reserva é do Workspace do Contato e da ação do canal. Limitação: `set_contact_channels` apaga e regrava os adicionais, então o provedor de um adicional revelado se perde quando alguém salva a lista.
  - Handler: `telefone` dá 400 antes da sessão, da reserva e do actor. O revelar chama o actor direto, não a cascata, que engolia a exceção. Falha, ou provedor sem revelação, libera a reserva e responde 502 "A busca do e-mail falhou: …". O custo vai para `record_discovery_cost` com 1 perfil consultado. A resposta só devolve o valor quando o banco o gravou.
  - Tela e Fonte: o telefone aparece como "Telefone indisponível", sem cotação, sem chamada e sem "5 créditos". A Fonte recusa `telefone` em `cotarRevelacaoContato` e `revelarContato`, e lê a mensagem de erro da função para a tela mostrar a falha. Sem resultado novo, a tela diz "Nenhum e-mail novo encontrado. Nenhum crédito foi debitado."
  - Teste antigo alterado: no Deno "handler revelar-contato: quando NÃO acha, não debita nenhum crédito (0 créditos)", só `canal: 'telefone'` passou a `'email'`, porque o telefone agora é recusado (`handler.test.ts` está no "Pode mexer"). Os pgTAP antigos não mudaram.
  - Testes: pgTAP do zero com o Postgres 16 local, 63 arquivos, 0 falhas; `revelar_email_so_cobra_valor_novo.sql` 29/29, `enriquecimento_e_comite.sql` 29/29, `varios_emails_e_telefones_por_contato.sql` 97/97. Deno: 7 testes novos no `handler.test.ts` (25 no arquivo). A suíte completa vai no PR.
  - `CONTEXT.md`, verbete "Crédito": a revelação de e-mail gasta só quando traz um e-mail novo; telefone não se revela. Commit separado.
  - Pendente (vira ticket próprio, decisão do Renan): `begin_reveal_contact` ainda aceita `telefone` por RPC direta e reserva 5 créditos, que ficam presos até a faxina (e `quote_reveal_contact` ainda cota 5). A RPC precisa recusar `telefone` até o Nan decidir o preço. Fora do "Pode mexer" deste ticket.
  - Passos do Nan: entrou o passo 3, a execução real que confirma o campo do e-mail.
- 2026-10-08 (leitura do e-mail): critério 1 fechado. A saída do actor foi conferida em execuções reais em produção (08/10).
  - Formato confirmado no build `0.0.135`, modo `"Profile details + email search ($10 per 1k)"`: campo de topo `emails`, lista de objetos `{ email: string, status: string (ex.: "risky"), qualityScore: number, validEmailServer: boolean, catchAllDomain: boolean, free: boolean }`, ou `null` quando o actor não acha. `companyWebsites[i].validEmailServer` não é e-mail.
  - Runs: `4uNBrExLfebRmntCf` (perfil com `emails`) e `JINU8l6sWgWksEUIH` (`emails: null`).
  - `emailDoPerfil` (`_shared/provedor-de-contatos.ts`) devolve o primeiro `emails[i].email` bem formado com `status` diferente de `"invalid"`; item sem e-mail válido é ignorado. `emails` ausente, `null`, vazio ou só com inválidos é "não encontrado" (debita 0). Perfil com e-mail volta a ser achado, grava e debita 2 pelas regras do `finish_reveal_contact`. A falha "o campo do e-mail na saída do actor ainda não foi confirmado" saiu; ficou só "formato inesperado do campo emails na saída do actor" quando `emails` não é lista nem `null` (502, reserva liberada, custo gravado).
  - Testes: `_shared/provedor-de-contatos.test.ts` novo (10 testes); no `handler.test.ts`, o teste do "campo ainda não confirmado" virou três (achado com `emails`, `emails: null` não encontrado, formato inesperado é falha).
  - Passos do Nan: saiu o passo 3 (a execução real). Restam a migration e o deploy.

- 2026-10-09: Teste real de 09/10 (TOTVS/CFO): revelar respondeu sem e-mail e com custo nulo; o caminho LinkedIn tinha perdido a caixa. PR #160 preserva/restaura o perfil, aguarda custo Apify e passa o nome da Conta pelo Vínculo ativo com RLS. Renan deve aplicar migrations, publicar função/frontend e repetir B3 com no máximo 2 créditos. [PR #160](https://github.com/Kauedz/Althius/pull/160).
- 2026-10-09 (decisão do Renan): **e-mail já existente ou já revelado no Workspace: sem actor e sem custo.**
  - Se o Contato já tem e-mail (principal ou adicional em `contact_emails`), o servidor devolve o que existe sem reservar, sem chamar o Apify e sem debitar: `creditosDebitados: 0` e `jaExistia: true`. A conferência é do banco: `public.existing_reveal_value`, com a sessão e a Participação. `quote_reveal_contact` cota 0 e `already_known`. O mesmo vale para telefone no banco; a revelação de telefone continua indisponível.
  - Dentro do Workspace, uma pessoa é um Contato só (`contacts_linkedin_per_workspace`, sem caixa) e um e-mail é de um Contato só: o "outro Contato com o mesmo LinkedIn" é o próprio Contato, coberto pela regra acima. Entre Workspaces nunca há reuso: cada um tem a própria base legal e o próprio registro de coleta (LGPD).
  - Consequência: o segundo e-mail (posições 2 e 3 de `contact_emails`) deixa de ser buscado pelo actor para quem já tem um. `finish_reveal_contact` não mudou.
  - Tela: "Já encontrado, sem custo" na cotação e no resultado.

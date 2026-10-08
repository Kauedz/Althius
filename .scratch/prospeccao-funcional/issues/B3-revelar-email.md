# B3: Revelar e-mail só cobra valor novo

**What to build:** revelar o e-mail de um Contato cobra os 2 créditos só quando grava um e-mail que esse Contato ainda não tinha. O e-mail entra nos canais dele (o principal ou um adicional em `contact_emails`, até três). A origem gravada respeita `p_source`. Se o actor não acha e-mail novo, nada é debitado e o e-mail que já estava permanece. Se o actor falha, a tela mostra falha, não "não encontrado". O telefone aparece indisponível e não reserva crédito.

**Blocked by:** B2. Os dois editam o provedor de contatos, o handler e `comite-e-enriquecimento.tsx`. O merge na `main` espera o 00.

**Status:** ready-for-agent (nada implementado; bloqueado pelo B2, que divide os arquivos; um acréscimo vindo do enriquecimento 03 nos Comments)

- [ ] A entrada de `harvestapi~linkedin-profile-scraper` é a do schema do build atual na API do Apify. Leia o schema nessa hora. Não trate `profileUrls` e `findEmail` como corretos e não invente a substituição. Vale o mesmo para o campo do e-mail na saída: o registro do actor já diz que esse nome não estava documentado; confirme no build e, se o schema não trouxer o campo, pare e pergunte. Não chute o nome.
- [ ] `finish_reveal_contact` deixa de usar `coalesce(email, …)`. E-mail igual a um que o Contato já tem (principal ou adicional) não debita e não é regravado. E-mail novo entra no primeiro lugar livre, até três, pela escrita de canais que já existe (`set_contact_channels` e `private.contact_emails`). Com os três lugares ocupados por outros e-mails, não debita e não apaga nenhum.
- [ ] `p_source` é usado. A origem do campo fica `automatico`. O texto de `p_source` (o provedor) fica gravado onde o schema já guarda a procedência do dado coletado. A origem não vira o literal `apify` no check que só aceita `manual`, `importacao` e `automatico`. Um `update` direto em `contacts.email` deixa de marcar a origem como manual por acidente do gatilho.
- [ ] Falha do actor (exceção, timeout) libera a reserva, debita zero e a resposta diz que falhou. "Não encontrado" fica para o actor que terminou sem e-mail novo.
- [ ] O custo em dólares da execução fica gravado no mesmo registro de custo dos outros actors.
- [ ] A tela de telefone não abre cotação, não chama `revelar-contato` com `telefone` e não mostra "5 créditos". Mostra que a revelação de telefone está indisponível. O handler recusa `telefone` antes de reservar crédito e antes de chamar o actor.
- [ ] Deno cobre: e-mail novo debita 2 e grava; e-mail repetido debita 0; falha não parece "não encontrado"; `telefone` não reserva. pgTAP cobre `contact_emails`, a origem e que outro Workspace não lê o e-mail.

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

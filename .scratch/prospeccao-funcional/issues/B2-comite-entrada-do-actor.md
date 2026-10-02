# B2: Comitê com a entrada certa do actor

**What to build:** pedir o comitê de compra de uma Conta chama o actor com a entrada que o schema atual desse actor descreve. As pessoas que voltam entram como propostas, com a Persona que o comitê classificou. Aceitar a proposta cria o Contato já com essa Persona. Se o actor falha, a busca fica falha, o crédito reservado volta e a tela diz que falhou. Se o actor termina e não há ninguém, a busca fica concluída com zero e também não debita. O custo em dólares que o Apify devolveu fica gravado nos dois desfechos.

**Blocked by:** B1. Os dois editam `account-enrichment/handler.ts`. O merge na `main` espera o 00.

**Status:** ready-for-agent

- [ ] A entrada de `harvestapi~linkedin-company-employees` é a do schema do build atual na API do Apify (`GET /v2/acts/{actor}` e o build mais recente). Leia o schema nessa hora. Não reuse os nomes que o código manda hoje (`companies` com o slug, leitura de `currentPosition`) e não invente os nomes novos. O comentário da migration `20261001170000` diz que o schema foi lido em 01/10/2026; confira de novo, o build muda.
- [ ] A saída é lida pelos campos que esse schema e o README do build documentam. Campo ausente fica vazio. Nada é estimado para completar cargo, nome ou LinkedIn.
- [ ] Exceção do actor, timeout ou resposta que não é uma lista terminam a busca como `falhou`, com o erro gravado. Isso deixa de ser `concluida` com zero pessoas. O crédito reservado é liberado.
- [ ] Actor que termina com lista vazia fica `concluida` com zero e debita zero. Esse é o único "concluída com 0".
- [ ] `finish_committee_discovery` recebe o custo em dólares que a execução devolveu, na conclusão e na falha. A função já tem o parâmetro; o handler hoje não o manda.
- [ ] A Persona gravada na proposta (`Decisor`, `Influenciador`, `Campeao`) chega ao Contato quando a proposta é aceita. `Outro` deixa o Contato sem Persona. Um Contato tem no máximo uma.
- [ ] O Contato aceito mostra essa Persona na Conta. A definição continua sendo a da Memória do Workspace; o Contato guarda só o nome da Persona.
- [ ] Deno cobre entrada montada a partir do schema (o teste fixa o schema lido, não um chute), falha que não vira zero, e custo repassado. pgTAP cobre a Persona no Contato aceito, a falha sem débito e que outro Workspace não lê a proposta.

## Pode mexer

- `supabase/functions/_shared/provedor-de-contatos.ts`, só `buscarPessoas` e o que ela precisa para ler a saída
- O ramo `comite-compra` de `supabase/functions/account-enrichment/handler.ts` e o teste correspondente em `handler.test.ts`
- `supabase/functions/account-enrichment/index.ts`, para repassar custo e erro se o `db` ainda não os aceita
- A migration nova que leva a Persona ao Contato a partir de `accept_proposed_contact` (a definição mais recente está em `20261001190000_enriquecimento_e_comite.sql`; não edite esse arquivo)
- A leitura do Contato que hoje não traz Persona (`supabase-contas.ts` e o tipo em `contas-tipos.ts`, que já tem o campo)
- A lista do comitê em `comite-e-enriquecimento.tsx`, no que mostra a Persona da proposta aceita
- pgTAP novo

## Não mexa

- O ramo `cnpj-receita` como o B1 o deixar.
- `revelarContato` e o ramo `revelar-contato`. Isso é o B3, inclusive a entrada `profileUrls` / `findEmail`.
- Telefone. Não implemente revelação de telefone.
- O classificador de Persona por cargo pode continuar; o que este ticket garante é que o valor classificado não se perde na aceitação.
- `grant_credits`.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Uma, timestamp UTC maior que `20261002112000`. A tabela `contacts` não tem coluna de Persona; `private.proposed_contacts` tem. A migration adiciona o lugar da Persona no Contato e faz a aceitação copiá-la. Redefina `accept_proposed_contact` a partir do corpo mais recente, inteiro, com a cópia a mais. pgTAP próprio. RLS se a coluna nova estiver em tabela `public` já coberta; não abra leitura de `proposed_contacts` para `authenticated`.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`.
2. Publicar a função de novo, no PowerShell, na raiz:

```powershell
npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty
```

Quem executa o ticket não aplica migration nem deploy no remoto. Não peça token do Apify no chat: a leitura do schema é a API pública do actor.

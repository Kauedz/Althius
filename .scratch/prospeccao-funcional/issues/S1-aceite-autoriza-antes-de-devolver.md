# S1: o aceite da proposta autoriza antes de devolver o Contato

**What to build:** aceitar de novo uma proposta do comitê que já foi aceita devolve o mesmo Contato, sem criar outro. Hoje esse retorno vem antes da checagem de quem chama. `accept_proposed_contact` é SECURITY DEFINER e liberada para `authenticated`, então um usuário de outro Workspace, ou um participante cuja Participação foi desativada, que conheça o id de uma proposta aceita recebe a linha do Contato (nome, cargo, e-mail, telefone, LinkedIn). A correção põe a checagem de Participação ativa e de permissão (o vendedor responsável pela Conta-alvo ou um Administrador, `private.can_manage_account_contacts`) antes de qualquer retorno. Quem pode gerir os Contatos da Conta continua recebendo o retorno idempotente. Achado S1 da auditoria `Althius-ARQUITETURA.md`.

**Blocked by:** enriquecimento 01 (mesma função). A branch `enriquecimento/01-fornecedores-da-cascata` redefine `accept_proposed_contact` em `20261009040000_origem_do_contato_aceito.sql`; esta correção parte desse corpo e só entra na `main` depois dele.

**Status:** ready-for-human (código fechado; falta aplicar a migration no remoto, depois da `20261009040000`)

- [x] Um usuário de outro Workspace que chama `accept_proposed_contact` com o id de uma proposta já aceita recebe `42501` e nenhum dado do Contato.
- [x] Um participante com a Participação desativada (`active = false`), que antes podia gerir a Conta e até aceitou a proposta, recebe `42501` e nenhum dado ao chamar de novo.
- [x] Quem pode gerir os Contatos da Conta (o vendedor responsável ou um Administrador, com Participação ativa) continua recebendo o mesmo Contato no aceite repetido, sem Contato novo e sem mudar a proposta.
- [x] A redefinição mantém tudo o que o enriquecimento 01 acrescentou: nome, cargo e LinkedIn do actor com Origem `automatico`, e-mail e telefone digitados no aceite `manual`, Contato que já existe só ganha o Vínculo, a Persona copiada só quando o Contato ainda não tem uma.
- [x] O pgTAP novo falha (vermelho) contra a definição de `20261009040000` e passa com a migration nova. Os pgTAP antigos continuam verdes, sem alteração.

## Pode mexer

- Uma migration nova, com timestamp UTC maior que todas as de `supabase/migrations` (a partir de `20261009060000`; a `crm/10-interacoes-e-sinais-internos` já usa `20261009050000`). Ela redefine `public.accept_proposed_contact` inteira a partir do corpo de `20261009040000_origem_do_contato_aceito.sql`, com a checagem movida para antes do retorno idempotente, e repete o `revoke`/`grant`.
- pgTAP novo em `supabase/tests/`.

## Não mexa

- Migrations antigas, inclusive `20261008223000_persona_do_contato_no_comite.sql` e `20261009040000_origem_do_contato_aceito.sql`.
- Os pgTAP antigos (`enriquecimento_e_comite.sql`, `persona_do_contato_no_comite.sql`, `origem_do_contato_aceito.sql`).
- `private.can_manage_account_contacts` e as outras funções do Contato.
- A tela e a Fonte (`supabase-contas.ts`): o contrato da RPC não muda para quem tem permissão.
- A branch `enriquecimento/01-fornecedores-da-cascata` e os outros worktrees.

## Migration

Uma, timestamp UTC maior que `20261009050000`. Redefine `accept_proposed_contact` por inteiro, a partir de `20261009040000`. Nenhuma tabela nova.

## Passos do Nan

1. Aplicar antes a `20261009040000_origem_do_contato_aceito.sql` do enriquecimento 01. Esta migration vem **depois** dela: as duas redefinem `accept_proposed_contact`, e a que entra por último vale.
2. Se a `20261009040000` mudou na revisão do enriquecimento 01, conferir que esta cópia não ficou para trás. No PowerShell, na raiz do repositório, com as duas branches juntas:

```powershell
git diff --no-index supabase/migrations/20261009040000_origem_do_contato_aceito.sql supabase/migrations/20261009060000_aceite_autoriza_antes_de_devolver.sql
```

   O diff só pode mostrar o comentário do topo e o bloco `if v_p.state = 'aceita' ...` trocando de lugar com a checagem `can_manage_account_contacts`. Se aparecer outra diferença no corpo, a migration nova precisa ser refeita a partir do corpo novo antes de aplicar.
3. Com o CI verde, aplicar `20261009060000_aceite_autoriza_antes_de_devolver.sql` no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md` (validar com `scripts/pgtap-no-remoto.sh supabase/tests/aceite_autoriza_antes_de_devolver.sql` dentro da transação que volta, depois o bloco atômico com a linha do histórico).

Quem executa o ticket não aplica no remoto. Não há deploy de função nem mudança na tela.

## Comments

- 2026-10-09: migration `20261009060000_aceite_autoriza_antes_de_devolver.sql`. O corpo é o de `20261009040000` com um único movimento: o bloco do retorno idempotente (`state = 'aceita'`) desceu para depois de `private.can_manage_account_contacts`. O diff dos dois corpos mostra só essa troca. O `revoke`/`grant` é repetido.
  - pgTAP `aceite_autoriza_antes_de_devolver.sql` com `plan(6)` (4 `is` + 2 `throws_ok`). Antes da migration nova, contra `20261009040000`: 4/6, com o teste 2 (outro Workspace) e o 3 (Participação desativada) em "caught: no exception". Com a migration: 6/6. O `decided_by` é a prova de que o aceite repetido não reescreve a proposta: dentro da transação do teste, `now()` não muda e o `decided_at` não distinguiria.
  - pgTAP do zero no Postgres 16 local (`scripts/pgtap-local.sh`): 64 arquivos, 2654 verificações, 0 falhas. `origem_do_contato_aceito.sql` 12/12, `persona_do_contato_no_comite.sql` 16/16, `enriquecimento_e_comite.sql` 29/29, sem alteração.
  - Deno: `deno check supabase/functions/*/index.ts` exit 0; `deno test supabase/functions` 757 passed, 0 failed. Frontend: `npm run lint` 0 erros e os 50 avisos que já existiam; `tsc -b` exit 0; `npx vitest run --maxWorkers=2` 113 arquivos, 1113 passed, 0 failed (1581 s), rodado depois que o vitest da sessão agentes02 terminou.
  - Muda também, pela mesma checagem: quem tem Participação ativa mas não é Administrador nem o vendedor responsável pela Conta-alvo passa a receber `42501` no aceite repetido, como já recebia no primeiro. O mesmo vale para quem aceitou e depois deixou de ser o responsável. A única chamada é a da tela (`supabase-contas.ts:763`), que mostra o erro; nenhuma Edge Function chama a RPC.
  - Ficam como estão, sem dado vazado: um id inexistente responde `P0002` antes da checagem, então quem não participa distingue "existe" de "não existe" (os ids são `gen_random_uuid()`); o `for update` da proposta é tomado antes da checagem e solto no erro.
  - Revisão (padrões e spec): sem violação nem lacuna. O comentário herdado "com este LinkedIn ou e-mail" está errado (o código só casa o LinkedIn), mas o corpo foi copiado sem outra mudança, como pede o ticket. Sem print: a tela não mudou.
- Passos do Nan: aplicar `20261009060000` no projeto `ycbdilsmydvzezhlymty` **depois** da `20261009040000`, com o CI verde, pelo `execute_sql` em bloco atômico, como em `docs/agents/migrations.md`. Antes, refazer o diff do passo 2 se o enriquecimento 01 mudou a função. Quem executa o ticket não aplica no remoto.

- 2026-10-09: Teste real de 09/10: aceite repetido foi idempotente, mas gravou em minúsculas o id ACwAA do perfil. PR #160 preserva a caixa, compara identidades por lower (aceite/índice/CSV) e recupera dados de propostas aceitas equivalentes, mantendo autorização antes do retorno. Aplicar migrations e conferir o contato fe45da90-2772-4332-a723-11c922259875 fica com o Renan. [PR #160](https://github.com/Kauedz/Althius/pull/160).

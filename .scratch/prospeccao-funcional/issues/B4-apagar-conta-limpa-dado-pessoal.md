# B4: Apagar a Conta apaga o dado pessoal que sobra

**What to build:** o apagamento definitivo de uma Conta-alvo deixa o marcador sem dado da empresa e sem dado de terceiros. Somem `receita_data` (sócios, e-mail, telefones), as propostas do comitê e os Sinais que guardam nome e LinkedIn de uma pessoa. Apagar um Contato leva o mesmo tipo de rastro quando ele está ligado a essa pessoa e a Conta continua. O que fica é o evento comercial sem nome, como o apagamento já faz com a Interação.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00. Não espera o B3: os e-mails adicionais já saem em cascata com o Contato.

**Status:** done

- [x] Apagar a Conta grava `receita_data` nulo no marcador. O marcador segue sem nome, URL, domínio, identificador legal, LinkedIn e segmento, como hoje.
- [x] Apagar a Conta apaga as linhas de `private.proposed_contacts` dessa Conta, inclusive `source_data`, nome, foto e LinkedIn. A Conta não é removida (vira marcador), então um cascade não dispara: o delete é explícito.
- [x] Apagar a Conta continua apagando os Sinais dela. O pgTAP novo prova que não resta Sinal com nome ou URL de LinkedIn de terceiro.
- [x] Apagar o Contato apaga as propostas ligadas a ele (`contact_id` ou o mesmo LinkedIn naquela Conta) e os Sinais cujo `event_key` ou `evidence` carregam o LinkedIn dessa pessoa. Os adaptadores de mudança de emprego e de nova liderança põem o perfil na chave e a URL na evidência, junto com o nome. O casamento é pelo LinkedIn, não pelo nome sozinho. Sinal que só fala da empresa (vaga, anúncio, avaliação) permanece.
- [x] Outro Workspace não vê o que foi apagado. Participante que não é Administrador continua sem poder apagar a Conta. A confirmação pelo nome continua obrigatória.
- [x] pgTAP próprio cobre os três alvos (Receita, propostas, Sinal com LinkedIn) na Conta e no Contato, mais o isolamento.

## Pode mexer

- Uma migration nova que redefine o apagamento a partir da definição mais recente:
  - `public.erase_target_account` e `public.erase_contact`: `20260929160000_arquivar_e_apagar_dados_comerciais.sql`
  - `private.erase_contact_extensions`: `20260929170000_varios_emails_e_telefones_por_contato.sql`
  - `private.erase_account_extensions`: `20260930180000_monitoramento_real_de_sinais.sql`
- Confira na `main` se alguma migration posterior redefiniu alguma dessas quatro. Se redefiniu, parta dessa, não das listadas.
- pgTAP novo em `supabase/tests/`

## Não mexa

- Os arquivos de migration citados acima. Eles já foram aplicados.
- Os pgTAP antigos `arquivar_e_apagar_dados_comerciais.sql` e `monitoramento_real_de_sinais.sql`.
- O que o apagamento já tira (Sequência, Envios, e-mails recebidos, importação, Memória dos Agentes). Não reabra esse comportamento; copie o corpo recente e acrescente a limpeza.
- `grant_credits`.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.
- Tela, salvo se um texto prometer que o dado some e hoje não some. Não redesenhe o diálogo de apagar.

## Migration

Uma, timestamp UTC maior que `20261002112000`. Redefine as funções por inteiro, com a limpeza a mais. pgTAP próprio.

## Passos do Nan

Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`. Quem executa o ticket não aplica no remoto. Não há deploy de função.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): as definições mais recentes continuam as listadas no ticket, sem redefinição posterior: `erase_contact` (`20260929160000_arquivar_e_apagar_dados_comerciais.sql:920`), `erase_target_account` (`:980`), `private.erase_contact_extensions` (`20260929170000_varios_emails_e_telefones_por_contato.sql:1161`), `private.erase_account_extensions` (`20260930180000_monitoramento_real_de_sinais.sql:763`).
  - Em aberto: `receita_data` não é anulado no marcador (`20260929160000:1077-1080`; a coluna nasceu depois, em `20261001190000:10`); `private.proposed_contacts` sobrevive (nenhum `delete` fora da criação; o gatilho `erase_discovery_data_of_account`, `20261001170000:728-741`, só apaga as `discovery_runs` e a proposta perde o `discovery_run_id` por `on delete set null`); apagar o Contato não toca propostas nem Sinais com o LinkedIn dele (`20260929170000:1161-1211`; os adaptadores põem o perfil na chave e a URL na evidência, `mudanca-de-emprego.ts:68,72`, `nova-lideranca.ts:56,62`); falta o pgTAP próprio.
  - Já cumpridos, e a redefinição tem de manter: os Sinais da Conta apagados (`20260930180000:772`; pgTAP "o apagamento conta os Sinais que apagou" e "nenhum Sinal fica no marcador da Conta apagada"); só o Administrador apaga, com a confirmação pelo nome e sem alcançar outro Workspace (`20260929160000:1017-1026`; pgTAP "the responsible seller cannot permanently delete the target account", "an administrator of another Workspace does not find it", "the administrator must type the name of the target account").
  - Testes: pgTAP `arquivar_e_apagar_dados_comerciais.sql` (180) e `monitoramento_real_de_sinais.sql` ok no CI 37707955273.
  - Este ticket cobre em parte o critério 1 do enriquecimento 05 ("Apagar o Contato remove os valores coletados").
- 2026-10-08: migration `20261008153000_apagar_conta_limpa_dado_pessoal.sql` e pgTAP `apagar_conta_limpa_dado_pessoal.sql` (41). A tela de apagar não mudou: o texto já diz que o dado da empresa e o da pessoa somem. Sem print.
- Passos do Nan: com o CI verde, aplicar `20261008153000` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql` em bloco atômico, como em `docs/agents/migrations.md`. Não há deploy de função. Quem executa o ticket não aplica no remoto.

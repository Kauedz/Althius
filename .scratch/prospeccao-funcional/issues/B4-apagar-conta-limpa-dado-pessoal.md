# B4: Apagar a Conta apaga o dado pessoal que sobra

**What to build:** o apagamento definitivo de uma Conta-alvo deixa o marcador sem dado da empresa e sem dado de terceiros. Somem `receita_data` (sócios, e-mail, telefones), as propostas do comitê e os Sinais que guardam nome e LinkedIn de uma pessoa. Apagar um Contato leva o mesmo tipo de rastro quando ele está ligado a essa pessoa e a Conta continua. O que fica é o evento comercial sem nome, como o apagamento já faz com a Interação.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00. Não espera o B3: os e-mails adicionais já saem em cascata com o Contato.

**Status:** ready-for-agent

- [ ] Apagar a Conta grava `receita_data` nulo no marcador. O marcador segue sem nome, URL, domínio, identificador legal, LinkedIn e segmento, como hoje.
- [ ] Apagar a Conta apaga as linhas de `private.proposed_contacts` dessa Conta, inclusive `source_data`, nome, foto e LinkedIn. A Conta não é removida (vira marcador), então um cascade não dispara: o delete é explícito.
- [ ] Apagar a Conta continua apagando os Sinais dela. O pgTAP novo prova que não resta Sinal com nome ou URL de LinkedIn de terceiro.
- [ ] Apagar o Contato apaga as propostas ligadas a ele (`contact_id` ou o mesmo LinkedIn naquela Conta) e os Sinais cujo `event_key` ou `evidence` carregam o LinkedIn dessa pessoa. Os adaptadores de mudança de emprego e de nova liderança põem o perfil na chave e a URL na evidência, junto com o nome. O casamento é pelo LinkedIn, não pelo nome sozinho. Sinal que só fala da empresa (vaga, anúncio, avaliação) permanece.
- [ ] Outro Workspace não vê o que foi apagado. Participante que não é Administrador continua sem poder apagar a Conta. A confirmação pelo nome continua obrigatória.
- [ ] pgTAP próprio cobre os três alvos (Receita, propostas, Sinal com LinkedIn) na Conta e no Contato, mais o isolamento.

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

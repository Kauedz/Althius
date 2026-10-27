# Spec: Sinais de vagas com recorte obrigatório e sem aprovação sem IA

**Origem:** Renan, 26/10/2026 (noite, BRT). O Sinal "Vagas BDR" (`private.signal_monitors` `0604b152-bd5e-4e38-b65f-81bdc92df19f`, Workspace `e0a17e00-…0001`, mercado endereçável, `vaga_linkedin`) estava ativo sem nicho e iria trazer vagas de SDR/BDR/LDR de qualquer setor. Foi pausado em 26/10/2026 23:30 BRT pelo mesmo caminho do app (`public.set_signal_monitor_state`), até estes três tickets entrarem. Backup e rollback em `/workspace/backups/prod-20261026-233038-pausa-vagas-bdr/` (box).

**Quem faz:** fila Luna (Codex gpt-6-luna implementa, uma sessão nova por ticket); Claude Sonnet só revisa (`claude-review.sh`). Nenhum ticket aplica no remoto nem publica.

## Problemas (o que o código faz hoje)

1. **Roda sem recorte (bug a).** Em Abertura de vagas no mercado endereçável, o nicho "Qualquer" (ou critério sem `nicho`) é aceito para salvar, ativar e rodar. `nichoDoMonitoramento` devolve `''` e `linkedinVagasMercado.executar` (`supabase/functions/_shared/cascata-de-sinais/passos/vagas-mercado.ts`, ~L146–153) deixa `doNicho = null`: toda vaga passa. `private.validate_market_criteria` (última definição em `supabase/migrations/20261114120000_vagas_no_mercado_enderecavel.sql`, ~L98–150) só exige cargo e país para ativar.
2. **Sem IA, a palavra-chave aprova (bug b).** `vagasDoNicho` (`supabase/functions/signal-runner/adaptadores/vagas.ts`, L107–124) cai em `vagaDoNichoPelaRegra` quando não há modelo, quando o modelo falha ou quando não responde uma vaga. Os caminhos sem contexto (`sinais()` de `vaga-linkedin.ts` L42–45 e `vaga-indeed.ts` L37–40) usam só a regra. A regra aprova qualquer vaga que cite uma palavra do nicho.
3. **Cargo literal (bug b, parte 2).** `vagaAtende` (`vagas.ts` L153) compara um cargo escrito pelo usuário (Custom, ex.: "SDR") só com ele mesmo: "SDR" não casa "Sales Development Representative" nem "Pré-vendas"; "BDR" não casa "Business Development Representative". A busca (`buscasDasFuncoes`) também manda só a sigla.
4. **Um nicho só e o caso "transporte e seguros" (bug c).** O editor (`projeto-althius-frontend/src/paginas/sinais/editor.tsx`, ~L533–575) tem um grupo de rádio: um nicho pronto, "Qualquer" ou um Custom. Os critérios guardam `nicho` (texto) e `nichoCustom` (texto). Não existe nicho pronto "Seguros".

### Investigação do caso "escolhi transporte e seguros e não salvou"

Lido no banco de produção (só leitura, 26/10/2026 ~23:40 BRT):

- O usuário disse "logística e corretoras de seguros" ao **Scopus, na conversa** (Workspace `e0a17e00-…0001`, 26/10 21:26–21:34 BRT). O Scopus propôs uma versão nova da seção **ICP do Playbook** (`propor_mudanca_no_playbook`, Aprovação `6deec241-…`), aprovada às 21:38 BRT. Isso **está salvo**: `private.playbook_section_versions`, seção `icp`, versão 1 ("empresas de logística e corretoras de seguros…").
- Nenhum Sinal recebeu isso. `0604b152` ("Vagas BDR", criado 23/10) não tem `nicho` nos critérios; `c1df7520` ("bdr", criado 26/10 21:35 BRT, três minutos antes da aprovação) tem `nicho: "industria-fornecedores-b2b"`. Nada em `signal_monitors`, `signal_plan_requests` ou `signal_requests` cita "seguro".
- Por quê: (1) a tela do Sinal não lê o ICP do Playbook (só a vitrine usa `nichoDoWorkspace` para a prateleira "Para o seu nicho", e escolhe **um** nicho); (2) o editor do Sinal aceita um só nicho, e "seguros" não é nicho pronto, então "transporte **e** seguros" só caberia num único Custom; (3) não há aviso de que o recorte da conversa não vai para o Sinal.
- Levar o ICP para o Sinal (pré-preencher) é da frente Sinais first (`docs/sinais-first`, tickets 03 e 04, em andamento na fila lu1) e **não** entra aqui. Aqui: o Sinal guarda e mostra vários recortes, e o editor não deixa salvar/ativar vagas no mercado sem recorte.

## Decisões (Renan, 26/10/2026)

- D1. Sinal de vagas no mercado endereçável exige **pelo menos 1 recorte** (nicho pronto ou setor escrito) para ativar e para rodar, com validação no servidor, não só na tela. Rascunho pode ficar incompleto, como já vale para cargo e país.
- D2. Sem a IA de checagem disponível (sem modelo, erro do modelo, ou vaga sem resposta), a vaga **não é aprovada**. Ela é descartada naquela rodada e o motivo fica registrado. Como não vira Sinal, a mesma vaga volta a ser avaliada na rodada seguinte, se ainda estiver no período.
- D3. Cargo: variações óbvias, siglas e nomes por extenso em pt e en (ex.: SDR, Sales Development Representative, pré-vendas; BDR, Business Development Representative; LDR, Lead Development Representative). Lista fechada no código, com teste. Nada de sinônimo inventado: se uma sigla não estiver na lista, ela segue literal.
- D4. Um Sinal aceita **vários recortes** (ex.: "Logística e transporte" + "Seguros"). Eles ficam nos critérios do Sinal e aparecem na tela do Sinal (editor e resumo).

## Tickets

| Tag | Ticket | Depende de |
|---|---|---|
| sinais-vagas-01 | [01 Sem IA, nenhuma vaga aprovada; cargos com variações](issues/01-sem-ia-nao-aprova-e-cargos-com-variacoes.md) | nenhum |
| sinais-vagas-02 | [02 Vários recortes por Sinal](issues/02-varios-recortes-por-sinal.md) | nenhum |
| sinais-vagas-03 | [03 Recorte obrigatório para ativar e rodar](issues/03-recorte-obrigatorio-para-ativar-e-rodar.md) | 02 |

## Regras comuns

- Migration só nova e aditiva; função redefinida a partir da **última** definição na `main` (ver `git log -S` antes), mantendo grants/revokes e `search_path = ''`. pgTAP próprio. Sem aplicar no remoto, sem deploy, sem segredo.
- Não mexa nos arquivos do Kauê: `send-chat-step*`, `sequence-runner*`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts`.
- Não mexa no que a frente Sinais first está mudando (ICP estruturado, `signal-plan` além do mínimo citado no ticket, catálogo/vitrine, composer). Se precisar, BLOCKED dizendo o quê.
- Nenhum número de preço, crédito ou custo novo.
- Nenhum nome de provedor de IA na tela.

# 02: Monitoramento real grava Sinais

**What to build:** um Monitoramento configurado roda o actor sobre as Contas do público dele, transforma o resultado em Sinais (com data, fonte e evidência), não repete o mesmo acontecimento e deixa a Conta Quente por 30 dias (ADR-0007).

**Blocked by:** 01: Registro de actors; `creditos-e-planos` 02 e 03 (saldo e teto).

**Status:** closed

## Pode mexer

- Migration aditiva com Sinais reais, Monitoramentos reais e o agendamento (pg_cron + pg_net, padrão do `sequence-runner`).
- A Edge Function `signal-scan`.
- A Fonte de Sinais real no frontend, trocando a `criarFonteDeSinaisIndisponivel`.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Mesmo acontecimento não conta duas vezes nem renova o prazo.
- [x] Automático só roda dentro do teto aprovado.
- [x] Cada Conta varrida debita 1 crédito.
- [x] O foguinho mostra os Sinais válidos da Conta.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration e publicar as funções (na raiz do repositório, com o `main` atualizado):
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase db push
   npx supabase functions deploy signal-scan --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty
   ```
   (`signal-runner` já sai sem JWT pelo `supabase/config.toml`.)
2. Uma vez, no SQL Editor do Supabase, apontar o relógio para a função:
   ```sql
   select private.configure_signal_runner('https://ycbdilsmydvzezhlymty.supabase.co');
   ```
   Sem isso nada é chamado. Nenhum Monitoramento roda até um actor ser marcado como `available` (ticket 03).

   Em 07/10/2026 os passos 1 e 2 já estavam feitos no remoto (conferido só por leitura): migrations aplicadas, as duas funções publicadas, o relógio apontado para o `signal-runner` e os 9 actors `available`.
3. Dar crédito ao Workspace de teste, uma vez, no SQL Editor do Supabase. A varredura reserva 1 crédito por Conta, e um Workspace novo nasce com saldo zero:
   ```sql
   select public.grant_credits('05bb7bb8-3ff6-4375-8640-8549c3981927', 50, 'ajuste', 'Crédito de teste do sinais-reais 02');
   ```
   (O id é o do "Teste real - Workspace A". Para outro Workspace, troque o id.)
4. Conferir no navegador, logado no Workspace operacional: criar um Monitoramento de "Abertura de vagas" escolhendo Contas reais, ativar, ver o Monitoramento na lista com "N Contas-alvo", abrir a Conta e clicar "Buscar Sinais de novo". Quando a busca terminar, o Sinal gravado aparece na seção Sinais da Conta e em Sinais → "Sinais encontrados".

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Seams testados (TDD): as funções SQL públicas e de serviço (pgTAP `monitoramento_real_de_sinais.sql` e `varredura_automatica_de_sinais.sql`, com os créditos e o teto **reais**, não simulados), o handler da varredura com banco, Apify e adaptador injetados (Deno), e as Fontes do frontend com o Supabase falso. A revisão em duas frentes (padrões e spec) achou 13 pontos reais, todos corrigidos aqui: cron que nunca seria agendado no Supabase (`postgres` não é superusuário), Sinais que sobrariam no marcador da Conta apagada, Conta apagada sendo varrida, `verify_jwt` do runner, reserva presa se o teto lançasse erro, teto que não voltava quando a Conta falhava, cobrança por hora que podia sair de graça ou em dobro, criador que saiu travando o Monitoramento, data de disparo no futuro, tempo da função, rotação da varredura e o vencimento rebaixando Fit ou o cartão posto à mão.
- Banco: `save_signal_monitor` / `set_signal_monitor_state` / `delete_signal_monitor` / `list_signal_monitors` (só Sinal com actor `available` no registro; público = Contas do Workspace); `private.record_signal` (chave do acontecimento única por Conta e tipo; reencontro só registra `seen_again_at`; vale 30 dias a partir do disparo; Sinal novo e válido move o cartão para Quente; recusa Conta arquivada ou apagada e data no futuro); `list_account_signals` (foguinho) e `list_signals`; `private.expire_signals` (toda hora) devolve a Descoberta só o cartão que o Sinal pôs em Quente e que ficou sem Sinal válido antes da abordagem (Fit e o Quente posto à mão ficam); apagar a Conta definitivamente apaga os Sinais dela (`erase_account_extensions` redefinida a partir da definição mais recente).
- Varredura automática: `pg_cron` a cada 10 min chama `signal-runner` pelo `pg_net` (token gerado no banco, mesmo desenho da Sequência em segundo plano). `begin_account_scan` / `end_account_scan` reservam o crédito, conferem o teto `acao:varredura` e o devolvem se a varredura falha, tudo atômico no banco; `release_stale_credit_reservations` (toda hora) solta a reserva que ficou presa. Rodada que não deu conta de todas as Contas pede para continuar já e segue de onde parou (`scan_offset`).
- **Adaptadores: nenhum entra neste ticket.** Cada família (tickets 03 a 06) entrega o seu depois de uma execução real do actor, com a entrada e o formato do resultado vistos de verdade (os esquemas dos actors não foram conferidos: a documentação do Apify estava bloqueada). Por isso todos os actors seguem `testing` no registro e ninguém consegue criar Monitoramento real ainda. Os quatro critérios acima estão provados nos seams (banco real e handler); a prova de ponta a ponta com o Apify de verdade é a do ticket 03.
- Decisões a confirmar: (1) a função nova `signal-runner` e a mudança em `supabase-contas.ts` (o foguinho das Contas reais) não estão na lista "Pode mexer" do ticket, mas o padrão "pg_cron + pg_net, como o sequence-runner" e o critério "o foguinho mostra os Sinais válidos" as exigem; (2) `tipos()` já devolve a disponibilidade de cada card (Disponível, Em teste, Em breve), dado que o ticket 07 usa; (3) o módulo Sinais do Workspace operacional segue indisponível na tela até o primeiro actor passar no teste — o ticket 03 o libera.
- Frontend já visível: as Contas reais mostram Quente, a contagem de Sinais válidos e o último Sinal (`list_account_signals`). A Fonte real (`supabase-sinais.ts`) e o mapa tipo da tela → Sinal real (`sinais-reais-mapa.ts`) estão prontos.
- 07/10/2026, caminho pela tela no Workspace operacional (o backend acima já estava na `main`):
  - Criar Monitoramento: o editor deixa de gerar o id `novo-…` no operacional. A Fonte manda `p_id` nulo e o banco devolve o uuid; editar manda só o uuid gravado. O código desta parte veio da branch `ralph/A1-criar-monitoramento-no-modo-real` (02/10, nunca mergeada), revisado e reorganizado.
  - Público: no operacional a seção mostra só as Contas-alvo do Workspace (`contas()` da Fonte real), e a Fonte as grava em `accountIds`. As listas de exemplo, a descoberta por perfil e o público recomendado ficam só na Demonstração, porque o banco só aceita `accountIds`. Sem Conta, a seção diz para cadastrar em Contas. A revisão mostra os nomes das Contas e o custo (1 crédito por Conta varrida, automático só com teto). A recusa do banco aparece em palavras do produto (ex.: "Escolha ao menos uma Conta-alvo para ativar o Monitoramento.").
  - Vazio é vazio: `pagina-sinais.tsx`, `conta-com-sinais.tsx` e `pagina-do-tipo.tsx` não completam mais o operacional com `SINAIS_MOCK`, `CONTAS_MOCK` ou os disparos de exemplo. Uma Conta de exemplo não abre no operacional, e a evidência real não se chama "(simulada)". A página do tipo mostra o público como "N Contas-alvo".
  - Detalhe da Conta: o `sinaisDaConta` real lê `list_signals` da Conta (`lerSinaisDaConta` em `supabase-sinais.ts`). A falha de leitura vira erro, e não lista vazia. No `supabase-contas.test.ts` só a linha do `sinaisDaConta` mudou, com autorização do Nan.
  - Testes: `src/paginas/sinais/monitoramento-real.test.tsx` (14 testes de tela com o app inteiro sobre o dublê do Supabase e as Fontes reais). 10 deles falham com o código anterior.
  - Conferência visual (Chrome, 1400×900), com o mesmo dublê do Supabase, porque não havia credencial para entrar no remoto: [público](prints/02-publico-com-contas-reais.jpg), [revisão](prints/02-revisao.jpg), [lista do tipo](prints/02-lista-do-tipo.jpg), [detalhe da Conta](prints/02-detalhe-da-conta.jpg), [Sinais encontrados](prints/02-sinais-encontrados.jpg), [Conta pelos Sinais](prints/02-conta-com-sinais.jpg), [catálogo sem Sinal](prints/02-catalogo-sem-sinais.jpg), [lista vazia](prints/02-sinais-encontrados-vazio.jpg). Nenhum erro no console. A 360px o app inteiro não se adapta (a barra lateral ocupa a tela); isso já era assim e este ticket não cobre celular.
  - Fora do "Pode mexer", com autorização do Nan: as telas de `src/paginas/sinais/`, o `sinaisDaConta` de `supabase-contas.ts` e uma linha em `paginas/onboarding/retorno-de-sinais.tsx`. Sem ela, abrir Sinais no operacional deixava uma promessa rejeitada sem tratamento (o onboarding não existe no real).
  - Decisão a confirmar: com a leitura dos Sinais falhando, o detalhe da Conta (`detalhe-conta.tsx`, fora do autorizado) ainda mostra "Nenhum sinal" em vez do erro.

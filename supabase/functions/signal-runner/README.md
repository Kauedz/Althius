# signal-runner

A varredura automática de Sinais. O relógio do banco (`pg_cron` a cada 10 minutos, `private.kick_signal_runner`) chama esta função quando há Monitoramento ativo vencido (ou busca pendente, ver abaixo); ela o reivindica (`claim_due_signal_monitors`) e, Conta por Conta:

1. **abre** a varredura (`begin_account_scan`): reserva 1 crédito e confere o teto da varredura automática (`acao:varredura`, "Automação e tetos"), de uma vez no banco. A chave da cobrança é o Monitoramento, a Conta e a hora marcada da rodada, então repetir a rodada nunca cobra duas vezes;
2. roda o actor do Sinal (teto de custo do registro; contas do Apify em rodízio);
3. grava os Sinais que o **adaptador** do tipo tira do resultado (o mesmo acontecimento conta uma vez; vale 30 dias);
4. **fecha** a varredura (`end_account_scan`): concluída, debita o crédito; falha, adaptador quebrado ou Sinal que o banco recusa soltam a reserva e devolvem o teto — nada é cobrado.

Se o automático está em "confirmar", sem teto ou no teto, ou não há crédito, a rodada para sem varrer nada e o motivo fica em `last_error` do Monitoramento (a tela o mostra a partir do ticket 03). O tempo da função é de 150 s: uma Conta nova só começa até 72 s, e o Apify espera no máximo 70 s por Conta (mais 3 s para reler o custo quando o Apify ainda não fechou a conta da execução); o que faltar continua de onde parou na rodada seguinte, que o próprio Monitoramento pede para já.

Quem chama: só o relógio, com o cabeçalho `x-runner-token` (gerado e guardado no banco, conferido por `signal_runner_token_matches`). `verify_jwt = false` está no `supabase/config.toml`. Passo manual, uma vez por projeto: `select private.configure_signal_runner('https://<ref>.supabase.co');`.

**Adaptadores** (`adaptadores.ts`, um módulo por tipo em `adaptadores/`, tickets 03 a 06): cada um monta a entrada do actor a partir da Conta e dos critérios do formulário, e tira do resultado os Sinais com data, fonte, evidência e a chave do acontecimento. Os campos seguem o esquema de entrada e o README publicados de cada actor (lidos na API pública do Apify em 30/09/2026); o actor só passa a "disponível" depois da execução real que os confirma (`scripts/validar-sinais-reais.ts` e `.scratch/sinais-reais/registro-apos-o-teste.sql`, passos do Nan).

| Sinal | Actor | Entrada | Vira Sinal |
| --- | --- | --- | --- |
| `vaga_linkedin` | curious_coder/linkedin-jobs-scraper | Busca pública com o nome da Conta e cada função, no país e no período | Vaga da empresa da Conta, na função, senioridade e palavras |
| `vaga_indeed` | valig/indeed-jobs-scraper | Nome da Conta no país | Idem; a mesma vaga do LinkedIn conta uma vez |
| `mudanca_de_emprego` | harvestapi/linkedin-profile-scraper | Perfil dos Contatos da Conta (até 25) | Cargo atual iniciado no período: promoção, chegada ou mudança de empresa |
| `nova_lideranca` | harvestapi/linkedin-profile-search | Pessoas com cargo atual na página da Conta que mudaram de emprego | Cargo de liderança (ou dos escolhidos) iniciado no período |
| `entradas_e_saidas` | harvestapi/linkedin-company-employees | Quem tem menos de 1 ano na página da Conta | Entrada no período (saídas pedem comparar leituras: depois) |
| `anuncio_de_movimentacao` | harvestapi/linkedin-post-search | Posts recentes de autores da Conta com termos de movimentação | Post que anuncia promoção, chegada ou saída num cargo de liderança |
| `anuncio_linkedin` | silva95gustavo/linkedin-ad-library-scraper | Biblioteca de anúncios pelo anunciante com o nome da Conta | Um Sinal por campanha nova (anunciante e mês de início) |
| `anuncio_meta` | curious_coder/facebook-ads-library-scraper | Biblioteca de anúncios por palavra-chave, só ativos, no país | Idem, quando o anúncio leva ao site da Conta ou é da página dela |
| `avaliacoes_google_maps` | compass/google-maps-reviews-scraper | Busca do Maps pelo nome da Conta, sem dado de quem avaliou | Queda de nota, reclamações repetidas no mesmo assunto, muitas negativas |
| `crescimento_de_equipes` | harvestapi/linkedin-company | Página da Conta no LinkedIn | Headcount 10% e +5 pessoas acima da foto mais antiga dos últimos 90 dias, ou crescimento menor com 3 ou mais vagas no período (PR-8; grava a foto em `private.account_headcount_snapshots`) |
| `publicacao_da_empresa` | harvestapi/linkedin-company-posts | Até 10 posts da página da Conta no período | Post classificado (modelo dos Sinais ou regra) em expansão, nova unidade, contratação, investimento ou certificação (PR-8) |

Regras comuns (`adaptadores/comum.ts`): a empresa do resultado só é a Conta pela página do LinkedIn, pelo domínio ou pelo nome sem a forma jurídica (na dúvida, não é); tudo é filtrado pelo período; os textos cabem nos limites da tabela de Sinais; nada de e-mail, telefone, foto nem dado de quem avaliou. A Conta sem o dado que o actor precisa (a página do LinkedIn, um Contato com LinkedIn) é pulada antes de abrir a varredura, sem reservar crédito, e o motivo aparece no Monitoramento ("Contas sem a página da empresa no LinkedIn ficaram de fora: Beta.").

## Reativação de Sinais (ticket 08)

A mesma função cuida da fila de buscas (`private.signal_rescans`), **antes** dos Monitoramentos do relógio, porque quem clicou está esperando:

- **A busca do clique** ("Buscar Sinais de novo" na Conta, `request_account_rescan`): varre a Conta com todos os Monitoramentos ativos do Workspace, mesmo que ela não esteja no público deles. Só gasta crédito (1 por Monitoramento): o clique é a confirmação, então o interruptor e o teto do automático não entram.
- **A busca mensal**: todo dia às 05:17 UTC o relógio (`althius-signal-reactivation`) enfileira as Contas com Fit que esfriaram (estágio Fit e nenhum Sinal válido) e ainda não foram revisitadas nos últimos 30 dias, e só num Workspace com o automático da varredura ligado, com teto aprovado, sem pausa e com Monitoramento ativo. Cada varredura gasta crédito **e** teto (`begin_rescan_scan`; `end_rescan_scan` devolve o teto se a varredura falha). Sem teto ou sem saldo, a busca para com o motivo e as outras buscas mensais do Workspace param junto.
- Cada varredura reserva pela busca e pelo Monitoramento, então repetir a volta nunca cobra duas vezes; a que falha não é cobrada. Se o tempo da função acaba no meio, a busca volta à fila e a função chama o relógio de novo (`kick_rescan_runner`).
- Só acontecimento novo reaquece: o banco (`record_signal`) trata o mesmo acontecimento como reencontro, sem Sinal novo nem prazo renovado.
- O Monitoramento que não pode varrer a Conta (falta a página do LinkedIn, por ex.) é pulado na busca sem cobrar; se nenhum pôde, a busca para com o motivo.

## Sinais em cascata (sinais em cascata, fatia 2)

Um tipo de Sinal que é **cascata** (`private.signal_cascades`, ao lado do registro de actors) roda pelo MESMO motor da conversa do Hermes (`_shared/cascata-de-sinais`), uma vez por rodada do Monitoramento e para o público inteiro, e não pelo caminho de uma varredura por Conta com adaptador:

- a chave da execução é `monitor:<id do Monitoramento>:<hora marcada da rodada>`: repetir a rodada nunca reserva, cobra nem grava duas vezes;
- a reserva de crédito é a da cascata (`begin_cascade_run`), não o 1 crédito por Conta (`begin_account_scan`); o Monitoramento automático ainda confere o interruptor e o teto da varredura automática, e roda uma vez por dia;
- cada passo grava run id do Apify, actor, conta usada (índice), custo real, status HTTP e o erro real (`signal_cascade_run_steps`); o que chega a `signal_monitors.last_error` é só a mensagem em palavras do produto;
- a "Buscar Sinais de novo" (reativação) por enquanto só olha os Sinais com actor e adaptador; incluir as cascatas nela é um passo seguinte.

### Tipos genéricos do catálogo atendidos por cascatas (auditoria de Sinais, 13/10/2026)

Um tipo genérico da tela (Novo escritório, Registros empresariais, Investimentos anunciados, Crescimento de equipes, Expansão geográfica e a Abertura de vagas, `vaga_linkedin`) não é uma cascata: `private.signal_type_cascades` liga o tipo às cascatas de empresa que o servem, de qualquer ICP. O Monitoramento do tipo roda assim:

- o tipo com **actor disponível** e adaptador segue o caminho do actor, como sempre; o plano das cascatas nem é consultado;
- senão, o runner pede o plano ao banco (`signal_type_cascade_plan(<id do Monitoramento>)`): as cascatas do tipo que estão **disponíveis** e, entre elas, as **devidas**, isto é, sem execução concluída, parcial ou em andamento deste Monitoramento dentro da cadência da própria cascata (a mensal não roda todo dia). Cascata em teste não roda;
- cada cascata devida roda, uma depois da outra, pelo mesmo motor, com **a sua** reserva de crédito, o seu teto e o seu rastro (`signalType` da cascata). O pedido leva `registrarComo: <tipo genérico>`: o Sinal de Conta é gravado no tipo do Monitoramento, então a tela não precisa conhecer as cascatas. A chave é `monitor:<id>:<hora marcada>:<cascata>`;
- uma cascata que falha não derruba as outras; as mensagens iguais aparecem uma vez no Monitoramento. Uma cascata nova só começa até o prazo para começar; as que não couberam continuam devidas e o Monitoramento volta já (`continuar`), sem repetir as que já rodaram;
- a cascata de **mercado** nunca atende um tipo genérico (o motor a recusa; o banco também): o evento tem de ser numa empresa compradora do Workspace;
- a "Buscar Sinais de novo" continua só com os Sinais com actor.

## Abertura de vagas no mercado endereçável

O Monitoramento de Abertura de vagas (`vaga_linkedin`) com `audience.escopo = 'mercado'` não varre Contas-alvo: procura empresas que estão contratando os cargos dele no nicho, no país e no estado. O runner lê o escopo (`signal_monitor_scope`) antes de tudo e roda a cascata da descoberta (`vaga_mercado`, `_shared/cascata-de-sinais/passos/vagas-mercado.ts`) pelo mesmo motor:

- a busca usa os cargos (`criteria.funcoes`) e o nicho (Custom ou pronto) como palavras-chave, no país e no estado; a confirmação passa cada vaga pelos cargos, senioridade, palavras e período do Monitoramento, pelo estado e pelo filtro do nicho (`vagasDoNicho`: o modelo dos Sinais quando `SIGNALS_LLM_PROVIDER` está ligado, senão palavra-chave); a mesma vaga (empresa e cargo) conta uma vez;
- as empresas que não são Conta e não têm site ganham site e LinkedIn pela página da empresa (até 25 por rodada); a que continua sem site vira candidata pela página do LinkedIn, com a etiqueta "sem site";
- a empresa que é Conta recebe o Sinal no tipo do Monitoramento; o resto vai a `record_signal_for_company` e vira candidata da Caixa de Descobertas, com aceite manual. Nada cria Conta nem Sequência e nada envia mensagem;
- o preço é fixo: 4 créditos por rodada (`private.market_discovery_credits_per_run()`), reservados por `begin_cascade_run` (contrato ativo, saldo, teto da varredura automática). A chave é `monitor:<id>:<hora marcada>:mercado`. A cascata nasce em teste e só roda pelo Monitoramento de mercado; ela não aparece no catálogo de cascatas.

Diagnóstico de "o Monitoramento nunca roda": `select private.signal_runner_diagnostics();` (só leitura, no SQL Editor).

O relógio diário (`private.kick_comexstat_cache`, onde o agendador existe) chama esta mesma função com `{ "action": "aquecer" }` e o token do relógio. Isso só guarda a estatística de comércio exterior do mês e não reivindica Monitoramento. Corpo vazio continua a varredura de sempre.

## Rodar agora e o registro da Rodada (agente-de-sinal 02)

O clique de uma pessoa ("Rodar agora" na página do Sinal) entra na fila `private.signal_run_requests` (`request_signal_run_now`: no máximo um pedido aberto por Monitoramento, com a prévia em créditos conferida no servidor). Não nasce outro relógio nem outro runner: o `althius-signal-runner` de sempre acorda a função, e `private.signal_monitors_due()` agora também acorda com pedido manual esperando (a Rodada começa em até 10 minutos).

- **Ordem na chamada**: as buscas da reativação, depois os pedidos do Rodar agora (`claim_signal_run_requests`, `for update skip locked`, posse de 15 minutos), depois os Monitoramentos vencidos. O orçamento de tempo é o mesmo (150 s; uma Conta nova só começa até 72 s).
- **O pedido roda o Plano do Monitoramento só nas Contas do escopo**, com `begin_account_scan` em modo manual (`p_origin = 'manual'`): cobra o crédito de cada Conta verificada e respeita o saldo, o limite do contrato e o limite mensal de quem pediu, mas não consome o Teto de automação (`private.manual_run_uses_automation_cap()`, DECISÃO PENDENTE 4). A chave de cobrança é `scan:<Monitoramento>:<Conta>:manual:<pedido>`, então repetir a volta nunca cobra duas vezes. A Conta sem o dado que o actor precisa (`SemDadoParaVarrer`) é pulada antes de abrir a varredura: não reserva nem cobra.
- **O que não cabe no tempo continua**: o pedido volta a `pendente` com a rotação das Contas avançada (`scan_offset` do pedido) e a Rodada segue aberta, na mesma linha. O Monitoramento não muda de estado nem de horário (`next_run_at` é do relógio).
- **Toda Rodada grava uma linha** em `private.signal_monitor_runs`, agendada ou manual: `open_signal_run` abre (ou reencontra) a Rodada, `record_signal_in_run` liga cada Sinal (novo ou visto de novo) a ela, `add_signal_run_progress` soma as Contas verificadas, os Sinais, as Contas sem dado, os créditos (conferidos nas reservas liquidadas) e o motivo da parada, e `finish_signal_monitor_run` (agendada) ou `finish_signal_run_request` (manual) a fecha. Uma falha ao registrar nunca derruba a varredura.
- **Motivo da parada** (`stop_reason`, código estável): `sem_creditos`, `teto` (limite do mês ou da automação), `contrato_inativo`, `prazo` (o tempo da função acabou), `concluida` e `erro`. A frase dos Monitoramentos (`MOTIVO_DA_PARADA`) continua igual; o pedido manual usa a mesma com o texto de quem clicou.
- Só o caminho por Conta (Plano com actor e adaptador) roda sob demanda. Cascata, Sinal interno e mercado ficam de fora do Rodar agora (a prévia devolve `sem_fonte`), mas as Rodadas agendadas deles também são registradas, com as contagens.

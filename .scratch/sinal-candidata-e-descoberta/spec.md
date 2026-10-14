# Spec: Sinal vira candidata, e a Descoberta ganha motivos

**Status:** ready-for-human (código neste PR; migrações e deploy ficam com o Kauê)

**Frente:** sinais e descoberta. Terceiro de três PRs (depois de `acesso-e-planos` e `creditos-moeda-unica`). Junta e
corrige os antigos PR-C e PR-D. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisões que valem aqui: [ADR-0002](../../docs/adr/0002-permissoes-ler-propor-executar.md) (o Agente propõe, a pessoa
decide), [ADR-0006](../../docs/adr/0006-aderencia-como-classificacao-unica.md) (a tela mostra o nível, nunca a nota) e
[ADR-0007](../../docs/adr/0007-sinal-disparado-torna-conta-quente.md) (Sinal vale 30 dias e torna a Conta Quente).

## Problema

Um Sinal só existe hoje para uma Conta-alvo. Quando a cascata acha um acontecimento numa empresa que ainda não é Conta
(uma filial nova, um financiamento, uma vaga), ela só conta "sem Conta" e joga o resto fora. A Caixa de Descobertas, por
outro lado, só recebe empresas da busca pelo ICP, não sabe dizer por que uma empresa merece atenção agora, esquece um
descarte para sempre e não aceita uma empresa que só tem CNPJ.

## Solução

1. **Origem.** `private.discovered_accounts.origin` (`busca`, `sinal`, `sincronizacao`; padrão `busca`). Ninguém grava
   `sincronizacao` por enquanto (é do Renan).
2. **Resolução do Sinal.** Um Sinal que tem empresa (cascata, Sinal de mercado com CNPJ) procura a empresa nas Contas do
   Workspace por CNPJ e depois por domínio. Se é Conta, o Sinal vai para ela, pelo `record_signal` de sempre (que a torna
   Quente). Se não é, cria ou atualiza a candidata com `origin = 'sinal'`.
   - `private.signals.target_account_id` vira opcional e entra `discovered_account_id`, com um check que exige exatamente
     um dos dois.
   - Os motivos ficam em `private.discovery_reasons(discovered_account_id, signal_id)`, separados da coluna
     `signals jsonb` (que continua sendo só o indício que a fonte da busca trouxe).
   - Sinal de mercado sem empresa continua como painel de contexto em Mercado.
3. **Deduplicação.** A `private.discovery_duplicate` é a regra; um Sinal nunca cria duas candidatas para a mesma empresa
   (CNPJ ou domínio) e, se ela já existe, só acrescenta o motivo.
4. **Descarte.** A descartada fica escondida e a busca por ICP nunca a traz de volta. Volta para `nova` só quando chega
   um Sinal novo mais de 90 dias depois de `decided_at`: grava `reopened_by_signal_at` e a tela mostra "Voltou por novo
   Sinal" com o motivo do descarte anterior. Dentro dos 90 dias o Sinal só é registrado. `restore_discovered_account`
   continua restaurando a qualquer momento. O motivo do descarte é guardado.
5. **Aceite manual, nunca automático** (`accept_discovered_account`, atômico): o site é opcional quando há CNPJ; a Conta
   nasce (ou é ligada) com `origin = 'recomendacao'`; os Sinais da candidata migram para a Conta (`discovered_account_id`
   vira `target_account_id`) e a Conta fica Quente; o enriquecimento do Comitê dispara se o saldo e o limite mensal
   permitirem, senão a Conta fica com o botão "Enriquecer Comitê". Aceitar não cobra crédito.
6. **Nota** (`supabase/functions/account-discovery/pontuacao.ts`): Encaixe ICP mais o peso dos Sinais; o peso depende do
   tipo do Sinal e decai com o tempo (cheio até 30 dias, zero em 90). Os pesos ficam numa constante documentada. A tela
   mostra só o nível (alto, médio, baixo). A ordenação usa a nota e, no empate, o Sinal mais recente.
7. **Tela de Descobertas**, sem mudar a estrutura: a coluna "Motivos / Sinais" mostra o Sinal mais recente em linguagem de
   usuário ("Sinal: abriu filial em Campinas (12/10)") com "+N"; o detalhe lista todos os Sinais com data e fonte, sem
   nome de fornecedor; filtro "Origem" (Sinal, Busca, Sincronização, esta só quando houver dado); os Sinais com empresa,
   em Mercado e em Sinais encontrados, ganham "Ver candidata" ou "Ver Conta".
8. **Créditos.** Criar candidata não gasta crédito. O Comitê cobra os preços do PR-2 (1 por pessoa, 2 por e-mail, 5 por
   telefone). A Equipe Althius é ilimitada.

## Decisões

- **Quem grava o Sinal de uma empresa é uma função só**, `public.record_signal_for_company` (service_role). O
  `record_signal` continua sendo "o Sinal desta Conta" e é quem o resolvedor chama quando acha a Conta. O signal-runner
  só varre Contas, então os Sinais dele já caem na Conta e continuam como estão; a cascata (passos `casar_com_contas` e
  `casar_fatos_com_contas`) passa a entregar ao motor também as empresas que não são Conta, e o motor chama o resolvedor.
- **Identidade mínima da candidata de Sinal:** CNPJ ou domínio (site). Só com nome e página do LinkedIn não dá para
  deduplicar com segurança, então o Sinal fica na contagem de "sem Conta", como hoje.
- **`origin` de uma candidata que já existia:** um Sinal novo muda `busca` para `sinal` (o motivo para ela estar na lista
  agora é o Sinal) e nunca mexe em `sincronizacao`.
- **Reabertura guarda a história.** `discovered_accounts` exige `decided_at` nulo quando o estado é `nova`; ao reabrir,
  a decisão anterior vai para `reopened_discard_reason` e `reopened_decided_at`, e `decided_by`, `decided_at` e
  `discard_reason` ficam nulos.
- **Um Sinal "novo" para reabrir** é o que acabou de ser gravado (não é reencontro), disparou depois do descarte e ainda
  vale (30 dias), numa chegada que acontece mais de 90 dias depois de `decided_at`.
- **Conta sem site.** `target_accounts.canonical_url` passa a aceitar nulo, só para a Conta que nasce do aceite por CNPJ;
  um índice único impede duas Contas sem site com o mesmo CNPJ. O envio ao CRM já tolera `site` nulo (como `dominio`).
- **A nota é calculada na leitura** (o decaimento depende da data de hoje). O peso cheio de cada Sinal é gravado no
  motivo (`discovery_reasons.weight`), vindo da constante de `pontuacao.ts`, e a curva (30 e 90 dias), o teto dos Sinais e
  os cortes dos níveis ficam em funções SQL com os mesmos números, conferidos por teste nos dois lados.
- **O disparo do Comitê é do cliente web**, como o botão de sempre (a Edge Function `account-enrichment` roda com a sessão
  de quem pede e reserva o crédito nela). O aceite devolve `committee` (`liberado`, `sem_saldo`, `limite_do_mes`,
  `sem_contrato`) conferindo, sem reservar nada, as mesmas regras do `reserve_credits`; a tela dispara a busca quando está
  `liberado`.
- **Fora desta entrega:** o peso negativo do aprendizado com descartes (era opcional). O motivo do descarte fica
  guardado, também o anterior nas reaberturas, e a nota já tem onde receber o ajuste.

## Fora de escopo

- Conectores e integrações (HubSpot, Pipedrive, Notion, Unipile, WhatsApp, LinkedIn, e-mail). Gravar `sincronizacao`.
- Aplicar migração, deploy e segredos. Apagar dado.
- Mudar rotas, menus ou o layout do app.

## Testes

pgTAP (check "um dos dois", deduplicação, regra dos 90 dias com reabertura, aceite por CNPJ sem site, aceite que migra os
Sinais, Conta Quente, leitores do `private.signals`, isolamento por Workspace), Deno (nota e decaimento; motor entregando
a empresa que não é Conta ao resolvedor), Vitest (filtro de Origem, Motivo, "Voltou por novo Sinal", fluxo de aceite,
"Ver candidata" e "Ver Conta").

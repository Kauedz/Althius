# ADR-0032 — Agente de Sinal e Agente de Contas: o Sinal como um bot com Briefing, Plano e Agenda

Status: Proposta. A direção foi aprovada pelo Kauê em 23/10/2026 (análise `analises/sinais-contas-2026-10-23.md`); duas decisões já estão tomadas e vêm marcadas abaixo (os Modelos e a cobrança por rodada). Os valores e as escolhas de desenho que ainda não foram decididas estão na seção "Decisões em aberto", todas escritas como recomendação.

## Contexto

Hoje o Cliente configura um Sinal escolhendo um tipo no catálogo, preenchendo o formulário daquele tipo e ativando um Monitoramento (`private.signal_monitors`). O relógio do banco (`pg_cron` `althius-signal-runner`, a cada 10 minutos) acorda a Edge Function `signal-runner`, que varre o público do Monitoramento a cada `every_hours` horas (24 por padrão). O público é um escopo (`audience.escopo`, `contas` ou `mercado`, o segundo só para a Abertura de vagas e ainda em teste) mais as Contas-alvo escolhidas. A cobrança é por Conta varrida (1 crédito), ou fixa por rodada no mercado (4 créditos), e o automático exige o Teto mensal ([ADR-0019](0019-creditos-e-cobranca-por-usuario.md)).

Isso força o Cliente a pensar em tipos de formulário e em quantas horas de intervalo, quando o que ele quer dizer é "me avise quando uma dessas empresas abrir vaga de RevOps", e não deixa claro quanto vai gastar. Do outro lado, quem trabalha em Contas e Contatos não tem como pedir, em linguagem natural, "mostre as Contas do Sul sem Sinal há 60 dias e rode Sinais nelas".

O glossário ([`CONTEXT.md`](../../CONTEXT.md)) evita "bot, assistente, agente de X" para o termo Agente, e fixa quatro Especialidades ([ADR-0005](0005-agentes-criados-a-partir-de-especialidades.md), que substituiu a [ADR-0001](0001-agentes-fixos-sem-criacao-pelo-cliente.md)). Esta decisão muda parte desse vocabulário.

## Decisão

### 1. O Sinal do Cliente tem Briefing, Plano, Escopo e Agenda

- **Briefing**: o que a pessoa quer, em linguagem natural.
- **Plano** (versionado): a configuração estruturada e editável que a IA monta a partir do Briefing, ou que vem de um Modelo. Diz o que procurar, em que fontes, com quais critérios.
- **Escopo**: onde o Plano procura. `mercado` (descobre empresas novas), `lista` (lista importada ou salva), `contas` (Contas escolhidas a dedo) ou `todas_as_contas`.
- **Agenda**: quantas Rodadas por dia e em quais horários. Antes de ativar, a pessoa vê os créditos por Rodada, por dia e por mês.

Por baixo, o Sinal do Cliente continua sendo um Monitoramento (`private.signal_monitors`): o mesmo registro, o mesmo relógio, o mesmo `signal-runner`, as mesmas regras de Sinal disparado (vale 30 dias, torna a Conta Quente, [ADR-0007](0007-sinal-disparado-torna-conta-quente.md)). Briefing, Plano e Agenda são a cara nova do Monitoramento, não um segundo sistema. Onde o Plano versionado e a Agenda são guardados é desenho do ticket 01, não desta ADR.

### 2. Só o Plano aprovado roda, nunca o texto livre

O Briefing nunca é executado e nunca é instrução para o `signal-runner`: ele só alimenta a IA que propõe o Plano. O Plano proposto pela IA não roda até uma pessoa aprová-lo (a IA propõe, a pessoa decide, como na [ADR-0002](0002-permissoes-ler-propor-executar.md)). Editar o Plano cria uma versão nova que também precisa ser aprovada; a Rodada em andamento termina com a versão com que começou. O servidor confere o Plano contra as fontes disponíveis e os limites antes de aceitá-lo, e trata o texto do Briefing como dado, sem poder de escolher fonte, preço ou limite.

### 3. O resultado chega sempre com "por que apareceu"

No escopo `mercado`, o resultado é uma empresa nova na Caixa de Descobertas (Candidata). Nos escopos `contas`, `lista` e `todas_as_contas`, é um Sinal novo numa Conta conhecida. Em ambos, a tela diz por que apareceu. O que não muda: aceitar uma Candidata é decisão de uma pessoa, e nada neste fluxo envia mensagem a um Contato, cria Conta-alvo ou cria Sequência sozinho.

### 4. Modelos são planos-semente versionados (decisão do Kauê, 23/10/2026)

O catálogo de Sinais continua, mas vira **Modelos**. Cada Modelo é um plano-semente versionado, já configurado com a IA: Briefing pronto, Plano editável, Agenda sugerida e estimativa de créditos. Não é mais um tipo fixo de formulário. A pessoa usa um Modelo e ajusta, ou descreve o próprio Sinal. Nos dois caminhos só roda o Plano aprovado, com o custo em créditos visível antes de ativar.

### 5. Cobrança por rodada, em créditos (decisão do Kauê)

Cada Rodada gasta créditos do Cliente. Mais Rodadas, mais créditos, por escolha do Cliente. A prévia (por Rodada, por dia, por mês) aparece antes de ativar. Existem limites seguros: intervalo mínimo entre Rodadas, máximo de Rodadas por dia, teto diário por Sinal e um comportamento definido quando o saldo acaba. O cliente vê só créditos, nunca dólar, custo de fornecedor ou nome de actor. Os valores desses limites e a forma do preço são as decisões 2, 3, 4 e 14 abaixo.

Isso especializa a [ADR-0019](0019-creditos-e-cobranca-por-usuario.md) ("varredura de Sinais, por Conta varrida"): a unidade de cobrança do Sinal passa a ser a Rodada, e o cálculo por fonte fica na decisão 2. O resto da ADR-0019 vale: o saldo é único do Workspace, paga o Workspace onde a ação acontece, e o Teto mensal aprovado continua sendo exigido do que roda sozinho.

### 6. "Agente de Sinal" e "Agente de Contas" passam a existir para o Cliente

- **Agente de Sinal**: o nome que o Cliente vê para o fluxo Briefing, Plano, Agenda, Rodada.
- **Agente de Contas**: um chat dentro de Contas e Contatos que busca, filtra e lê Contas e Candidatas, pede enriquecimento (com custo), propõe aceitar ou descartar e transforma uma conversa num rascunho de Sinal ("roda Sinais nessas Contas"). Propõe e rascunha; quem decide é a pessoa, e o rascunho só roda como Plano aprovado.

## Relação com as ADRs 0001, 0004 e 0018

**ADR-0001 e ADR-0005.** A ADR-0001 foi substituída pela ADR-0005; a que vale é a 0005.

- Continua: o catálogo fechado de quatro Especialidades (Scopus, Ethos, Rhetor, Oraculum), os Agentes padrão que todo Workspace tem, e o Cliente não criar Especialidade. "Agente de Sinal" e "Agente de Contas" não são Especialidades novas do catálogo nem Agentes criados ("Especialidade · complemento").
- Muda: os dois termos passam a existir para o Cliente. O "Avoid" de Agente ("bot, assistente, agente de X") deixa de valer para eles e continua valendo para qualquer outro "agente de X".
- Em aberto: se o Agente de Contas é uma Especialidade nova (o que reabriria o catálogo de quatro da ADR-0005) ou o Scopus reposicionado. Ver decisão 1.

**ADR-0004.** Continua: a Coordenação não é um Agente, não tem nome nem página, e o composer da página de Agentes segue como está. O Agente de Contas é um chat dentro de Contas e Contatos, com nome e escopo próprios, e não é a Coordenação. Se ele virar uma quinta Especialidade, o argumento da ADR-0004 ("dilui o catálogo") volta à mesa, e é por isso que a decisão 1 fica em aberto.

**ADR-0018.** Continua: o motor dos Agentes é invisível para o Cliente (para ele, quem responde é a Althius), o contrato com o banco é o encaixe de qualquer motor, e a IA dos Sinais passa pelo motor configurado em `SIGNALS_LLM_PROVIDER`. O Plano é proposto por esse motor; quem executa é o `signal-runner`, que só roda Plano aprovado. A [ADR-0002](0002-permissoes-ler-propor-executar.md) vale para o Agente de Contas: o que age fora (enriquecer com custo, aceitar, descartar) é proposto e depende de uma pessoa. A ressalva da ADR-0018 sobre isolamento por Workspace do login do Hermes continua valendo e pesa mais aqui, porque gerar Planos passa a ser ação do Cliente (ver riscos).

As ADRs 0001, 0004, 0005 e 0018 não são editadas enquanto esta estiver como Proposta. Se for aceita, cada uma ganha uma linha de remissão à ADR-0032.

## Decisões em aberto

As decisões abaixo **não foram tomadas**. O padrão é a recomendação; quem implementa usa esse padrão isolado num lugar fácil de trocar (constante no servidor ou campo de configuração) e nunca o trata como decidido.

1. **Barra lateral e posição do Agente de Contas.** DECISÃO PENDENTE (padrão recomendado): "Agente de Sinais" e "Agente de Contas" como itens principais da barra lateral; os quatro Especialistas continuam por @menção e Coordenação. Se o Agente de Contas é uma Especialidade nova ou o Scopus reposicionado fica em aberto.
2. **Preço por rodada.** DECISÃO PENDENTE (padrão recomendado): fixo por fonte, isto é, por Conta verificada no escopo Contas e fixo por Rodada no mercado. A Rodada sem novidade cobra o que foi verificado. _Nota de implementação (agente-de-sinal 02): o padrão está em uso no Rodar agora, ainda pendente. A Rodada manual cobra `scan_credits(tipo)` por Conta verificada; a Conta sem dado suficiente (sem a página do LinkedIn, sem Contato com LinkedIn, sem nome) é pulada antes de abrir a varredura e não cobra._
3. **Agenda.** DECISÃO PENDENTE (padrão recomendado): intervalo mínimo de 2 h, até 6 Rodadas por dia por Sinal, dias úteis como padrão. _Nota de implementação (agente-de-sinal 02): só o intervalo mínimo de 2 h entre duas Rodadas manuais do mesmo Sinal está em uso, ainda pendente, em `private.signal_run_limit('manual_min_interval_minutes')`. As Rodadas por dia e os dias úteis são do ticket 03._
4. **Teto.** DECISÃO PENDENTE (padrão recomendado): o automático continua exigindo o Teto mensal, e "Rodar agora" (clique humano) não exige, como o "Buscar Sinais de novo" manual de hoje. Enquanto não for decidido, o Teto mensal vale para o automático. _Nota de implementação (agente-de-sinal 02): o padrão está em uso, ainda pendente. "Rodar agora" cobra créditos e respeita o saldo, o limite do contrato e o limite mensal de quem pediu, mas não exige nem consome o Teto de automação. A regra está numa função só, `private.manual_run_uses_automation_cap()`, que hoje devolve `false`; trocar para `true` faz o manual consumir o Teto como o automático._
5. **Validar `vaga_mercado` em produção.** DECISÃO PENDENTE (padrão recomendado): validar já, como tarefa operacional fora do código, antes de abrir o escopo `mercado` a qualquer Cliente.
6. **Página de Sinais.** DECISÃO PENDENTE (padrão recomendado): reorganizar em "Meus Sinais" e "Modelos".
7. **Lista importada.** DECISÃO PENDENTE (padrão recomendado): oferecer "Importar como Contas-alvo" e "Só monitorar", com "Só monitorar" como padrão para listas grandes.
8. **Um Sinal com vários tipos.** DECISÃO PENDENTE (padrão recomendado): sim, como Sinal pai com Monitoramentos filhos. Até lá, um tipo por Plano.
9. **Lista estática ou dinâmica.** DECISÃO PENDENTE (padrão recomendado): começar com listas fixas e "todas as Contas" (dinâmica).
10. **Limites para listas.** DECISÃO PENDENTE (padrão recomendado): até 100 empresas por Rodada (o resto em rotação), até 50 Contas escolhidas a dedo e no máximo 1 Rodada por dia em lista com mais de 50.
11. **Conta nova roda Sinais.** DECISÃO PENDENTE (padrão recomendado): oferecer o botão com o preço; o automático é uma opção do Workspace, desligada.
12. **Ordem.** DECISÃO PENDENTE (padrão recomendado): o primeiro corte ponta a ponta começa pelo escopo Contas (os actors já estão `available`), antes do mercado.
13. **Gerar o Plano pela IA.** DECISÃO PENDENTE (padrão recomendado): não cobra crédito, com limite de 20 Planos por dia por Workspace.
14. **Pausa automática.** DECISÃO PENDENTE (padrão recomendado): depois de 3 Rodadas seguidas puladas por falta de créditos, o Sinal pausa e mostra o motivo.

## Consequências

- O Cliente passa a escolher a frequência e, portanto, o gasto. O custo cresce com Rodadas por dia, Contas por Rodada e fontes por Plano, sem teto natural. Sem os limites da decisão 3 e 10, um Sinal em todas as Contas, seis vezes por dia, pode consumir o saldo do mês em poucos dias. A prévia antes de ativar e a pausa por falta de saldo (decisão 14) são a defesa, e vale mostrar o gasto real ao lado da estimativa.
- A qualidade do Plano da IA passa a ser parte do produto. Um Plano ruim gasta crédito para achar pouco. Mitigações: o Plano é editável e aprovado por uma pessoa, a estimativa de créditos é mostrada antes, os Modelos partem de um plano-semente já pronto, e o servidor valida o Plano contra as fontes disponíveis.
- O Briefing é texto do Cliente que vai a um modelo de IA. Ele precisa ser tratado como dado não confiável: não pode escolher fonte, preço nem limite fora do que o servidor valida.
- A cascata `vaga_mercado` ainda está em teste (nasceu em teste, como toda cascata nova) e ainda não foi validada em produção. O escopo `mercado` depende dela, e é por isso que a decisão 12 recomenda começar pelo escopo Contas e a decisão 5 pede validação em produção antes de abrir o mercado.
- A vazão do `signal-runner` limita listas grandes. A função tem 150 s, uma Conta nova só começa até 72 s e o relógio acorda a cada 10 minutos, então uma lista grande não cabe numa Rodada e precisa de rotação (`scan_offset` já existe). A Agenda por horário é, no melhor caso, tão exata quanto o relógio de 10 minutos. Os limites da decisão 10 existem por isso.
- Gerar Planos passa a ser ação do Cliente sobre o motor de IA. O login único do Hermes (ADR-0018) precisa de isolamento por Workspace antes de haver Cliente de fora, e o limite de 20 Planos por dia (decisão 13) protege o motor enquanto isso não acontece.
- O vocabulário do Cliente ganha dois termos de Agente que não são Especialidades. Se a decisão 1 escolher uma quinta Especialidade, a ADR-0005 e a ADR-0004 precisam ser revistas; se escolher o Scopus reposicionado, o Scopus passa a ter duas portas de entrada.
- A palavra "Sinal" passa a ter dois usos, que o glossário separa: o Sinal disparado (a evidência) e o Sinal do Cliente (o que ele configura e roda, que por baixo é um Monitoramento).
- Não há migration nem mudança de código, tela ou banco neste PR. As migrations vêm nos tickets de `.scratch/agente-de-sinal/`, cada uma com o seu PR.

## Alternativas

- Manter o catálogo de tipos fixos com formulário, só trocando o rótulo: descartado, porque não dá ao Cliente o caminho "descrevo o que quero" e mantém o preço escondido atrás de `every_hours`.
- Rodar o Briefing direto, sem Plano aprovado: descartado, porque a IA passaria a decidir fonte, custo e frequência sem uma pessoa ver, e um texto livre mal interpretado gastaria crédito sem controle.
- Cobrança por mês de Sinal ativo, em vez de por Rodada: não adotada, porque a decisão do Kauê é cobrar por Rodada, o que deixa o custo seguir o que o Cliente de fato pede.
- Agente de Sinal e Agente de Contas como Especialidades novas já agora: não decidido. A ADR-0005 fecha o catálogo em quatro justamente para sustentar os planos; mexer nele é decisão de produto, registrada como a decisão 1.
- Agente de Contas como a Coordenação com acesso a Contas: descartado, porque a ADR-0004 mantém a Coordenação sem nome, sem página e sem ação; um chat dentro de Contas e Contatos precisa de escopo e permissão próprios.

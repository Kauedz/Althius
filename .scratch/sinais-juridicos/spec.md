# Spec: Sinais de jurimetria (mercado jurídico, B2B)

**Status:** needs-triage

**Frente:** Sinais (backend real), família nova. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Vocabulário e telas: [`modulo-de-sinais`](../modulo-de-sinais/spec.md). Mecanismo dos Sinais reais:
[`sinais-reais`](../sinais-reais/spec.md) (os "Sinais próprios" do ticket 09 são o encaixe deste spec). Decisão do
Nan em 01/10/2026: **só B2B** (o escritório prospecta empresas, nunca pessoas físicas).

## Problem Statement

O advogado não pode prospectar como um vendedor comum. Pelo que se sabe, o Código de Ética da OAB e o Provimento
205/2021 permitem marketing de conteúdo e publicidade informativa e sóbria, e proíbem a captação ativa de clientela e a
mercantilização. **Nenhum artigo foi conferido neste spec: quem confere é um advogado (ticket 02).** Os Sinais de
compra de hoje (vagas, anúncios, mudança de cargo) dizem "aborde esta Conta agora", o que não serve ao escritório.
O mercado jurídico tem uma fonte de Sinal própria, a **jurimetria** (estatística sobre processos e decisões), que
quase ninguém usa na prospecção.

## Solution

Uma família nova no catálogo, **Jurimetria**, de Sinais externos sobre Contas-alvo (empresas, por CNPJ). Em vez de
"aborde agora", o Sinal diz "há um motivo público para o escritório se manifestar": publicar um conteúdo, convidar para
um evento, reforçar um relacionamento que já existe. O uso é decidido pelo advogado; **nenhum Sinal de jurimetria
dispara mensagem automática**. O desenho segue o framework **JURI**, quatro tipos de Sinal:

| Letra | Tipo | Exemplo | Uso pelo escritório |
| --- | --- | --- | --- |
| **J** | Janela | Tema repetitivo, súmula ou tese nova que atinge o setor da Conta | Conteúdo sobre o impacto, para quem já acompanha o escritório |
| **U** | Urgência | Recuperação judicial ou execução fiscal da Conta | Tarefa para o advogado avaliar se há relacionamento prévio |
| **R** | Recorrência | Aumento do volume de ações novas contra a Conta, frente ao normal dela | Material sobre prevenção de passivo daquele setor |
| **I** | Impacto | Condenação grande, ação coletiva ou ação civil pública contra a Conta | Contexto para o advogado se posicionar |

**Primeira entrega: J e R**, porque geram conteúdo e dependem menos de dados sobre a Conta. U e I vêm depois, só com a
política de uso (ticket 02) aprovada.

## Riscos que a pesquisa precisa fechar antes de construir (ticket 01)

- **Casar processo com CNPJ.** Não se sabe se a fonte pública mais óbvia (DataJud, do CNJ) traz as partes dos
  processos; pode ser que não. Sem isso, **R, U e I não saem**, e só o J (que não precisa da parte) fica de pé.
- **Cobertura e atraso** dos dados por tribunal.
- **Termos de uso e preço** de cada fonte, incluindo agregadores pagos.
- **Ligar tema ao setor.** A Conta-alvo tem `segment`; um tema repetitivo tem uma matéria. A ligação entre os dois é
  uma tabela mantida por gente (não por IA) no começo.

## User Stories

1. Como advogado de um escritório, quero ver quando uma tese nova atinge o setor de uma Conta-alvo, para preparar um
   conteúdo sobre o assunto.
2. Como advogado, quero ver quando o volume de ações novas contra uma Conta-alvo sobe, para saber de que assunto vale falar.
3. Como sócio do escritório, quero que a Althius nunca dispare mensagem automática a partir de um Sinal de jurimetria.
4. Como advogado, quero ver a evidência pública de cada Sinal (tribunal, classe, assunto, data e link da fonte).
5. Como participante, quero que o mesmo acontecimento não conte duas vezes.
6. Como participante da Demonstração, quero ver a família Jurimetria no catálogo, simulada.

## Implementation Decisions

- **Só Conta-alvo com CNPJ** (`legal_identifier`). Nada de pessoa física: nenhum nome de parte pessoa física é guardado
  (LGPD). Se um processo tiver parte pessoa física, ela fica de fora da evidência.
- **Mecanismo:** os Sinais próprios do ticket 09 de `sinais-reais` (fonte fora do Apify, registrada no registro de
  actors, "Em teste" antes de "Disponível"). A forma de registrar um Sinal que não vem do Apify é definida no primeiro
  ticket filho do 09; este spec depende dela.
- **Chaves do acontecimento (dedupe):** `tese|<tribunal>|<número do tema>` e `volume|<CNPJ>|<assunto>|<AAAA-MM>`.
- **Uso restrito:** um Sinal de jurimetria só gera tarefa ou conteúdo proposto, sempre com Aprovação de uma pessoa
  (Propor, nunca Executar, [ADR-0002](../../docs/adr/0002-permissoes-ler-propor-executar.md)).
- **Custo:** fontes públicas gratuitas custam zero de crédito de Apify; o que for pago entra na tabela de créditos antes
  de ficar "Disponível" ([ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md)).

## Testing Decisions

- Deno: o adaptador de cada Sinal com resultados de exemplo fictícios (sem dado pessoal), no padrão dos adaptadores de
  `sinais-reais`.
- pgTAP: Sinais só do Workspace; deduplicação pelas chaves acima.
- Frontend: o card da família Jurimetria e o estado de cada um (Disponível, Em teste, Em breve).

## Out of Scope

- **B2C** e qualquer Sinal sobre pessoa física.
- **Disparo automático** de mensagem a partir de Sinal de jurimetria.
- **Jurimetria preditiva** (chance de êxito, perfil de decisão de um juiz) e qualquer dado de magistrado individual.
- Os tipos U e I, até a política de uso estar aprovada.

## Decisões a confirmar com o Nan

1. Quem valida as regras da OAB: um advogado da Javali, do escritório-cliente ou externo?
2. O nome da família no catálogo: "Jurimetria"?
3. Um Workspace marcado como escritório de advocacia deve, além disso, ter o envio automático desligado para todos os
   canais? Fica para o ticket 02 propor; não é desta spec decidir.

## Further Notes

- Tickets em `issues/`. 01 (pesquisa) e 02 (política com um advogado) começam já e não dependem um do outro; 03 e 04
  dependem dos dois e do primeiro ticket filho do 09 de `sinais-reais`.

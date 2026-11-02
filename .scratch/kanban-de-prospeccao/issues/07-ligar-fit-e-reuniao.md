# 07: Ligar Fit, Não fit e Reunião ao cartão

**What to build:** os três eventos do ticket 02 que ninguém chama passam a mover o cartão: reunião marcada → Reunião; Fit → Fit; Não fit → Descartada.

**Blocked by:** 01 e 02 (fechados). A Parte B depende do ticket 08 (Aderência da Conta-alvo gravada).

**Status:** ready-for-agent (Parte A, Reunião); a Parte B, Fit e Não fit, é entregue pelo ticket 08

## Contexto

O ticket 02 criou o gancho `private.record_prospecting_event(workspace, conta, evento)` e deixou o ponto de chamada de cada evento "para a spec dona chamar ao entregar". Na `main` (dca7e3bf) só chamam o gancho: `sinal_novo` (`20260930180000`, `20260930220000`, `20261018120000`), `sinais_vencidos` (`20260930180000`), o primeiro Envio e a resposta (gatilhos da `20260930150000`) e o envio ao CRM. **`fit`, `nao_fit` e `reuniao_marcada` não são chamados por ninguém**: a coluna Fit só enche à mão, Não fit nunca descarta, e marcar "reunião marcada" num Envio não leva o cartão a Reunião.

## Parte A: Reunião (pronta)

- O desfecho `reuniao_marcada` já existe em `private.send_outcomes` (migration `20261001100000_resultado_de_cada_envio.sql`), gravado por `private.record_send_outcome` (pessoa ou Agente).
- Ligar por gatilho `after insert or update of outcome` em `private.send_outcomes`: quando o desfecho vira `reuniao_marcada` (ou `oportunidade`, que pressupõe a reunião), achar a Conta-alvo pelo Envio → Sequência e chamar `private.record_prospecting_event(..., 'reuniao_marcada')`. Gatilho, sem redefinir `record_send_outcome`, como o ticket 02 fez com o Envio e a resposta.
- O gancho já não volta o cartão: Conta em No CRM continua em No CRM.
- Reclassificar o Envio depois (ex.: de `reuniao_marcada` para `resposta_negativa`) não volta o cartão (regra da spec).

## Parte B: Fit e Não fit (decidido: vai para o ticket 08)

Pelo `CONTEXT.md`, Aderência é "a classificação de encaixe de uma Conta-alvo no ICP pelo Scopus: Fit ou Não fit". Hoje:

- `public.target_accounts` não tem coluna de Aderência, e a Fonte de Contas real não preenche `aderencia` (só a Demonstração, em `dados-contas-demo.ts`).
- O `fit_level` que existe é das empresas descobertas (`private.discovered_accounts`), outra coisa: uma nota contra o ICP, que o `desfazer-sinais-first` 07 zerou para `sem_dado` (`20261219030000_sem_icp_estruturado.sql`).
- O Scopus não tem ferramenta que grave Fit/Não fit numa Conta-alvo.

**Decisão a tomar (com padrão recomendado):**

- **Recomendado:** a Aderência da Conta-alvo vira um dado gravado (Fit / Não fit / sem avaliação, com quem avaliou e quando), definido pela pessoa responsável pela Conta ou pelo Scopus. Gravar dispara o evento. Isso é uma migration aditiva mais uma ferramenta do Scopus e um seletor na tela, e talvez caiba melhor numa spec da frente de Contas/ICP do que aqui.
- **Alternativa:** tirar o evento automático de Fit da spec e deixar a coluna Fit só manual (o gancho fica sem chamada, documentado). Não fit continua descartando à mão.

**Decidido em 2026-11-02 pelo dono do produto: a recomendada.** A Aderência vira dado gravado na Conta-alvo, e gravar dispara `fit`/`nao_fit`. Por ser maior (migration, ferramenta do Scopus e tela), fica no ticket [08](08-aderencia-da-conta-gravada.md); este ticket entrega só a Parte A.

## Pode mexer

- Migration aditiva com o gatilho em `private.send_outcomes` (Parte A).
- pgTAP novo.

## Não mexa

- Em `private.record_send_outcome`, `public.set_send_outcome` e `private.record_prospecting_event` sem partir da última definição na `main`; o padrão é gatilho, não redefinição.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Marcar `reuniao_marcada` (ou `oportunidade`) num Envio leva a Conta para Reunião, com o evento no histórico.
- [ ] Conta já em Reunião ou No CRM não muda; reclassificar o Envio não volta o cartão.
- [ ] Envio de outro Workspace não alcança a Conta.
- [x] Parte B: decisão registrada (Aderência gravada, ticket 08).

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration conforme `docs/agents/migrations.md` (validar com rollback, rodar o pgTAP novo pelo `scripts/pgtap-no-remoto.sh`, aplicar e conferir o md5).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-11-02: aberto a partir da avaliação da spec contra a `main` dca7e3bf; o ticket 02 está fechado, mas três dos oito eventos não têm quem os chame.
- 2026-11-02: o dono do produto escolheu a Aderência gravada; Fit e Não fit saíram para o ticket 08.

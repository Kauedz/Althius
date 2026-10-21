# Primeira Sequência de e-mail proposta pelo Rhetor na Conversa

Status: ready-for-agent (tickets 01 e 02, depois do merge do PR #227); o 03 é do Renan

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical C. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).
Leia antes: [cadencia-descadastro-e-variaveis](https://github.com/Kauedz/Althius/pull/227) (PR #227), [ADR-0009](../../docs/adr/0009-responsabilidade-comercial-exclusiva-por-conta-alvo.md), [ADR-0014](../../docs/adr/0014-passo-confirmado-guarda-o-destino.md), [ADR-0002](../../docs/adr/0002-permissoes-ler-propor-executar.md).

## Problem Statement

A primeira Cadência de e-mail sai na semana de 2026-10-19. Em `main`, a Sequência só nasce à mão: o "nascimento da
Sequência na Conversa" com o Rhetor existe só na Demonstração (roteiro simulado). No Workspace operacional, nenhum
Agente tem ferramenta para propor uma Sequência; pedir "monte uma Sequência para a Alfa" ao Rhetor não produz nada que
vire Sequência. Descadastro, variáveis e criação em lote estão no PR #227/#230, fora de `main`.

## Solution

- O Rhetor, numa Conversa do Workspace operacional, propõe uma Sequência para uma Conta-alvo: Contatos, passos de
  E-mail com assunto e corpo usando as variáveis do PR #227, a partir da seção Cadência do Playbook.
- A proposta é uma Aprovação do Vendedor responsável pela Conta-alvo. Aprovar cria a Sequência sem Versão autorizada;
  os envios só começam quando ele clica "Ativar envios", como na Sequência criada à mão.
- A Conversa mostra a proposta e, depois de aprovada, o link para a Sequência.
- O Renan valida a primeira Cadência de e-mail de ponta a ponta.

## User Stories

1. Como Vendedor responsável, quero pedir ao Rhetor "monte uma Sequência para a Alfa" e receber uma proposta, para não montar passo a passo.
2. Como Vendedor responsável, quero que o Rhetor use a seção Cadência do Playbook, para a Sequência seguir o processo do Workspace.
3. Como Vendedor responsável, quero que a proposta use variáveis como `{{primeiro_nome}}` e `{{empresa}}`, para personalizar sem digitar.
4. Como Vendedor responsável, quero ver Contatos, passos, assunto e corpo antes de aprovar.
5. Como Vendedor responsável, quero aprovar e ver a Sequência criada, mas sem envio até eu ativar, para nada sair sem meu clique.
6. Como Vendedor responsável, quero recusar a proposta e pedir ajuste na mesma Conversa.
7. Como participante que não é o Vendedor responsável, quero que o Rhetor recuse propor Sequência para a Conta de outro (ADR-0009).
8. Como Vendedor responsável, quero que a proposta recuse Conta-alvo que já tem Sequência em andamento.
9. Como Vendedor responsável, quero que Contato suprimido (descadastrado) fique de fora da proposta.
10. ~~Como Administrador, quero que propor Sequência respeite a Permissão do Rhetor (Ler/Propor/Executar).~~ Recusada na revisão do PR #240 (21/10): a Sequência não passa por Integração, e a Permissão é por Integração. A proteção é só a Especialidade rhetor, quem pediu ser o Vendedor responsável, a Aprovação sempre pendente e só o responsável decidir.
11. Como Renan, quero mandar a primeira Cadência de e-mail para contatos reais e ver envio, resposta, Proposta de resposta e descadastro funcionando.

## Implementation Decisions

- Nova ferramenta dos Agentes `propor_sequencia` (escreve; sempre por Aprovação, mesmo com Permissão Executar), disponível para a Especialidade Rhetor.
- Entrada: Conta-alvo, Contatos, passos (canal E-mail, espera em dias, assunto, corpo). O servidor valida responsável, Sequência em andamento, Contatos da Conta, Supressão e variáveis conhecidas.
- O executor de Aprovações cria a Sequência pelo mesmo caminho da criação à mão/lote do PR #227, sem Versão autorizada.
- A Conversa operacional mostra a proposta a partir do evento da Execução (mesmo visual da Aprovação na Conversa, ADR-0022) e o link para a Sequência depois da decisão.
- Só E-mail nesta fatia; LinkedIn e WhatsApp ficam fora.

## Testing Decisions

- Deno: ferramenta `propor_sequencia` (recusas e proposta válida) — prior art `ferramentas-dos-agentes-envio-ao-crm.test.ts`, `ferramentas-dos-agentes-playbook.test.ts`.
- Deno: executor da Aprovação cria a Sequência sem Versão autorizada — prior art `executor-de-aprovacoes-ferramenta.test.ts`.
- pgTAP para a RPC nova, se houver.
- Vitest: Conversa operacional mostra a proposta e o link — prior art `paginas/conversas-reais.test.tsx`, `nascimento-sequencia-conversa.test.tsx`.

## Out of Scope

- Envio real, Executor e Unipile em produção (é a jornada mínima por e-mail do Nan e o `canais-cadencia-backend`).
- Criação em lote pela Conversa (o lote do PR #230 é pela lista de Contas).
- LinkedIn e WhatsApp.

## Further Notes

Reaproveitados, não recriar: PR #227 ([01–04](https://github.com/Kauedz/Althius/pull/227): descadastro, variáveis, lote, Propostas de resposta pelo Hermes), PR #230 (UI do lote), PR #228 (rótulo do status público), jornada mínima por e-mail (Nan, sem arquivo em `.scratch`), [canais-cadencia-backend/12](../canais-cadencia-backend/issues/12-validacao-completa-contas-reais.md), [crm-real-e-stack/17](../crm-real-e-stack/issues/17-vincular-sequencias-as-contas-reais.md).

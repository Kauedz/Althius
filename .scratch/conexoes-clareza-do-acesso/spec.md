# Conexões: deixar claro o que é o seu Acesso e o que é do Workspace

Status: ready-for-agent

Origem: [AUDITORIA-TOTAL-2026-10-17.md](../AUDITORIA-TOTAL-2026-10-17.md), vertical F. Fila: [FILA-EXECUCAO-2026-10-17.md](../FILA-EXECUCAO-2026-10-17.md).

## Problem Statement

O card do Notion em Conexões mostra "Você ainda não conectou" e, logo abaixo, "1 participante conectou". As duas frases
estão certas (a primeira é o seu Acesso à Integração; a segunda conta o Workspace), mas lidas juntas parecem contraditórias.

## Solution

O card separa as duas informações com rótulos: "Seu acesso: não conectado" e "No Workspace: 1 participante conectado".

## User Stories

1. Como participante, quero saber se eu conectei meu Acesso ao Notion, para saber se os Agentes podem usar a minha conta.
2. Como participante, quero saber quantos colegas conectaram, sem confundir com o meu Acesso.
3. Como Administrador, quero a mesma leitura para HubSpot, Apollo, Clay e as demais Integrações com Acesso por participante.

## Implementation Decisions

- Só texto e hierarquia no bloco de Acesso do card; a Fonte e os estados não mudam.

## Testing Decisions

- Vitest do bloco de Acesso nos três estados (não conectado, conectado, precisa reconectar) com 0, 1 e n participantes — prior art: testes de `paginas/conexoes*`.

## Out of Scope

- Catálogo amplo (PR #48, conexoes-funcionais/02), conectores novos (07, 10–13 do Nan), caixa de e-mail (o Renan conecta depois).

## Further Notes

Reaproveitados: [conexoes-funcionais/07](../conexoes-funcionais/issues/07-retirar-a-integracao-do-workspace.md), [10 Apollo](../conexoes-funcionais/issues/10-conectar-o-acesso-ao-apollo.md), [11 Clay](../conexoes-funcionais/issues/11-conectar-o-acesso-ao-clay.md), [12 Lusha](../conexoes-funcionais/issues/12-conectar-o-acesso-ao-lusha.md), [13 Meta Ads](../conexoes-funcionais/issues/13-conectar-o-acesso-ao-meta-ads.md) (Nan); [03 HubSpot](../conexoes-funcionais/issues/03-conectar-o-proprio-acesso-ao-hubspot.md) e [09 validação HubSpot](../conexoes-funcionais/issues/09-wizard-e-validacao-real-com-hubspot.md) (o Renan diz que HubSpot e Apollo conectaram e funcionam em 2026-10-16: pode marcar a validação dele).

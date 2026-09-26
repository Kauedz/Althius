# 25: Avaliar o Hermes Agent como motor dos Agentes

**What to build:** quando a fase de Agentes for priorizada, decidir se o Hermes Agent (Nous Research) executa os Agentes da Althius, com uma instância isolada por Workspace, e registrar a decisão num ADR.

**Blocked by:** None. Entra quando o CRM-13 (Persistir Agentes e permissões por integração) e o CRM-14 (Executar Conversas e Coordenação com estado recuperável) forem priorizados; fica fora do primeiro envio real.

**Status:** needs-triage

## Proposta

[Arquitetura multi-tenant do Hermes Agent](../propostas/hermes-multi-tenant-architecture.md), de Renan Zanato, vinda do Kauedz/Althius#11. É um rascunho não implementado:

- um Gateway único;
- um container ou microVM com o Hermes por Workspace;
- um proxy central de LLM com a única chave da conta de modelos;
- medição e cobrança por Cliente.

## Pontos a confrontar na triagem

- ADRs de Agentes: [0001](../../../docs/adr/0001-agentes-fixos-sem-criacao-pelo-cliente.md), [0004](../../../docs/adr/0004-coordenacao-sem-quinto-agente.md) e [0005](../../../docs/adr/0005-agentes-criados-a-partir-de-especialidades.md). O Hermes é um agente pessoal e genérico, enquanto a Althius tem Agentes padrão, Especialidades e Coordenação sem quinto agente.
- [ADR-0013](../../../docs/adr/0013-supabase-auto-hospedado-em-vps.md): quanto custa manter um container por Workspace ao lado do Supabase auto-hospedado.
- Permissões Ler, Propor e Executar e as Aprovações ([ADR-0002](../../../docs/adr/0002-permissoes-ler-propor-executar.md)): como o Hermes as respeitaria.

## Comments

- 2026-09-25: aberto a partir da Q8 da sabatina de prioridades. A proposta saiu de `docs/` para não ser lida como decisão; o PR #11 foi fechado apontando para cá.

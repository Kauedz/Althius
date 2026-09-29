# Spec: Fase 2 — Revenue

**Status:** needs-triage (só começa depois do primeiro cliente pagando e a prospecção rodando)

**Frente:** depois da prospecção. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisões: sabatina de 29/09/2026 (Q3, Q45 e seguintes).

## Problem Statement

A Althius é um Revenue OS de GTM: depois de marcar a reunião, o cliente ainda precisa vender, e as Contas sem Sinal
precisam de outras motions. Nada disso deve ser construído antes de a prospecção funcionar para um cliente real.

## Solution

Registrar desde já o que vem depois, para ninguém construir antes da hora nem contra estas decisões:

- **Vendas:** Oportunidades espelhadas do CRM do cliente, com a inteligência da Althius por cima; um kanban simples
  para quem não tem CRM, com as fases da seção Pipeline do Playbook. A venda continua no CRM.
- **Transcrições:** upload ou texto colado; nativas do Google Meet, Zoom e Teams; conectores Granola e Fireflies;
  sempre com aviso de gravação e consentimento (LGPD).
- **Inteligência da transcrição:** resumo, próximos passos, objeções contra o Manual de Objeções do Playbook, dores
  reais como proposta de mudança no Playbook (com Aprovação), follow-up pelo Rhetor e Sinal interno de risco.
- **Motions para Contas sem Sinal:** GEO e SEO (Oraculum; Search Console, Analytics, Semrush), inbound, PLG e públicos
  de anúncio (Meta, Google, LinkedIn Ads) com teto de gasto.

## User Stories

1. Como Closer, quero ver as minhas Oportunidades com o que a Althius sabe de cada Conta.
2. Como Closer, quero subir a transcrição de uma reunião e receber resumo, objeções e follow-up.
3. Como Administrador, quero que as dores reais das reuniões proponham mudanças no Playbook.
4. Como participante, quero trabalhar as Contas sem Sinal com GEO, SEO, inbound e anúncios.

## Implementation Decisions

- Tudo usa os contratos da fase 1: créditos, Permissões Ler/Propor/Executar, Aprovações, Playbook e Conexões pelo
  servidor MCP oficial. Nada de caminho paralelo.
- Transcrição sempre com aviso de consentimento; dado pessoal nunca vai para a inteligência coletiva.

## Testing Decisions

- A definir ao sair de needs-triage, no mesmo padrão das outras specs (pgTAP, Deno, frontend).

## Out of Scope

- Tudo isto, até o gatilho: primeiro cliente pagando e a prospecção rodando.

## Further Notes

- Tickets em `issues/`, todos needs-triage. Ao chegar a hora, uma sabatina curta com o Nan reordena e detalha.

# Spec: Conector Zoho CRM

**Status:** needs-info (URL para contas fora da Índia não confirmada)

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-crms.md). Substitui o ticket `conexoes-funcionais/16`.

## Problem Statement

A Zoho hospeda quatro servidores prontos, com registro dinâmico e revogação (confirmados ao vivo) e escopos listados, **mas só em `.zohomcp.in`** (data center da Índia). Não se sabe a URL equivalente em `.com`, que as contas brasileiras costumam usar.

## Escolha desta spec

O cartão continua **"Em breve"**, com o motivo, até uma conta de teste confirmar a URL do data center certo. Confirmada, ele segue o mecanismo genérico (registro dinâmico, portal fixo pela org Zoho e `writes = true`).

## Tickets

01 (humano) conta Zoho de teste: confirmar o data center e a URL do servidor MCP · 02 (depois do 01) perfil, portal fixo, migration, testes e cartão.

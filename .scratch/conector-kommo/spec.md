# Spec: Conector Kommo

**Status:** wontfix por agora ("Em breve")

**Frente:** Conexões funcionais. Fonte: [pesquisa de 19/10](../conexoes-funcionais/pesquisa-2026-10-19-crms.md). Substitui o ticket `conexoes-funcionais/19`.

## Problem Statement

O Kommo **não tem servidor MCP** (confirmado ao vivo). O token de longa duração é **só de administrador**, o que conflita com a regra de que cada participante conecta a própria conta (ADR-0017 e ADR-0021).

## Escolha desta spec

O cartão continua **"Em breve"**, com o motivo (`conector-google-ads/03`). Se o produto precisar do Kommo, ele entra pelo ADR de REST com OAuth ([`conector-linkedin-ads/02`](../conector-linkedin-ads/issues/02-adr-rest-com-oauth.md)), com um app OAuth da Althius no Kommo.

# 01: adr webhooks de saida

**What to build:** ADR dos webhooks de saída da Althius: eventos, formato, assinatura HMAC por Workspace (segredo no Vault), novas tentativas, registro de entregas, quem cadastra e o que de dado pessoal pode sair (LGPD). Não implementar antes da aprovação do usuário.

**Blocked by:** nenhum

**Status:** needs-info (ADR proposto; aguarda a aprovação do usuário)

## Comments

**20/10/2026 (agente).** Escrito como proposta em [`docs/adr/0030-webhooks-de-saida-assinados.md`](../../../docs/adr/0030-webhooks-de-saida-assinados.md): 4 eventos na primeira versão, HMAC-SHA256 com carimbo de tempo, nenhum dado pessoal por padrão, proteção contra SSRF, 8 tentativas em 24 horas, pausa automática do destino e só o Administrador cadastra. Nada foi implementado.

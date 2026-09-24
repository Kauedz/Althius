# 08: Aprovação simulada pós-documento

**What to build:** depois da sequência existir (fluxo da Conversa ou equivalente), o roteiro propõe uma Aprovação simulada no padrão já existente (ADR 0002 / Propor), mostrando Conta-alvo e sequência em jogo. Aprovar ou rejeitar não dispara envio a provedor externo.

**Blocked by:** 07 (Nascimento na Conversa — Rhetor e confirmação)

**Status:** closed

- [x] Após gravar a sequência, surge Aprovação pendente no padrão do app
- [x] A Aprovação identifica Conta-alvo e sequência
- [x] Aprovar ou rejeitar não chama Unipile nem envia mensagem real
- [x] Testes cobrem aparecer Aprovação e decidir sem side-effect externo

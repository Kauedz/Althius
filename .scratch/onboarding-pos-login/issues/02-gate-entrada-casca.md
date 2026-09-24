# 02: Gate de entrada na Casca

**What to build:** Implementar o gate de entrada da Casca: quando o onboarding na Fonte estiver incompleto, redirecionar para `/onboarding`; quando estiver completo, permitir a entrada normal sem forçar o onboarding novamente.

**Blocked by:** 01 (Protótipo completo do fluxo de onboarding)

**Status:** ready-for-agent

- [ ] Uma sessão com onboarding incompleto é redirecionada para `/onboarding` ao entrar na Casca.
- [ ] Uma sessão com onboarding completo entra na Casca sem redirecionamento obrigatório.
- [ ] O estado simulado da Fonte é a única referência usada pelo gate.
- [ ] O gate não adiciona Clerk, autenticação real nem IA.
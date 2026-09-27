# 02: Gate de entrada na Casca

**What to build:** Implementar o gate de entrada da Casca: quando o onboarding na Fonte estiver incompleto, redirecionar para `/onboarding`; quando estiver completo, permitir a entrada normal sem forçar o onboarding novamente.

**Blocked by:** 01 (Protótipo completo do fluxo de onboarding)

**Status:** closed

- [x] Uma sessão com onboarding incompleto é redirecionada para `/onboarding` ao entrar na Casca.
- [x] Uma sessão com onboarding completo entra na Casca sem redirecionamento obrigatório.
- [x] O estado simulado da Fonte é a única referência usada pelo gate.
- [x] O gate não adiciona Clerk, autenticação real nem IA.

## Comments

### 2026-09-24: implementação do gate

- **O que conta como incompleto:** a Casca exige o Day0 (`precisaDoOnboarding`: sem `concluido` e fora do checklist). Com o Day0 feito, o checklist pendente não prende a sessão: o próprio checklist leva à Casca (Abrir Sinais, próximos passos, "Ir para a home"), e as histórias 40, 54 e 72 pedem que dê para explorar a home antes de terminar. Depois de "Concluir onboarding", a entrada nunca força o onboarding de novo.
- **Enquanto a Fonte responde,** o gate abre a Casca como sempre e só redireciona quando o estado chega. Com a Fonte simulada isso dura menos de um quadro. Com uma Fonte remota, a navegação pode piscar para quem ainda não fez o Day0: vale trocar por um carregamento antes de ligar o backend.
- **Testes:** `renderizarApp` parte de uma sessão que já fez o onboarding (`jaConcluido` na Fonte simulada). Para abrir sem onboarding, use `jaConcluido: false`; em `onboarding.test.tsx` isso é `renderizarSemOnboarding`.
- **Para o ticket 03:** fechado o aviso de retorno de Sinais, nada na Casca leva de volta ao checklist pendente.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

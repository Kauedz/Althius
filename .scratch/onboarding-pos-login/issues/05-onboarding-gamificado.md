# 05: Onboarding gamificado até 100%

**What to build:** Transformar o progresso do onboarding numa medida única, em porcentagem: **"Onboarding n% completo"**. Ela soma marcos na ordem do Norte:

- Criador: Workspace, Site e logo, Mini-ICP e produto, Persona e Sinal de compra (5 marcos, 20% cada).
- Convidado: Workspace, Mini-ICP e produto, Persona e Sinal de compra (4 marcos, 25% cada). O convidado não informa o site.

O checklist mostra quanto do onboarding está completo, com um segmento por marco, o que já está feito e uma chamada para o próximo marco que falta. Ao chegar a 100%, o checklist comemora. Pular um item continua permitido, mas o item pulado não conta. Com o Day0 feito, a Casca mostra "Primeiros passos → Onboarding n%" até chegar a 100%, mesmo depois de "Concluir onboarding". O cálculo vem só do estado da Fonte de onboarding.

**Blocked by:** 03 (Reentrada e progresso do checklist)

**Status:** closed

- [x] O checklist mostra quanto do onboarding está completo, em porcentagem, com um segmento por marco do ramo e cada marco feito ou pendente.
- [x] Cada item concluído aumenta a porcentagem, e um item pulado não conta.
- [x] O checklist chama para o próximo marco que falta, na ordem do Norte.
- [x] Ao chegar a 100%, o checklist comemora o onboarding completo.
- [x] Com o Day0 feito, a Casca mostra o progresso e leva ao checklist enquanto ele está abaixo de 100%, mesmo depois de concluir o onboarding. A 100%, o atalho some.
- [x] A sessão simulada que já começa com o onboarding concluído (`jaConcluido`) está 100% completa e não mostra o atalho na Casca.

## Comments

### 2026-09-25: decisões do Renan

- Mecânica: uma barra única de porcentagem, com marcos e comemoração a 100%. Níveis que desbloqueiam e missões com pontos ficaram de fora.
- "Até preencher por completo": o progresso persiste até 100%. Pular continua permitido, e o item pulado segue pendente. "Concluir onboarding" não bloqueia nada.
- Nome: "onboarding", não "Norte". A primeira versão se chamava "Preparo do Norte". "Completo", e não "concluído", porque "Concluir onboarding" continua existindo e não significa 100%.
- Isto muda uma decisão do ticket 03: o atalho "Primeiros passos" da Casca sumia em "Concluir onboarding" e agora some só a 100%.

Nota de desenho: Workspace e Site e logo já estão feitos quando o checklist abre, porque o Day0 exige os dois. O criador chega ao checklist com 40% e o convidado com 25%. É intencional: começar com parte da barra preenchida motiva a terminar.

### 2026-09-25: implementação

- **Regra no domínio:** `progressoDoOnboarding(estado)` em `onboarding-tipos.ts` devolve os marcos do ramo, a porcentagem, o próximo marco e se o progresso está pendente. Substitui `progressoDoChecklist` e `checklistPendente`, e é a única fonte do painel do checklist e do atalho da Casca.
- **Checklist:** o painel "Onboarding completo" substitui o antigo "n de 3 concluídos". Mostra a porcentagem, um `progressbar` com um segmento por marco, a lista "Marcos do onboarding" (feito ou falta) e "Próximo: <marco>. <por que importa>". A 100%, a borda ganha destaque e aparece "Onboarding 100% completo" com animação curta. O `prefers-reduced-motion` global desliga a animação.
- **Casca:** "Primeiros passos → Onboarding n%" aparece enquanto `pendente`, com o Day0 feito e abaixo de 100%, independentemente de `concluido`.
- **`jaConcluido`:** a sessão simulada já concluída nasce com os três itens concluídos, para representar um Workspace com o onboarding completo.
- **Testes:** seis cenários novos em "Onboarding pós-login: progresso gamificado até 100%". Os dois testes do ticket 03 que liam "n de 3" e o sumiço do atalho em "Concluir onboarding" passam a ler a porcentagem e a persistência até 100%.
- **Fora deste ticket:** o título "Checklist do Norte" e a frase "A ordem do Norte" vêm do ticket 01 e ficaram como estão.

### 2026-09-25: revisão de código

- O marco e o item 3 passam a se chamar "Sinal", sem "de compra", pelo glossário. `progressoDoOnboarding` mudou para `regras-onboarding.ts`. As demais correções estão no comentário de 2026-09-25 do ticket 01.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

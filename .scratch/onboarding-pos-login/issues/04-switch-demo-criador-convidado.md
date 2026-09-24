# 04: Switch de demo criador ↔ convidado

**What to build:** Adicionar na Fonte uma forma simples de alternar entre os ramos de demo de criador e convidado, para smoke test, sem autenticação real.

**Blocked by:** 01 (Protótipo completo do fluxo de onboarding)

**Status:** ready-for-agent

- [x] É possível alternar de criador para convidado na experiência simulada.
- [x] É possível alternar de convidado para criador na experiência simulada.
- [x] A troca atualiza o caminho exibido sem exigir login real.
- [x] O switch fica restrito ao contexto de demo/smoke e não introduz autenticação real.

## Comments

### 2026-09-24: implementação do switch

- **Onde fica:** no cabeçalho do wizard, ao lado do selo Demonstração: "Ver como [Criador] [Convidado]", com o ramo atual marcado. Aparece em todos os passos, inclusive no checklist e depois de concluir. Não aparece na Casca: para trocar depois de aterrar em `/`, abra `/onboarding`.
- **Na Fonte:** `trocarRamoDaDemonstracao(ramo)` é uma operação opcional da `FonteDeOnboarding`. A Fonte simulada a oferece; uma Fonte real não vai oferecer, e sem ela o switch não aparece. É isso que restringe o switch à demonstração. Hoje "demonstração" é o protótipo inteiro (ADR 0003): o `main.tsx` usa a Fonte simulada, então todo visitante do protótipo vê o switch.
- **A troca recomeça do zero no outro ramo,** como uma entrada nova com ou sem link de convite. Sem login, token ou Participação no Workspace. O criador ganha de novo o Workspace dele, com o mesmo id e ainda sem nome, então nada duplica. O convidado fica sem Workspace, empresa, domínio ou leitura do site. Uma leitura do site que o criador deixou em andamento é descartada e não chega ao convidado. Manter as respostas geraria estados que a spec proíbe, como um convidado com Workspace ou com leitura.
- **Confirmação (história 64):** quando há algo a descartar (um papel já escolhido ou o onboarding concluído), a troca abre um diálogo avisando que recomeça do zero e descarta o que foi preenchido, com Cancelar e "Trocar e recomeçar". Sem nada preenchido, troca na hora. Trocar depois de concluir faz a Casca voltar a exigir o Day0 do novo ramo.
- **Endereço:** a troca acompanha a URL, com `?convite=demo` no convidado e sem o parâmetro no criador (via `replace`). Depois da troca, o ramo guardado na Fonte prevalece sobre a URL, pela mesma regra de `iniciar`: abrir `/onboarding` sem o parâmetro continua no convidado.
- **Testes:** seis cenários em `onboarding.test.tsx`: criador → convidado, convidado → criador, a leitura em andamento que não vaza, a confirmação e o cancelar, a troca guardada ao reabrir e a Fonte sem a troca. O último renderiza o `App` direto, porque o `renderizarApp` não aceita uma Fonte pronta.

# 01: Protótipo completo do fluxo de onboarding

**What to build:** Protótipo navegável de ponta a ponta em `/onboarding`, fora da Casca, cobrindo os ramos de criador e convidado. No Day0, exibir pills de função incluindo RevOps; pedir empresa apenas ao criador, sugerindo nome de Workspace/Cliente sem semear Contas; incluir a pergunta HDYHAU; permitir sempre pular o convite; criar automaticamente o Workspace do criador; oferecer checklist de 3 itens na Fonte, com campos curtos `miniIcp`, `oQueVende` e `porQueCompram`, stub de Persona e abertura de `/sinais` suficiente para concluir o item sem exigir Monitoramento; ao finalizar, levar para `/`. IA apenas para a leitura mínima do site, sempre através da Fonte (no protótipo, leitura simulada); usar uma única costura simulada de estado da Fonte.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Os dois caminhos, criador e convidado, são navegáveis de ponta a ponta.
- [x] A Fonte persiste o Day0 e o checklist de 3 itens.
- [x] O Workspace do criador recebe o nome sugerido a partir da empresa.
- [x] O convidado não precisa informar empresa.
- [x] O convite pode ser pulado em qualquer caminho aplicável.
- [x] Depois da conclusão, o fluxo leva para `/`.
- [x] A conclusão do item de sinais pode ocorrer ao abrir `/sinais`, sem exigir Monitoramento.
- [x] O protótipo não usa Clerk nem autenticação real.

## Comments

### 2026-09-24 — Revisão do mockup aprovado (Renan)

Ajustes obrigatórios antes de avançar para 02–04:

- [x] Remover a pergunta "vai criar Workspace ou foi convidado?". Sem link de convite, o usuário entra direto no fluxo normal (criador). O ramo de convidado só aparece quando o usuário chega por link de convite (no protótipo, simular pela URL, por exemplo um parâmetro de convite).
- [x] "Como nos conheceu" com canais de mercado: Google Ads, Meta Ads, Instagram, LinkedIn, YouTube, X, TikTok, Influenciador, Indicação, Evento, Podcast, Busca no Google, Outro.
- [x] Navegação do wizard mais clara: indicador de progresso, Voltar e Continuar consistentes em todos os passos, sem becos sem saída.
- [x] Novo passo de domínio do site no Day0 do criador. O domínio busca o logo (SVG ou favicon) do site e usa como logo do Workspace, com fallback para a inicial do nome.
- [x] Leitura inicial do site (IA via operação da Fonte; no protótipo, leitura simulada): o que vende, ICP provável e personas possíveis, considerando para quem ele vende. É só uma base editável e pré-preenche o item 1 do checklist (mini-ICP e lógica de produto) e o item 2 (Persona).
- [x] Depois da leitura, o onboarding guia para sinal de compra, depois Contas-alvo indicadas, depois criar a Cadência.

Nota: decisão atualizada em 2026-09-24. O onboarding passa a ter IA para a leitura mínima do site (ver spec). No protótipo a Fonte simulada devolve uma leitura fixa pela mesma interface que a IA real vai usar.

### 2026-09-24: trabalho sem commit no working tree (anotado pela sessão do ticket 02 de Configurações)

Encontrei em `projeto-althius-frontend/src/components/casca.tsx`, **sem commit**, a parte do item "logo do Workspace": a barra lateral lê o onboarding (`useFonteDeOnboarding`, `nomeSugerido`, `contextoDaIa`, `logoUrl`), mostra o `<Logo />` e troca a inicial do cliente pela logo. Os arquivos de onboarding também têm mudanças não commitadas (`onboarding.tsx`, `onboarding.test.tsx`, `onboarding-tipos.ts`, `simulada-onboarding.ts`).

Não mexi nem commitei nada disso. Atenção ao commitar: `casca.tsx` também tem o item "Configurações" e o menu "Meu perfil", do ticket 02 de Configurações, já commitados em `79b346f`. Faça `git diff HEAD -- projeto-althius-frontend/src/components/casca.tsx`: o que aparece é só deste ticket.
### 2026-09-25: correções da revisão de código (Standards e Spec)

A revisão dos tickets 01 a 04 contra a spec pediu os ajustes abaixo. Eles foram feitos por cima do ticket 05, ainda sem commit.

- **Persona e Memória do Workspace:** o aviso do item 2 dizia que as Personas ficavam na Memória do Workspace, e elas não ficam. Agora ele diz que é uma base do onboarding, que não muda as definições de Personas da Memória do Workspace. Essas definições só mudam por uma revisão do Ethos aprovada por um Administrador.
- **Personas como lista:** na Fonte, as Personas do checklist são uma lista, e não mais um texto com uma por linha. A tela continua editando uma por linha. A Fonte ainda lê o formato antigo guardado.
- **Voltar preserva o rascunho:** o que a pessoa escolhe ou digita num passo sem clicar Continuar fica num rascunho da tela e volta quando ela retorna ao passo. Nada disso vai para a Fonte antes de Continuar. A troca de ramo da demonstração descarta o rascunho.
- **Logo resolvido na Fonte:** a Fonte resolve o logo do domínio confirmado e guarda o endereço escolhido em `logoDoSite`. A ordem é o SVG, o favicon achado pelo Google e o favicon da raiz, e um bitmap de 16 px não vale. A prévia do passo do domínio vem de `buscarLogo`. A tela só mostra o endereço e cai para a inicial quando não há logo ou a imagem falha. Nos testes, a opção `resolverLogo` substitui o navegador.
- **Leitura do site:** `lerSite(dominio)` recebe o domínio e devolve a leitura, como a spec descreve. A regra de que as edições da pessoa prevalecem saiu da Fonte simulada para `aplicarLeitura`, em `regras-onboarding.ts`, para uma Fonte real usar a mesma.
- **Decisão: o botão "Tentar de novo" fica.** Ele aparece só na leitura com falha e repete a operação de leitura da Fonte. Os campos continuam vazios e editáveis, como a spec pede, e nada fica bloqueado.
- **Vocabulário:** a interface diz "Sinal" em vez de "Sinal de compra" e "Contas-alvo com Sinal" em vez de "Contas-alvo indicadas", como pedem a história 60 e o cenário 19. O método da Fonte voltou a se chamar `definirCliente`. O texto da spec ainda usa os termos antigos.
- **Organização:** as regras saíram de `onboarding-tipos.ts` para `regras-onboarding.ts`, com um mapa único por ramo. A página virou a pasta `paginas/onboarding/`, com um arquivo por motivo de mudança. Os testes que trocam uma Fonte usam `renderizarAppCom` em vez de montar o `App` à mão.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

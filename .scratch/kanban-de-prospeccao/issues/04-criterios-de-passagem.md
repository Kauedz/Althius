# 04: Critérios de passagem do Playbook no cartão

**What to build:** os critérios da seção SLA e metas do Playbook (ex.: 3 perfis mapeados e telefone válido para entrar em cadência) aparecem no cartão como pendências; mover sem cumprir avisa, não bloqueia, e o Agente oferece completar.

**Blocked by:** 03: Tela do kanban; `playbook-do-workspace` 01.

**Status:** ready-for-agent (aviso e pendência no cartão prontos; falta só a oferta de completar, que depende do Ethos)

## Pode mexer

- A leitura dos critérios e o aviso no cartão.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Mover sem critério mostra o aviso e deixa seguir.
- [ ] A oferta de completar chama o Ethos (quando existir).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Os critérios saem da seção SLA e metas: a linha cuja **Definição** é o nome de um Estágio ("Em abordagem", "Fit", "Reunião"...) traz o critério para a Conta entrar nele. Linhas de outras definições (Lead, SQL...) ficam de fora.
- O cartão mostra "Para <próximo Estágio>: <critério>". Mover para um Estágio com critério mostra um aviso (`role=status`) com o que o Playbook pede e deixa seguir.
- O critério é texto livre do Administrador: a tela o mostra, não o confere sozinha. Conferir por dados (nº de perfis, telefone válido) pede um critério estruturado, que o Playbook ainda não tem.
- Sem Playbook (ou sem a seção preenchida), o cartão segue como antes. A Demonstração ganhou um exemplo de SLA e metas com o critério de Em abordagem.
- Fica aberto o segundo critério (a oferta de completar chama o Ethos): o Ethos ainda não existe.

## Decisões a confirmar

- Casar o critério pela Definição igual ao nome do Estágio é uma escolha minha; se a planilha do setup usar outros nomes (Lead, SAL, SQL), o mapeamento muda.
- Arquivo fora do "Pode mexer" tocado: `simulada-playbook.ts` (só o exemplo da Demonstração) e `contas.tsx` (ler o Playbook para o kanban).

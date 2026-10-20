# 07: Retirar a Integração do Workspace

**What to build:** um Administrador retira uma Integração do Workspace depois de uma confirmação que avisa que todos os Acessos serão desconectados e que as Contas-alvo e os Contatos já sincronizados continuam. É também o caminho para trocar o portal HubSpot do Workspace: retirar e habilitar de novo.

**Blocked by:** 03 (Conectar e desconectar o próprio Acesso ao HubSpot).

**Status:** ready-for-agent (código e testes completos na branch local `conectores-em-construcao`; vira closed no merge)

- [x] Só um Administrador retira, inclusive por chamada direta ao backend.
- [x] A confirmação diz o efeito antes de retirar.
- [x] Retirar apaga os Acessos, as tentativas, o portal fixado e as Identidades externas da Integração no Workspace.
- [x] Nenhuma Conta-alvo, Contato, Vínculo ou Interação é apagado.
- [x] Habilitar de novo aceita o primeiro Acesso de qualquer portal.
- [x] pgTAP cobre o papel, o que é apagado e o que fica; os testes do app cobrem a confirmação e o estado depois.
- [x] Conferência visual no navegador da confirmação, com prints no `## Comments` deste ticket.

**19/10/2026 (agente, conferência com o código da `main`).** O ticket estava desatualizado. O que já existe:
- `public.disable_workspace_integration` (`20261001160000`) exige Administrador ativo (`require_integration_admin`). Apaga as tentativas, os Acessos (o gatilho apaga os segredos no Vault) e a linha da habilitação, e com ela o portal fixado.
- pgTAP: `conexoes_desabilitar_integracao.sql` cobre o Membro recusado, o Administrador inativo recusado, os Acessos e segredos que somem, a tentativa cancelada, a outra Integração que fica e o anônimo sem grant. `acessos_as_integracoes.sql` (item 61) cobre o "habilitar de novo aceita qualquer portal".
- A tela pede confirmação antes de desabilitar (`conexoes-reais.test.tsx`, "Administrador confirma antes de desabilitar e pode cancelar"); o print é o `31-confirmacao.jpg`.
- As Identidades externas não existem: a Sincronização (04 a 06) virou `wontfix`, então não há o que apagar.

Falta:
- Um pgTAP que prove que nenhuma Conta-alvo, Contato, Vínculo ou Interação é apagado. A função não toca nessas tabelas, mas nenhum teste afirma isso.
- Retirar não revoga os tokens no app. É o follow-up anotado em `conector-clay/issues/02`.

**20/10/2026 (agente).** Entrou o pgTAP que faltava, `supabase/tests/retirar_integracao_preserva_dados.sql` (6 asserções): depois de retirar o HubSpot, os Acessos e a habilitação somem, e a Conta-alvo, o Contato, o Vínculo e a Interação continuam. No PGlite, 6/6. Não houve mudança de código, porque `disable_workspace_integration` já não tocava nessas tabelas. Continua de fora a revogação no app ao retirar (follow-up anotado em `conector-clay/issues/02`).

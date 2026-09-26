# 07: Retirar a Integração do Workspace

**What to build:** um Administrador retira uma Integração do Workspace depois de uma confirmação que avisa que todos os Acessos serão desconectados e que as Contas-alvo e os Contatos já sincronizados continuam. É também o caminho para trocar o portal HubSpot do Workspace: retirar e habilitar de novo.

**Blocked by:** 03 (Conectar e desconectar o próprio Acesso ao HubSpot).

**Status:** ready-for-agent

- [ ] Só um Administrador retira, inclusive por chamada direta ao backend.
- [ ] A confirmação diz o efeito antes de retirar.
- [ ] Retirar apaga os Acessos, as tentativas, o portal fixado e as Identidades externas da Integração no Workspace.
- [ ] Nenhuma Conta-alvo, Contato, Vínculo ou Interação é apagado.
- [ ] Habilitar de novo aceita o primeiro Acesso de qualquer portal.
- [ ] pgTAP cobre o papel, o que é apagado e o que fica; os testes do app cobrem a confirmação e o estado depois.
- [ ] Conferência visual no navegador da confirmação, com prints no `## Comments` deste ticket.

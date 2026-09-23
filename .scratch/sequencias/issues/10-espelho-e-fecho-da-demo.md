# 10: Espelho e fecho da demo

**What to build:** as três superfícies (lista Workspace, bloco no detalhe da Conta-alvo, documento na Conversa) mostram a mesma sequência na mesma sessão. O roteiro demo (ex. Conta Quente com Sinal) fecha ponta a ponta com selo Demonstração, Contas reais e Contatos fictícios, sem fingir envio real. Testes de integração cobrem o espelho e o caminho feliz da spec; critérios de qualidade da spec ( Conta como unidade, pause visível, 1 Contato válido) passam numa revisão final.

**Blocked by:** 03 (Lista global de Sequências), 04 (Bloco Sequência no detalhe da Conta-alvo), 05 (Detalhe da sequência — documento e timeline), 06 (Composer de step por canal), 07 (Nascimento na Conversa — Rhetor e confirmação)

**Status:** ready-for-agent

- [ ] Editar numa superfície atualiza as outras na mesma sessão
- [ ] Roteiro demo completo navega lista ↔ Conta ↔ Conversa sem divergência
- [ ] Selo Demonstração permanece; nada finge envio real
- [ ] Suite de testes cobre espelho e caminho feliz account-first
- [ ] Revisão final: Conta como unidade, pause visível, Conta com 1 Contato ok, módulo convive com Contas e Agentes

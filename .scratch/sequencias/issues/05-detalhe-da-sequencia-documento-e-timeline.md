# 05: Detalhe da sequência (documento e timeline)

**What to build:** a tela de detalhe da sequência (e a leitura usada pela Conversa) mostra o documento vivo alinhado ao mock aprovado: Conta-alvo com link, status account-level, cobertura, participantes, steps ordenados em timeline simples, delay/janela por step ou herdados, regra de pause sempre visível. Editar o documento via fonte atualiza quem observa. Sem composer rico ainda (vem no 06); estrutura e leitura/edição básica dos steps bastam para demo do documento.

**Blocked by:** 01 (Mock do layout de Sequências), 02 (FonteDeSequencias e item Sequências na casca)

**Status:** closed

- [x] O detalhe mostra participantes, steps ordenados, delay/janela e regra de pause
- [x] O visual segue o mock aprovado (timeline simples, marca Althius)
- [x] Atualizar o documento reflete nos observadores da fonte na mesma sessão
- [x] Status Ativa / Pausada / Reunião / Esgotada aparece no detalhe
- [x] Testes cobrem leitura do documento completo e update básico de step/participantes

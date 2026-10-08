# 12: Validar a operação completa com contas reais

**What to build:** validar em ambiente real que dois vendedores isolados conseguem operar Sequências próprias por E-mail, WhatsApp e LinkedIn, que respostas pausam somente a Conta-alvo correspondente e que privacidade, falhas e atualização das telas respeitam a especificação. Registrar evidências suficientes para declarar a integração concluída sem alterar o design.

**Blocked by:** 10: Enviar anexos persistentes e privados; 11: Recuperar conexões e interromper acesso revogado.

**Status:** ready-for-human (todos os critérios pedem duas identidades reais e envio real; bloqueado pelos tickets 06 a 11 e pelos C1 e C3 da `prospeccao-funcional`)

- [ ] Dois usuários reais no mesmo Workspace conectam seus próprios canais e não conseguem usar, alterar ou aprovar recursos um do outro.
- [ ] Cada canal envia a um destino indicado pelo usuário, recebe resposta e atualiza lista, detalhe da Conta-alvo e Conversa de forma coerente.
- [ ] Uma resposta pausa todos os passos da empresa correspondente e não afeta a Sequência de outra Conta-alvo.
- [ ] Os demais participantes veem somente evento e status; testes diretos ao backend confirmam que corpos, anexos e propostas não vazam.
- [ ] Navegador fechado, evento repetido, mensagem própria, desconexão, falha da IA e saída do usuário produzem os estados previstos sem resultados falsos.
- [ ] Aprovação do titular gera um único envio da revisão correta e não retoma a Sequência.
- [ ] Evidências de validação registram horário, canal, resultado e limitações observadas sem armazenar credenciais ou conteúdo pessoal desnecessário.
- [ ] Verificações de segurança e desempenho do Supabase são executadas após as mudanças, e problemas aplicáveis são resolvidos ou documentados.
- [ ] A interface mantém tipografia, cores, componentes e layout existentes, com apenas os ajustes funcionais autorizados pela especificação.

## Dependências externas

- Destinos reais de E-mail, WhatsApp e LinkedIn indicados pelo usuário.
- Duas identidades autenticadas e Contas remetentes conectadas pelos respectivos titulares.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): nenhum dos 9 critérios foi feito, e todos pedem as duas identidades reais com Contas remetentes conectadas e destinos indicados pelo Nan. Depois da rodada humana, voltam para agente: o registro das evidências (critério 7), as verificações de segurança e desempenho do Supabase (critério 8, pelos advisors) e a conferência visual (critério 9). O critério 2 ("atualiza lista, detalhe da Conta-alvo e Conversa") depende do C3, que mostra ao titular as respostas de chat.

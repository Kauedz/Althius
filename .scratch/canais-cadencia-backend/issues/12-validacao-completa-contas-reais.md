# 12: Validar a operação completa com contas reais

**What to build:** validar em ambiente real que dois vendedores isolados conseguem operar Sequências próprias por E-mail, WhatsApp e LinkedIn, que respostas pausam somente a Conta-alvo correspondente e que privacidade, falhas e atualização das telas respeitam a especificação. Registrar evidências suficientes para declarar a integração concluída sem alterar o design.

**Blocked by:** 10: Enviar anexos persistentes e privados; 11: Recuperar conexões e interromper acesso revogado.

**Status:** ready-for-agent

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

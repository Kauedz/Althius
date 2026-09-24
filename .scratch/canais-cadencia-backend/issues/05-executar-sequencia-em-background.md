# 05: Executar a Sequência com o navegador fechado

**What to build:** executar os passos aprovados por meio de trabalho durável no backend, mesmo quando o navegador está fechado, respeitando ordem, dias úteis, janela, versão autorizada, pausa e retomada explícita. O executor nunca espera dias dentro de uma requisição nem usa o estado visual da demo como autorização.

**Blocked by:** 04: Primeiro ciclo real por E-mail.

**Status:** ready-for-agent

- [ ] Ativar a Sequência registra a versão autorizada e programa somente passos válidos, com destinos e Contas remetentes prontos.
- [ ] O executor calcula horários em `America/Sao_Paulo`, de segunda a sexta, sem calendário de feriados nesta entrega.
- [ ] Antes de cada envio, o backend revalida responsável, participação ativa, versão, pausa, janela, destino e conexão.
- [ ] Editar um passo pendente invalida a autorização da versão anterior e exige nova confirmação; passos enviados preservam seu histórico.
- [ ] Falha não avança o passo como enviado; tentativas têm reserva exclusiva, limite, motivo e próxima execução persistidos.
- [ ] E-mail manual exige ação explícita do titular e não vira envio automático.
- [ ] Retomar uma Sequência pausada reprograma os passos pendentes a partir da retomada, sem rajada de atrasados.
- [ ] Teste de integração comprova execução com o navegador fechado e bloqueio de novos envios depois de uma pausa persistida.


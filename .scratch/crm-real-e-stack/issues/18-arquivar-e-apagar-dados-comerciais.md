# 18: Arquivar e apagar Contas e Contatos com privacidade

**What to build:** participantes arquivam registros reversivelmente e usuários autorizados podem apagar definitivamente dados pessoais sem perder eventos comerciais desidentificados.

**Blocked by:** 05: Manter Contatos e Vínculos do Contato; 17: Vincular Sequências e responsabilidades às Contas reais.

**Status:** ready-for-agent

- [ ] Arquivar Conta/Contato remove da operação e busca padrão, preservando histórico e permitindo restauração autorizada.
- [ ] Arquivar Conta com Sequência ativa aplica pausa/cancelamento definidos no ticket de Sequências e mostra confirmação.
- [ ] Apagamento permanente remove PII de Conta/Contato, vínculos e dados privados relacionados; passos pendentes já são cancelados pelo domínio de Sequências.
- [ ] Eventos comerciais preservados ficam desidentificados, sem nome, e-mail, telefone, URL social ou payload que permita reidentificação.
- [ ] Operação exige permissão/confirmacão adequadas e audita ator, escopo e resultado sem copiar PII para o log.
- [ ] Tentativas concorrentes, retries e solicitações repetidas não restauram PII nem duplicam efeitos.


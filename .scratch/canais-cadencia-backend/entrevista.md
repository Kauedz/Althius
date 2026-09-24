# Canais de cadência funcionais

Status: regras de produto confirmadas pelo usuário; especificação técnica em revisão; implementação ainda não iniciada.

## Diretrizes confirmadas pelo usuário

- Tornar os canais de cadência funcionais como primeira entrega de backend.
- Preservar integralmente o design existente.
- Usar um provedor intermediário para comunicação, sem desenvolver integrações diretas com Meta ou provedores de e-mail.
- Provedor confirmado: Unipile.
- Caso haja persistência, usar Supabase.
- Destino Supabase confirmado posteriormente pelo usuário: projeto existente `ycbdilsmydvzezhlymty`, URL `https://ycbdilsmydvzezhlymty.supabase.co`. Essa escolha substitui a solicitação de criar um projeto novo e descarta o projeto `Altius` encontrado anteriormente na conexão disponível.
- Primeira entrega: e-mail, LinkedIn e WhatsApp. SMS, ligação e tarefa ficam fora; o usuário pediu retirar essas opções.
- Operação completa: execução real das sequências, leitura de mensagens e atualização do aplicativo, não apenas conexão ao provedor.
- Usar a lógica já documentada em `.scratch/sequencias/spec.md` como base, sem rediscutir decisões resolvidas.
- Qualquer resposta pausa a Sequência inteira da Conta-alvo, mantendo a regra original.
- A IA interpreta e propõe respostas; nunca as envia sem Aprovação humana, mesmo que tenha Permissão Executar em outro contexto.
- Cada usuário conecta seu próprio E-mail, WhatsApp e LinkedIn. As Contas remetentes não são conexões coletivas do Workspace.
- Os registros comerciais da Sequência pertencem ao Workspace. Não criar uma caixa de entrada compartilhada de conversas pessoais.
- Não desenvolver dashboard do Workspace nesta entrega; o escopo é Sequências e integração de mensageria Unipile.
- Usar Contatos cadastrados com endereços reais; o usuário fornecerá os destinos de E-mail, WhatsApp e LinkedIn para os testes.
- Cada Sequência tem um único responsável e todos os passos usam exclusivamente as Contas remetentes desse usuário.
- Outro participante do mesmo Workspace não pode operar ou alterar a Sequência nem aprovar envios em nome do responsável. Não há exceção aprovada para Administradores.
- Somente o titular da Conta remetente aprova o envio de respostas propostas pela IA.
- Os demais participantes veem apenas eventos e status, como “Contato respondeu; sequência pausada”, sem o texto recebido nem o conteúdo da Proposta de resposta.
- Grafia corrigida pelo usuário: Kauê, com K.
- Uma Conta-alvo pertence exclusivamente a um vendedor no Workspace e tem no máximo uma Sequência, não uma por vendedor.
- A exclusividade evita disputa comercial e de comissão depois do trabalho de prospecção do responsável. Outro vendedor não pode assumir a Conta-alvo nem iniciar uma Sequência concorrente.
- A pausa afeta todos os passos e Contatos daquela Conta-alvo, sem afetar Sequências de outras empresas.
- Transferência por desligamento foi mencionada como exceção; reaproveitamento por inatividade, perda ou prazo de quatro meses foi retirado desta entrega. Não construir motor de comissões nem liberação automática de Contas-alvo.

## Leitura da especificação existente

- A unidade principal é a Conta-alvo, com no máximo uma Sequência e um ou mais Contatos participantes.
- Rhetor sugere os participantes; o humano confirma. O Comitê inteiro não entra automaticamente.
- Lista, detalhe da Conta-alvo e Conversa compartilham o mesmo documento vivo.
- Steps ordenados têm destinatário, canal, conteúdo, objetivo, delays em dias úteis e janela de horário.
- A especificação determina que qualquer resposta, positiva ou negativa, pausa a Sequência inteira da Conta-alvo para análise humana.
- A entrega anterior excluiu explicitamente envio real, Unipile, persistência e execução em background por se tratar do protótipo. A solicitação atual passa a incluir esses recursos.
- O ADR 0002 distingue Propor (aprovação humana) de Executar (ação autônoma). Para respostas aos Contatos nesta entrega, a decisão específica do usuário exige sempre Aprovação, sem envio autônomo pela IA.

## Fatos e limites

- A inspeção do código encontrou fonte simulada em memória e uma interface assíncrona `FonteDeSequencias`, sem executor real de envios, backend ou autenticação real.
- Sequências exibem E-mail, LinkedIn (convite, mensagem e InMail), WhatsApp, SMS, Ligação e Tarefa. Conexões com Agentes são um conceito distinto.
- Os Contatos simulados têm indicadores de disponibilidade de e-mail, telefone e LinkedIn, mas não os endereços reais necessários ao envio.
- A simulação de resposta registra uma Interação e pausa a sequência inteira da Conta-alvo; essa regra foi confirmada para a operação real.
- O ADR 0003 limita a simulação ao protótipo; esta iniciativa inicia a transição para operação real.
- O glossário distingue Canal (conversa com um Agente), Canal de abordagem (meio usado para prospectar um Contato) e Conta remetente (identidade pessoal usada no envio).
- A documentação da Unipile descreve envio, consulta e recebimento de mensagens por webhooks. As regras comerciais para atualizar a cadência precisam ser definidas na Althius.
- A documentação v2 da Unipile está marcada como beta; a versão de integração será definida após confirmar o provedor e o ambiente disponível.

## Unicidade confirmada

Manter uma Sequência por Conta-alvo no Workspace, com um responsável exclusivo. Exemplo aprovado: Renan é responsável pela Sequência da empresa X; Kauê pode acompanhar os eventos, mas não editar, assumir ou criar outra Sequência para X. Kauê pode ser responsável pela Sequência da empresa Y. Uma resposta pausa todos os passos para X sem afetar Y.

As decisões de produto desta entrevista estão consolidadas em `spec.md`. Não reabrir as regras acima durante a implementação.

## Próximas dependências operacionais

- Acesso de leitura ao projeto Supabase confirmado após reconexão: `ycbdilsmydvzezhlymty`, nome `Althius Backend`, região `sa-east-1`, estado `ACTIVE_HEALTHY`. A listagem do schema `public` retornou zero tabelas. Os erros anteriores de permissão e disponibilidade da ferramenta não se repetiram; nenhuma escrita remota foi testada ou realizada. Ainda é necessário identificar a instância Unipile e configurar credenciais apenas no ambiente seguro de backend.
- Receber os destinatários reais de teste prometidos pelo usuário.
- Definir o serviço de IA para interpretar respostas e preparar propostas, sem expandir para a implementação geral de todos os Agentes.
- A consulta inicial encontrou `Altius` (`xlwnaboizbglvborlxlt`) e projetos antigos de teste, mas nenhum deles é o destino escolhido. Nenhum projeto remoto foi criado ou alterado.

## Recomendações ainda não aprovadas

- Persistir conexões, envios, respostas e progresso no Supabase.
- Manter credenciais do provedor e execução de cadências no backend.
- Receber eventos do provedor e atualizar os dados consumidos pela interface existente.
- Não tratar conexão ao provedor como prova de que uma cadência já está funcional.

## Fontes

- https://developer.unipile.com/docs/getting-started
- https://developer.unipile.com/docs/hosted-auth
- https://developer.unipile.com/docs/new-messages-webhook
- https://developer.unipile.com/v2.0/docs/welcome
- https://supabase.com/docs/guides/database/overview

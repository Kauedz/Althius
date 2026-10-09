# Os contratos v1 e v2 da Unipile coexistem atrás de um adaptador, e a troca de conta mantém o histórico

Esta ADR emenda duas coisas e só elas. A [ADR-0015](./0015-conta-unipile-descartavel-durante-a-pre-producao.md) continua valendo inteira: há uma única conta Unipile ativa por vez, ela é descartável e a troca é por configuração, sem publicar código. Instagram continua fora, e não há caixa de entrada completa (`canais-cadencia-backend/spec.md`).

O motivo da emenda é prático. Os testes grátis da Unipile duram 7 dias, e há cinco contas de teste que o Nan vai trocando, uma de cada vez, quando a ativa expira. Algumas foram criadas na v1 e outras na v2. A v1 usa um endereço próprio por cliente (DSN) e outros formatos de pedido e de webhook; a v2 usa `api.unipile.com`. Enquanto o código só fala a v2, uma conta v1 não serve para nada.

## O que muda

**1. A linha 40 da spec de canais.** Hoje ela diz: "A base é a v2 [...]. Não misturar contratos das duas versões." Passa a valer: os contratos v1 e v2 coexistem atrás de um único adaptador, e **só um está ativo por vez**, o da versão da conexão ativa. A conexão ativa é uma configuração (endereço, versão, chave de API e segredo do webhook), lida em tempo de execução, nunca escrita no código. "Não misturar" continua valendo dentro de cada chamada: nenhum pedido é traduzido de uma versão para a outra, e quem chama só enxerga a interface do adaptador. A v2 continua sendo o padrão e a única versão com campos já escritos no código; os campos da v1 vêm do protótipo e entram como "não confirmado" até o primeiro envio real.

Os contratos (configuração, pedidos, respostas e eventos de webhook) passam a ser validados com Zod, numa versão fixada, só no módulo novo da Unipile. O resto do repositório não ganha a dependência.

**2. A troca de conta mantém o histórico.** A ADR-0015 já marca todas as Contas remetentes como `reconnect_required` na troca e garante que nada é apagado. O que faltava é o que acontece **depois**: `complete_sender_connection_attempt` só aceita reconexão se o `unipile_account_id` for o mesmo (`identity_mismatch`), e numa conta Unipile nova o id é outro. A pessoa acabava com uma Conta remetente nova, e o histórico ficava preso à antiga.

A Conta remetente é da Althius e o `unipile_account_id` é um dado externo que se troca. Passa a valer: quando a pessoa reconecta o canal depois de uma troca de conta ativa, a **mesma** linha da Conta remetente recebe o id novo e a conexão nova, e os Envios, as respostas, as Interações e o estado de reconciliação continuam ligados a ela. O `identity_mismatch` continua protegendo todos os outros casos. Só vale quando a tentativa é uma reconexão daquela linha, pelo mesmo dono, no mesmo canal e provedor, e a linha pertence a uma conexão que já não é a ativa. Uma reconexão dentro da conexão ativa com id diferente continua recusada.

Consequência para a leitura de volta: ids de chat, de mensagem e de e-mail gravados antes da troca pertencem à conta anterior e não existem mais na nova. A reconciliação e a conferência só olham Envios da conexão ativa. O conteúdo já foi gravado no Supabase (ADR-0015), então nada depende de reler a Unipile.

## O que não muda

- Uma conta Unipile ativa por vez, global. Não há registro de várias contas simultâneas nem webhook por conta: o webhook único confere a assinatura com o segredo da conexão ativa.
- Segredos fora do código e do navegador. A chave e o segredo do webhook ficam no Supabase Vault, e quem cadastra ou troca é o Nan, pelo wizard, nunca pelo chat.
- `ORDEM-BUILD-FUNCIONAL.md`, linha 87 ("A Unipile é uma só: mesma conta e mesma `UNIPILE_API_KEY`"): continua verdadeira quanto a ser uma só. Só a menção à variável `UNIPILE_API_KEY` deixa de descrever onde a chave mora, e o ticket canais-16 atualiza essa frase quando os segredos saírem das variáveis.

Os tickets desta emenda são `canais-14` a `canais-17`, em `.scratch/canais-cadencia-backend/issues/`.

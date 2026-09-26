# A Sincronização do HubSpot só lê, e o Vendedor responsável vem do owner

A Integração com o HubSpot traz Companies, Contacts e suas associações para dentro do Workspace como Contas-alvo, Contatos e Vínculos do Contato. Decidimos que essa Sincronização é de uma direção só, HubSpot → Althius: escrever no HubSpot é ação de um Agente, sujeita à Permissão Ler, Propor ou Executar ([ADR-0002](./0002-permissoes-ler-propor-executar.md)), e não um efeito colateral da conexão. Engagements do HubSpot não viram Interações neste corte.

A correspondência segue as regras que já valem para o cadastro manual: a Company precisa de `website` ou `domain` para virar Conta-alvo (a URL canônica é a chave), e o Contact precisa de e-mail, telefone ou LinkedIn e de uma Company sincronizada. Quem não cumpre isso é ignorado e contado. A Identidade externa (o id do objeto no HubSpot) fica numa relação à parte, e não em coluna das tabelas de domínio, para que trocar de CRM ou reconectar outro portal nunca mexa no dado comercial.

Numa Conta-alvo nova, o Vendedor responsável é o HubSpot owner da Company quando o e-mail dele é de um participante ativo do Workspace; senão, é o Administrador que conectou o HubSpot. Numa Conta-alvo que já existe, a Sincronização atualiza os dados mas nunca muda o responsável ([ADR-0009](./0009-responsabilidade-comercial-exclusiva-por-conta-alvo.md)). Por isso a Sincronização grava por uma função própria, em nome do sistema, e não pelas RPCs que conferem se quem chama é o responsável.

Em conflito, o valor do HubSpot prevalece nos campos mapeados, mas um valor vazio no HubSpot nunca apaga o que a Althius tem. Uma mudança de e-mail atualiza o Contato e deixa intocado o Destino de um passo de Sequência já confirmado ([ADR-0014](./0014-passo-confirmado-guarda-o-destino.md)).

## Considered Options

- **Sincronização bidirecional desde o início.** Descartada: escrever no CRM do Cliente sem Aprovação contraria a ADR-0002, e a Althius ainda não tem dado próprio que valha a pena espelhar.
- **Responsável sempre o Administrador que conectou.** Descartado: um portal inteiro cairia no colo de uma pessoa, e a transferência depois seria manual.
- **Mesclar campo a campo pela data de modificação.** Descartado: difícil de explicar e de auditar; a regra "HubSpot prevalece, vazio não apaga" cobre o caso comum.

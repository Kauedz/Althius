# Passo confirmado guarda o Destino do envio

Os dados do Contato são do Workspace e mudam por várias fontes: o Administrador edita qualquer Contato, um Membro edita os Contatos das Contas-alvo sob sua responsabilidade, e a importação por CSV e o enriquecimento atualizam Destinos. A Sequência, porém, é do Vendedor responsável ([ADR-0009](./0009-responsabilidade-comercial-exclusiva-por-conta-alvo.md)) e envia pelas Contas remetentes dele ([ADR-0008](./0008-contas-remetentes-pessoais-e-interacoes-do-workspace.md)). Se o envio lesse o Destino atual do Contato, qualquer uma dessas fontes redirecionaria a abordagem de outro vendedor sem que ele soubesse.

Por isso, ao confirmar um passo, o Vendedor responsável fixa o Destino usado no envio. Na hora de enviar, se o Destino atual do Contato for diferente do confirmado, o passo não sai e aguarda a reconfirmação do Vendedor responsável, sem ir nem para o Destino antigo nem para o novo. A edição de Contatos continua aberta a quem tem permissão.

## Considered Options

- **Ler o Destino do Contato na hora do envio.** É o comportamento que o canais-02 deixou. É o mais simples, mas permite o redirecionamento silencioso descrito acima.
- **Só o Vendedor responsável muda o Destino de um Contato usado por Sequência ativa.** Bloquearia o Administrador, a importação e o enriquecimento. Também não resolve o Contato vinculado a Contas-alvo de vendedores diferentes.

# Catálogo só com os Sinais que funcionam

**Origem:** pedido de 20/10/2026. A Althius é um Revenue OS de prospecção B2B. Não é um CRM.

## Problema

No Workspace operacional o cliente vê os 26 cards de `CATALOGO_VISIVEL`, inclusive os que ainda não rodam. Os dois sem
coletor (Anunciando no Google e Publicações da empresa) caem em Lançamentos, com Avise-me. Os outros indisponíveis
aparecem nas prateleiras como se rodassem.

## O que muda

Só o que a tela mostra. Nenhum Sinal, actor ou cascata muda de estado, e `CATALOGO_VISIVEL` continua com os 26 cards.

1. **Regra de funcional:** um card do catálogo é funcional quando ao menos um dos seus `coletores` está `available` no
   que `list_signal_actors` e `list_signal_catalog` devolvem (o melhor estado entre actor, cascata e cascatas que atendem
   o tipo genérico). Card sem coletor nunca é funcional. A lista não fica no código: o coletor promovido faz o card
   aparecer sozinho.
2. **Cliente, no Workspace operacional:** busca, filtro de família, todas as prateleiras, o Sinal da semana e a grade usam
   só os cards funcionais. Lançamentos some quando fica vazia (o normal para o cliente). `/sinais/tipos/:id` de um card
   não funcional volta para `/sinais`.
3. **Monitoramento já criado num card que deixou de ser funcional:** o card continua visível para aquele Workspace, com o
   selo de disponibilidade ("Em teste" ou "Em breve"), e o Monitoramento continua em Meus Sinais. Nada é apagado nem
   pausado. A página não oferece "Ativar Monitoramento" e o formulário de um Monitoramento novo volta para a página.
4. **Equipe Althius:** vê os 26 cards, como hoje. Os não funcionais levam o selo de disponibilidade e o selo "Interno".
   Quem é da equipe sai de `public.viewer_is_althius_staff()`, lida uma vez pela Fonte; qualquer erro vale `false`.
5. **Exclusivos do Workspace:** a mesma regra, pelos coletores. Os pedidos "em produção" continuam como estão.
6. **Falha ao ler os estados:** a página mostra "Não foi possível carregar os sinais." com "Tentar de novo". Nunca mostra
   o catálogo inteiro nem um catálogo vazio sem explicação.
7. **Demonstração:** não muda. A Fonte simulada dá todo coletor por disponível e ninguém como equipe.

## Decisões

- **Pela leitura de produção de 20/10:** o cliente vê 15 cards e não vê 11 (lista no PR).
- **Selo do card mantido por Monitoramento:** o estado real do melhor coletor ("Em teste" quando algum está em teste,
  senão "Em breve"), pelo `SeloDaDisponibilidade` que já existe.
- **Falha parcial:** se só uma das duas leituras falhar, vale o que foi lido (os cards da outra somem para o cliente). Se
  as duas falharem, a página mostra o erro. Sem nenhuma leitura no carregamento, o módulo Sinais já fica indisponível
  pelo `sinaisDisponiveis`, como antes.
- **Equipe e Monitoramento novo:** a equipe vê o card interno, mas também não cria Monitoramento nele: o banco recusa
  tipo não disponível.
- **Ferramenta `buscar_sinais` dos Agentes:** já recusa tipo fora de `disponivel`. Não muda.

## Fora de escopo

O "Em breve" dos Canais e Integrações, as telas de Conexões, `signal-runner`, `signal-scan`, `signal-cascade`, o registro
de actors e cascatas, rotas, menu lateral, layout e ordem das prateleiras.

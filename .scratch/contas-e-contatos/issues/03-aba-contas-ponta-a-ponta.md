# 03: Aba Contas: primeira fatia de ponta a ponta

**What to build:** o usuário encontra "Contas e Contatos" na sidebar, acima de Agentes. Ao clicar, abre a aba Contas com o título "Contas", a descrição "Empresas do seu mercado organizadas pelo momento de abordagem", a contagem "N contas" e uma tabela com as seis colunas em texto simples: Empresa, Aderência, Contatos, Último sinal, Segmento e Último contato. A ordem é a Prioridade.

Por trás da tela:

- Nasce a `FonteDeContas`, só de leitura, com as operações e os campos da spec: Conta-alvo, Contato, Sinal e Interação, com as datas como instantes absolutos.
- Nasce a sua implementação simulada, com as opções invisíveis da fábrica: atraso, data de "hoje", falha e lista vazia.
- O App recebe a fonte como segunda dependência, com o seu provedor.
- O utilitário de renderização dos testes monta as duas fontes e aceita as opções só de teste.
- Os dados deste ticket são um conjunto inicial pequeno, com pelo menos uma Conta-alvo de cada Aderência, uma não avaliada e alguns dados ausentes. O conjunto completo vem no ticket 04.

As datas seguem a regra única do módulo:

- até 30 dias: "Hoje", "Ontem", "há N dias", "há N semanas";
- depois disso: a data explícita, "12 mar." no mesmo ano e "12 mar. 2025" em outro ano;
- a data completa aparece no tooltip e no nome acessível;
- no Último contato, a data relativa começa com maiúscula ("Há 5 dias"). Depois do "·" do Último sinal, fica em minúscula.

**Blocked by:** 02 (Preparação: carregamento genérico e abas compartilhadas)

**Status:** closed

- [x] O item "Contas e Contatos" aparece na seção Workspace da sidebar, acima de Agentes, com um ícone Lucide coerente, e abre a aba Contas
- [x] A página inicial continua sendo a grade de Agentes
- [x] A aba Contas mostra o título, a descrição, a contagem "N contas" e a tabela com as seis colunas nessa ordem
- [x] A ordem padrão é a Prioridade: Quente, Fit, Não fit e não avaliada. Dentro de cada grupo, o Sinal mais recente vem primeiro, as contas sem Sinal vão para o fim e o empate é desfeito pelo nome
- [x] Último sinal mostra "frase · data relativa" ou "Nenhum sinal"; Último contato mostra a data ou "Nunca"
- [x] As datas relativas e explícitas saem como decidido, a partir da data fixa de "hoje" nos testes
- [x] Enquanto carrega, aparece o pulso do app
- [x] Com a fonte vazia, aparece "Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas.", sem botão e sem pedido de configuração
- [x] Com a fonte em falha, aparece uma mensagem de erro curta com "Tentar de novo", e o botão dispara uma nova leitura
- [x] O selo "Demonstração" continua visível

## Comments

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

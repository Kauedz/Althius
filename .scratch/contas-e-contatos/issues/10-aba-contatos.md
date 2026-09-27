# 10: Aba Contatos

**What to build:** o módulo ganha as abas sublinhadas Contas e Contatos, no padrão da página do Agente. Cada aba tem o seu endereço, e o item da sidebar fica ativo nas duas.

A aba Contatos mostra as pessoas de todas as Contas-alvo, numa tabela no mesmo sistema visual da tabela de Contas. As colunas são Nome, Cargo, Empresa, Área, Persona, Dados de contato e Último contato:

- **Cargo, Área e Persona:** o texto que a fonte entrega, ou "—".
- **Dados de contato:** três ícones Lucide (e-mail, telefone e LinkedIn). O canal disponível aparece normal e o ausente, apagado. Cada ícone tem um nome acessível com o estado ("E-mail disponível", "Telefone não disponível"). Não há valores nem links.
- **Último contato:** a data ou "Nunca".

A ordem é fixa: Aderência da empresa (na ordem de grupos da Prioridade), depois o nome da empresa e depois o nome da pessoa. A linha não é clicável e não há página de Contato. O link da empresa para a Conta-alvo entra no ticket 12.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** closed

- [x] As abas Contas e Contatos aparecem no padrão sublinhado, cada uma com o seu endereço, e Contas é a aberta por padrão
- [x] O item da sidebar fica ativo nas duas abas
- [x] A aba Contatos mostra as sete colunas nessa ordem
- [x] As ausências aparecem como "—" em Cargo, Área e Persona e como "Nunca" em Último contato
- [x] Cada ícone de canal tem o nome acessível com o estado de disponibilidade
- [x] A ordem padrão é a Aderência da empresa, o nome da empresa e o nome da pessoa
- [x] A aba tem os mesmos estados de carregamento, lista vazia e erro com "Tentar de novo" da aba Contas
- [x] O visual segue o mock aprovado

## Comments

- As abas já existiam na aba Contas, mas `/contatos` não tinha rota e caía na grade de Agentes. A rota nova abre a aba Contatos, e o item da sidebar já ficava ativo em `/contatos`.
- O que as duas abas compartilham saiu de `contas.tsx` para `paginas/modulo-contas-e-contatos.tsx` (abas, classes da tabela, avatar, Último contato e a falha com "Tentar de novo") e `paginas/ordem-da-aderencia.ts` (a ordem de grupos da Prioridade). A aba Contas não mudou de comportamento.
- Contatos e contas vêm num carregamento só, porque a empresa dá o nome e a Aderência de cada linha. Um Contato sem a sua Conta-alvo na fonte fica com "—" em Empresa e vai para o fim.
- O Lucide não tem mais ícones de marca: o LinkedIn usa o desenho do antigo ícone "linkedin" do Lucide, no mesmo traço do e-mail e do telefone. O canal ausente usa a cor apagada com opacidade, como no mock; o app não tem o token `ink-faint` do mock.
- O título, a descrição e a contagem "N contatos" seguem o mock. A mensagem de lista vazia ("Nenhum Contato ainda. As pessoas aparecem aqui quando vierem do CRM, de enriquecimento ou de um Agente.") não tem texto no spec: vale confirmar.
- "O visual segue o mock aprovado" foi conferido e aprovado pelo usuário, com o app e o mock abertos lado a lado.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

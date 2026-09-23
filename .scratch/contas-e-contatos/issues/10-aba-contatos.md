# 10: Aba Contatos

**What to build:** o módulo ganha as abas sublinhadas Contas e Contatos, no padrão da página do Agente. Cada aba tem o seu endereço, e o item da sidebar fica ativo nas duas.

A aba Contatos mostra as pessoas de todas as Contas-alvo, numa tabela no mesmo sistema visual da tabela de Contas. As colunas são Nome, Cargo, Empresa, Área, Persona, Dados de contato e Último contato:

- **Cargo, Área e Persona:** o texto que a fonte entrega, ou "—".
- **Dados de contato:** três ícones Lucide (e-mail, telefone e LinkedIn). O canal disponível aparece normal e o ausente, apagado. Cada ícone tem um nome acessível com o estado ("E-mail disponível", "Telefone não disponível"). Não há valores nem links.
- **Último contato:** a data ou "Nunca".

A ordem é fixa: Aderência da empresa (na ordem de grupos da Prioridade), depois o nome da empresa e depois o nome da pessoa. A linha não é clicável e não há página de Contato. O link da empresa para a Conta-alvo entra no ticket 12.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** ready-for-agent

- [ ] As abas Contas e Contatos aparecem no padrão sublinhado, cada uma com o seu endereço, e Contas é a aberta por padrão
- [ ] O item da sidebar fica ativo nas duas abas
- [ ] A aba Contatos mostra as sete colunas nessa ordem
- [ ] As ausências aparecem como "—" em Cargo, Área e Persona e como "Nunca" em Último contato
- [ ] Cada ícone de canal tem o nome acessível com o estado de disponibilidade
- [ ] A ordem padrão é a Aderência da empresa, o nome da empresa e o nome da pessoa
- [ ] A aba tem os mesmos estados de carregamento, lista vazia e erro com "Tentar de novo" da aba Contas
- [ ] O visual segue o mock aprovado

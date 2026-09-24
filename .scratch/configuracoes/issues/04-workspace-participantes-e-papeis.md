# 04: Workspace, participantes e papéis de acesso

**What to build:** Permitir consultar o Workspace e administrar participantes com os papéis Administrador e Membro, mantendo a identidade das pessoas independente de seus vínculos.

**Blocked by:** 02: Configurações, perfil e tema persistentes

**Status:** ready-for-agent

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 15–22.

## Acceptance criteria

- [ ] Consultar informações gerais e participantes do Workspace; Administradores podem administrar essas informações, Membros somente consultar.
- [ ] Separar Conta de usuário, Workspace e Participação no Workspace na fonte compartilhada; o papel pertence à participação.
- [ ] Disponibilizar convite demonstrativo com papel definido e estado pendente, sem alegar envio de e-mail real ou contar convite como participante ativo.
- [ ] Permitir a Administradores alternar entre Administrador e Membro, sem introduzir outro papel ou matriz individualizada.
- [ ] Apresentar “Remover do Workspace” com explicação de que a Conta de usuário será mantida.
- [ ] Remover encerra somente acesso e vínculo naquele Workspace; preserva identidade e outros vínculos, sem excluir conta, mudar plano ou criar Workspace.
- [ ] Impedir remoção ou rebaixamento do último Administrador tanto pela interface quanto pela operação pública da fonte.
- [ ] Validar a participação e o papel atual nas operações administrativas; Membros não conseguem executá-las mesmo sem passar pelos botões.
- [ ] Persistir estado demonstrativo do Workspace e refletir participantes/papéis em seus consumidores, sem cópias divergentes.
- [ ] Permitir selecionar identidade/papel na preparação de testes, sem criar um seletor de privilégios na interface do produto.
- [ ] Testar consulta como Membro, convite, mudança de papel, remoção com outro vínculo preservado e proteção do último Administrador, pelo aplicativo e pelo contrato público quando necessário.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.


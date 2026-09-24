# 01: Acesso real e responsabilidade exclusiva

**What to build:** permitir que um usuário autenticado e com participação ativa no Workspace crie e opere a única Sequência de uma Conta-alvo como seu Vendedor responsável. A entrega percorre persistência, autorização e interface existente para impedir que outro participante, inclusive Administrador, altere ou crie uma Sequência concorrente.

**Blocked by:** None (can start immediately).

**Status:** in-progress

- [x] A camada de dados exige identidade via `auth.uid()` e participação ativa para as RPCs de criação, edição e leitura privada. A interface ainda não foi integrada a Supabase Auth.
- [x] A RPC cria a responsabilidade e a Sequência na mesma transação, com unicidade por Workspace e Conta-alvo.
- [x] A unicidade da propriedade e da Sequência resolve criações concorrentes para um único vencedor; outro usuário não pode tomar a responsabilidade.
- [x] Apenas o responsável ativo pode atualizar status/documento via RPC; edição direta é revogada.
- [x] Participantes ativos consultam a projeção pública; o documento fica em tabela privada e outro Workspace não vê a projeção.
- [x] A responsabilidade é imutável e registros de Sequência não podem ser apagados pelo fluxo público.
- [x] Testes pgTAP cobrem responsável, outro Membro, Administrador e usuário de outro Workspace (`supabase/tests/responsabilidade_exclusiva.sql`); 12/12 passaram no projeto Supabase confirmado, em transação revertida. A migração não foi aplicada ao banco remoto.

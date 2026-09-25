# 01: Acesso real e responsabilidade exclusiva

**What to build:** permitir que um usuário autenticado e com participação ativa no Workspace crie e opere a única Sequência de uma Conta-alvo como seu Vendedor responsável. A entrega percorre persistência, autorização e interface existente para impedir que outro participante, inclusive Administrador, altere ou crie uma Sequência concorrente.

**Blocked by:** None (can start immediately).

**Status:** in-progress

- [x] A camada de dados exige identidade via `auth.uid()` e participação ativa para as RPCs de criação, edição e leitura privada; a interface usa Supabase Auth e bloqueia usuários sem participação ativa.
- [x] A RPC cria a responsabilidade e a Sequência na mesma transação, com unicidade por Workspace e Conta-alvo.
- [x] A unicidade da propriedade e da Sequência resolve criações concorrentes para um único vencedor; outro usuário não pode tomar a responsabilidade.
- [x] Apenas o responsável ativo pode atualizar status/documento via RPC; edição direta é revogada.
- [x] Participantes ativos consultam a projeção pública; o documento fica em tabela privada e outro Workspace não vê a projeção.
- [x] A responsabilidade é imutável e registros de Sequência não podem ser apagados pelo fluxo público.
- [x] Testes pgTAP cobrem responsável, outro Membro, Administrador e usuário de outro Workspace (`supabase/tests/responsabilidade_exclusiva.sql`); 12/12 passaram anteriormente em transação revertida. A migração de acesso foi aplicada no projeto `ycbdilsmydvzezhlymty` e conferida no histórico remoto.

## Implementação local

- Acesso por link de e-mail Supabase Auth para usuários existentes, sem auto-cadastro nem autoassociação a Workspace.
- A inicialização consulta apenas participações ativas do usuário; nenhuma participação bloqueia o app. Seleção de Workspace fica limitada às participações retornadas por RLS.
- `FonteDeSequencias` usa as RPCs existentes para gravar e ler conteúdo privado e consulta diretamente apenas a projeção pública permitida. A rota de detalhe de outro responsável mostra resumo somente leitura.
- O trigger limita a projeção compartilhada a status e contagens seguras; atualizações em Sequências entram na publicação Realtime quando disponível.
- A tabela de documentos privados tem política RLS de leitura pelo titular, além das permissões revogadas e do acesso via RPC.
- Índices cobrem chaves estrangeiras usadas nas verificações de membro/titular.
- No modo autenticado, ações simuladas de resposta/reunião e a criação baseada na lista local de Contas/Contatos ficam indisponíveis; habilitá-las depende da fonte real de Contas e Contatos, para não gravar IDs de demonstração no backend.
- Migrations aplicadas: `supabase/migrations/20260925130153_real_sequence_access.sql`, `supabase/migrations/20260925131144_sequence_document_owner_policy.sql` e `supabase/migrations/20260925131327_sequence_membership_fk_indexes.sql`.
- Para login operacional ainda é necessário permitir as origens do app em Auth Redirect URLs, convidar/criar as identidades no Auth, e provisionar cada linha de `workspace_memberships` por operação administrativa confiável. Não foi possível validar com uma conta real do produto nesta execução.

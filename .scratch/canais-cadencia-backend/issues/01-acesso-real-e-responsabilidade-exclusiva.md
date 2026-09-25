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

## Validação com contas reais (2026-09-25)

Ambiente preparado com `scripts/wizard-teste-real.sh` no projeto `ycbdilsmydvzezhlymty`: Redirect URL `http://localhost:5173/**`, SMTP próprio pelo Resend com `althius.com.br`, e cinco identidades reais. No Workspace A estão o Vendedor responsável e o Outro Membro, como Membros, e o Administrador. No Workspace B está o Membro de outro Workspace. A persona Sem Participação não tem linha em `workspace_memberships`. O Kauê entrou pelo link de acesso no navegador e caiu no Workspace operacional.

- `npm run teste:real`: 20/20 regras confirmadas pela API pública, com a sessão real de cada persona.
  - O Vendedor responsável cria a Sequência, lê o documento privado e a pausa pela RPC. Nem ele cria uma segunda Sequência na mesma Conta-alvo (23505).
  - Outro Membro e Administrador não criam Sequência concorrente nem alteram a existente (42501). Os dois leem a projeção só com status e contagens; um campo extra do resumo não chega a ela.
  - Duas criações simultâneas numa Conta-alvo nova tiveram um único vencedor.
  - Edição direta da tabela, exclusão e troca de responsável são recusadas, e o documento privado não sai pela API.
  - Membro de outro Workspace e Sem Participação não veem nem criam Sequência no Workspace A.
- Tela, com as sessões reais no Chromium: o Vendedor responsável abre o detalhe completo. Outro Membro e Administrador veem as duas Sequências na lista, e no detalhe só o resumo da Conta-alvo, com o aviso de que há outro Vendedor responsável. O Membro de outro Workspace vê a lista vazia, e a persona Sem Participação cai em "Nenhum Workspace ativo".

Pendências:

- O pgTAP `supabase/tests/responsabilidade_exclusiva.sql` precisa voltar a passar. Na `main`, ele já falhava 7/12 pela validação de canal de `validate_sequence_document`. No banco remoto, também esbarra na chave estrangeira de `workspace_memberships` para `workspaces`, que chega com o Auth-02.
- Realtime: o endpoint responde 101 por HTTP/1.1, mas o WebSocket do Chromium no ambiente de nuvem falhou no handshake (500). A atualização ao vivo ainda não foi vista num navegador comum.
- As Sequências de teste ficam no Workspace A, nas Contas-alvo com prefixo `teste-real-`. O fluxo público não as apaga, então o CRM-17 terá de removê-las por operação administrativa antes de ligar Sequência e Conta-alvo por chave estrangeira.

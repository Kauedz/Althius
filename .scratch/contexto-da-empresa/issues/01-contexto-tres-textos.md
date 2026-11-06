# 01: Contexto da empresa com os três textos, como no Clay

**What to build:** Consultar e editar Empresa, Perfil de cliente ideal e Personas em Configurações, com persistência real e versão vigente.

**Blocked by:** Nenhum (pode começar imediatamente).

**Status:** in-review (implementado; falta o PR passar no CI, aplicar a migration no remoto e fazer o merge)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] A tela segue o AI Context do Clay observado: site, ação de geração prevista, três grandes campos de texto e salvar; não inclui cards de ICP, filtros firmográficos ou outras seções. A geração será habilitada pelo ticket 02.
- [x] Primário e secundários ficam escritos no mesmo campo de ICP; personas ficam em seu próprio campo.
- [x] Administrador salva edições e a nova versão fica vigente imediatamente; participantes ativos apenas consultam. Permissões e isolamento entre Workspaces são impostos no servidor.
- [x] Existe contrato único para consultar os três textos e sua versão; não copiar conteúdo do Playbook.
- [x] Salvar concorrente não perde alterações silenciosamente; estado vazio e erros de gravação são visíveis.
- [x] Demonstração usa conteúdo simulado isolado do Workspace operacional.

## Pode mexer

Configurações de contexto, fontes de leitura/escrita, persistência aditiva, permissões e composição da Demonstração.

## Não mexa

Leitores operacionais do Playbook, onboarding, geração por IA, busca e Sequências.

## Validação

Testar leitura e salvamento completos, permissões, outro Workspace, versão e conflito de edição; conferir visualmente os três campos.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-06: implementado na branch `contexto-da-empresa-01-tres-textos`, junto com o ticket 02.
  - Banco: `20261221000000_contexto_da_empresa.sql` cria `private.company_context_versions` (os três textos juntos, uma versão por gravação, origem `manual` ou `geracao`) e as funções `get_company_context` (toda Participação ativa; traz o site do cadastro da empresa), `save_company_context` (só Administrador ativo; recebe a versão que a tela via e recusa com `40001` se outra gravação chegou antes; mesmo texto não cria versão) e `company_context_for_workspace` (só `service_role`: o contrato único para as Edge Functions). Nada é copiado do Playbook.
  - Frontend: Configurações → Contexto da empresa (`/configuracoes/contexto`), com o site, Gerar, os três textos grandes e Salvar; Membro só lê. Fonte própria (`supabase-contexto-da-empresa.ts`) e simulada para a Demonstração (`simulada-contexto-da-empresa.ts`, empresa fictícia, só em memória).
  - Testes: pgTAP `contexto_da_empresa.sql` no remoto (begin/rollback pela Management API) 24/24, falhas 0; vitest `contexto-da-empresa.test.tsx` (8) e `supabase-contexto-da-empresa.test.ts`; lint e `tsc -b` limpos. Conferência visual na Demonstração em 2026-11-06: site + Gerar, três campos e Salvar, sem cards nem campos firmográficos.
  - Suíte vitest completa local: 2124 passaram; a única falha (`src/conversa/gaveta-de-historico.test.tsx`, foco no jsdom) também falha sem estas mudanças e passa no CI da `main`.

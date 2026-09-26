# Supabase gerenciado no plano Free agora, auto-hospedado em VPS com os primeiros clientes

Durante a construção da aplicação, a Althius usa o Supabase gerenciado no plano Free. Quando tiver os primeiros clientes (um ou dois), passa a rodar o Supabase open source numa VPS própria, em vez de contratar o plano Pro do Supabase gerenciado. O motivo é custo: a VPS sai muito mais barata que o plano Pro. O preço disso é assumir a operação que o Supabase gerenciado faria.

A escolha muda de onde vêm alguns recursos. O bloqueio de senhas vazadas, que no Supabase gerenciado exige o plano Pro, existe no Supabase Auth open source e é ligado por configuração (`GOTRUE_PASSWORD_HIBP_ENABLED`). Enquanto o projeto estiver no plano Free, a verificação é feita na tela da Althius ([spec de autenticação](../../.scratch/autenticacao-google-email/spec.md)).

## Consequências

- Backups, atualizações de segurança, monitoramento, certificados TLS e disponibilidade do banco e da autenticação passam a ser responsabilidade da Althius, e não do Supabase.
- As configurações de Auth (provedor Google, SMTP, CAPTCHA, política de senha, URLs de redirecionamento) deixam de estar no painel do Supabase e passam a ser variáveis de ambiente da VPS. Elas precisam ser recriadas na migração.
- No plano Free, o projeto é pausado após cerca de uma semana sem uso e não tem backups automáticos. Isso é aceito só enquanto não houver clientes.
- A migração exige mover o banco, os usuários de `auth.users` (com seus hashes de senha e identidades Google), o Storage e as Edge Functions, sem forçar redefinição de senha.

## Revisão de 2026-09-25: o projeto gerenciado é pré-produção

Enquanto não houver clientes, o projeto gerenciado (`ycbdilsmydvzezhlymty`) é pré-produção.

- Só entram nele a equipe da Althius e as contas de teste.
- Ele guarda as personas e os dados de teste, como os Workspaces A e B e as Sequências `teste-real-*`.
- O cadastro público só abre no Supabase auto-hospedado.
- Na migração para a VPS vão apenas as Contas de usuário reais da equipe e os dados que ela quiser manter; personas e dados de teste ficam para trás.

Um segundo projeto gerenciado só para testes foi descartado por enquanto. Custaria manter dois projetos em sincronia sem proteger nenhum cliente, porque ainda não há clientes.

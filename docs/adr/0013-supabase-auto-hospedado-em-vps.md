# Supabase gerenciado no plano Free agora, auto-hospedado em VPS com os primeiros clientes

Durante a construção da aplicação, a Althius usa o Supabase gerenciado no plano Free. Quando tiver os primeiros clientes (um ou dois), passa a rodar o Supabase open source numa VPS própria, em vez de contratar o plano Pro do Supabase gerenciado.

A escolha muda de onde vêm alguns recursos. O bloqueio de senhas vazadas, que no Supabase gerenciado exige o plano Pro, existe no Supabase Auth open source e é ligado por configuração (`GOTRUE_PASSWORD_HIBP_ENABLED`). Enquanto o projeto estiver no plano Free, a verificação é feita na tela da Althius ([spec de autenticação](../../.scratch/autenticacao-google-email/spec.md)).

## Consequências

- Backups, atualizações de segurança, monitoramento, certificados TLS e disponibilidade do banco e da autenticação passam a ser responsabilidade da Althius, e não do Supabase.
- As configurações de Auth (provedor Google, SMTP, CAPTCHA, política de senha, URLs de redirecionamento) deixam de estar no painel do Supabase e passam a ser variáveis de ambiente da VPS. Elas precisam ser recriadas na migração.
- No plano Free, o projeto é pausado após cerca de uma semana sem uso e não tem backups automáticos. Isso é aceito só enquanto não houver clientes.
- A migração exige mover o banco, os usuários de `auth.users` (com seus hashes de senha e identidades Google), o Storage e as Edge Functions, sem forçar redefinição de senha.

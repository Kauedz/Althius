# Supabase Auth como provedor de identidade, sem Clerk

A Althius usa Supabase Auth para cadastro, login (Google, link e código por e-mail), sessão e recuperação de acesso. Clerk foi avaliado em 2026-09-25 pela promessa de telas prontas e pouca manutenção, e descartado.

As permissões já implementadas dependem de `auth.uid()` e de chaves estrangeiras para `auth.users` (participações, responsabilidades, Sequências e Contas remetentes). Com Clerk, o identificador do usuário não é UUID, `auth.users` fica vazia e a Althius precisaria sincronizar usuários entre dois serviços e reescrever RLS, RPCs, testes e Edge Functions de Sequências e Canais. Além disso, a experiência relatada com Clerk (páginas intermediárias, redirecionamentos confusos, layout cortado no celular) era justamente o que se queria evitar.

O custo aceito é construir a tela de login da Althius e contratar SMTP próprio para os e-mails de acesso e convite. A exibição do nome e do logo da Althius na tela do Google depende da verificação de marca no Google Cloud, qualquer que seja o provedor.

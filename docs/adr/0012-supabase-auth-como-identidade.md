# Supabase Auth como provedor de identidade, sem Clerk

A Althius usa Supabase Auth para cadastro, login (Google, e-mail e senha, e código ou link por e-mail), sessão e recuperação de acesso. Clerk foi avaliado em 2026-09-25 pela promessa de telas prontas e pouca manutenção, e descartado.

As permissões já implementadas dependem de `auth.uid()` e de chaves estrangeiras para `auth.users` (participações, responsabilidades, Sequências e Contas remetentes). Com Clerk, o identificador do usuário não é UUID, `auth.users` fica vazia e a Althius precisaria sincronizar usuários entre dois serviços e reescrever RLS, RPCs, testes e Edge Functions de Sequências e Canais. Além disso, a experiência relatada com Clerk (páginas intermediárias, redirecionamentos confusos, layout cortado no celular) era justamente o que se queria evitar.

O custo aceito é construir a tela de login da Althius e contratar SMTP próprio para os e-mails de acesso e convite. A exibição do nome e do logo da Althius na tela do Google depende da verificação de marca no Google Cloud, qualquer que seja o provedor.

## Revisão de 2026-09-25: senha além do código

A primeira versão deste ADR previa entrada por e-mail só sem senha (link e código). No mesmo dia, a decisão passou a ser **e-mail e senha como método principal para e-mail**, mantendo o código como alternativa. O público B2B espera ter senha e usa gerenciadores de senha. O código continua sendo necessário para verificar o e-mail e para o "Esqueci a senha", então mantê-lo como forma de entrar custa pouco.

O custo aceito é assumir política de senha (padrão NIST: mínimo de 8 caracteres e bloqueio de senhas vazadas feito pela própria tela da Althius, porque o bloqueio nativo do Supabase exige o plano Pro, que não será contratado), redefinição de senha, CAPTCHA contra abuso (Cloudflare Turnstile) e verificação obrigatória do e-mail antes do primeiro acesso. Sem essa verificação, uma pessoa poderia cadastrar o e-mail de outra e as respostas do cadastro revelariam quais e-mails já têm conta.

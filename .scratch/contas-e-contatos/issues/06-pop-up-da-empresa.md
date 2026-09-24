# 06: Pop-up da empresa

**What to build:** ao passar o mouse sobre uma empresa na tabela de Contas, o usuário vê, depois de um pequeno atraso, um pop-up com os links do site e do LinkedIn da empresa. Assim visita essas páginas sem abrir o detalhe. O atraso evita que o pop-up pisque enquanto o mouse percorre a tabela. O usuário de teclado vê o mesmo pop-up quando o nome recebe o foco.

**Blocked by:** 05 (Células da tabela de Contas no visual final)

**Status:** ready-for-agent

- [x] O pop-up abre ao passar o mouse sobre a empresa, depois de um pequeno atraso
- [x] O pop-up abre quando o nome da empresa recebe o foco do teclado
- [x] O pop-up continua aberto enquanto o ponteiro está nele, e o link pode ser clicado
- [x] O pop-up mostra só os links que existem: só o site, quando não há LinkedIn
- [x] Sem site nem LinkedIn, o pop-up não aparece
- [x] Os links abrem em outra aba

## Comments

- O pop-up usa o PreviewCard do Base UI, num portal (o quadro da tabela corta o que transborda). Abre 400 ms depois do mouse ou do foco no nome e fecha 200 ms depois que o ponteiro sai, com uma ponte até o pop-up.
- Teclado: o portal fica fora da ordem do Tab, e ela é refeita à mão. Do nome, o Tab entra nos links. Do primeiro link, o Shift+Tab volta ao nome. Do último, o Tab segue a tabela a partir do nome.
- O pop-up usa só o `siteUrl` e o `linkedinUrl` da fonte. O detalhe da conta monta o link do site a partir do domínio quando falta o `siteUrl`, e o pop-up não faz isso, para não mostrar um link inventado. Alinhar o detalhe a essa regra fica para o ticket 09.

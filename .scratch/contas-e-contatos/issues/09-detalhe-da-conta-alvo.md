# 09: Detalhe da Conta-alvo

**What to build:** o usuário clica no nome de uma empresa, ou em qualquer ponto da linha, e abre o detalhe da Conta-alvo numa página própria, com a migalha "Contas / Nome da empresa". A página é única, sem abas.

- **Cabeçalho:** o logo ou as iniciais em tamanho maior, o nome, o domínio com link para o site quando houver URL, o LinkedIn quando houver, e o segmento e a Aderência no mesmo tratamento da tabela. Por último, uma linha discreta de origem, quando a informação existir: "Importada por Marina em 12 set." ou "Recomendada pela Althius".
- **Sinais:** o Sinal mais recente em destaque, com frase, data e, quando existirem, fonte, evidência e "detectado por" (um Agente ou uma Integração). Abaixo, o histórico dos outros Sinais, do mais recente ao mais antigo.
- **Interações:** do mais recente ao mais antigo, com o tipo (e-mail enviado, e-mail recebido, mensagem enviada, ligação, reunião), o Contato, quem do Cliente participou, a origem do registro e a data.

A seção Contatos entra entre Sinais e Interações no ticket 12. Não há texto gerado por IA explicando "por que importa".

**Blocked by:** 01 (Mock do layout), 05 (Células da tabela de Contas no visual final)

**Status:** closed

- [x] Clicar no nome ou em qualquer ponto da linha abre o detalhe da Conta-alvo
- [x] O nome na tabela é um link
- [x] O detalhe tem a migalha "Contas / Nome", e o item da sidebar continua ativo
- [x] O cabeçalho mostra só os dados que existem, com a Aderência no tratamento da tabela
- [x] Uma Conta-alvo importada mostra a origem no detalhe
- [x] A seção Sinais mostra o mais recente em destaque e o histórico; sem Sinal, mostra "Nenhum sinal"
- [x] A seção Interações lista as Interações da mais recente à mais antiga; sem Interações, mostra "Nenhuma interação registrada", e o Último contato da tabela é "Nunca"
- [x] Um endereço de Conta-alvo inexistente mostra "Conta não encontrada" com um link de volta para Contas
- [x] O visual segue o mock aprovado

## Comments

- O detalhe já existia, feito junto com as Sequências. Ele passou a usar a barra de topo do componente de página: a migalha "Contas / Nome" é a mesma das páginas de Agente, e "Conta não encontrada" segue o padrão de "Agente não encontrado". A falha de carregamento continua com "Tentar de novo".
- O cabeçalho não inventa mais dados: o domínio só vira link quando há URL do site (antes o link era montado a partir do domínio), e o Sinal só mostra "Detectado por" quando a fonte informa (antes caía em "Scopus"). A evidência aparece como um link "Evidência" quando existe; a demo não tem nenhuma.
- A Aderência do cabeçalho e a da tabela são o mesmo componente (`components/aderencia.tsx`).
- A origem usa sempre a data explícita ("Importada por Marina em 11 set."), porque a forma relativa não cabe depois de "em". A regra do módulo ganhou `formatarDataExplicita`, e `formatarDataDoModulo` usa a mesma função depois de 30 dias.
- As seções seguem o mock: título grande, contagem à direita, Sinal em destaque com a borda na cor de destaque, histórico de Sinais e Interações numa linha do tempo, e estados vazios tracejados. A coluna lateral do mock ("Visão geral" e "Próxima ação") ficou de fora: repete o cabeçalho e a tabela, e a "Próxima ação" não está no ticket.
- A seção Sequência (das Sequências) e a seção Contatos, que já existiam, foram mantidas e passaram ao mesmo estilo de seção. A Sequência foi para o fim, depois de Interações, para as seções começarem por Sinais, Contatos e Interações. A seção Contatos tem o id `contatos` para a âncora do ticket 12, mas a tabela fica para esse ticket.
- O histórico de Sinais mostra as mesmas informações do destaque (data, fonte, evidência e "detectado por"), e a data da origem tem a data completa no tooltip e no nome acessível.
- "O visual segue o mock aprovado" foi conferido e aprovado pelo usuário, com o app e o mock abertos lado a lado.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.

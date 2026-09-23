# 09: Detalhe da Conta-alvo

**What to build:** o usuário clica no nome de uma empresa, ou em qualquer ponto da linha, e abre o detalhe da Conta-alvo numa página própria, com a migalha "Contas / Nome da empresa". A página é única, sem abas.

- **Cabeçalho:** o logo ou as iniciais em tamanho maior, o nome, o domínio com link para o site quando houver URL, o LinkedIn quando houver, e o segmento e a Aderência no mesmo tratamento da tabela. Por último, uma linha discreta de origem, quando a informação existir: "Importada por Marina em 12 set." ou "Recomendada pela Althius".
- **Sinais:** o Sinal mais recente em destaque, com frase, data e, quando existirem, fonte, evidência e "detectado por" (um Agente ou uma Integração). Abaixo, o histórico dos outros Sinais, do mais recente ao mais antigo.
- **Interações:** do mais recente ao mais antigo, com o tipo (e-mail enviado, e-mail recebido, mensagem enviada, ligação, reunião), o Contato, quem do Cliente participou, a origem do registro e a data.

A seção Contatos entra entre Sinais e Interações no ticket 12. Não há texto gerado por IA explicando "por que importa".

**Blocked by:** 01 (Mock do layout), 05 (Células da tabela de Contas no visual final)

**Status:** ready-for-agent

- [ ] Clicar no nome ou em qualquer ponto da linha abre o detalhe da Conta-alvo
- [ ] O nome na tabela é um link
- [ ] O detalhe tem a migalha "Contas / Nome", e o item da sidebar continua ativo
- [ ] O cabeçalho mostra só os dados que existem, com a Aderência no tratamento da tabela
- [ ] Uma Conta-alvo importada mostra a origem no detalhe
- [ ] A seção Sinais mostra o mais recente em destaque e o histórico; sem Sinal, mostra "Nenhum sinal"
- [ ] A seção Interações lista as Interações da mais recente à mais antiga; sem Interações, mostra "Nenhuma interação registrada", e o Último contato da tabela é "Nunca"
- [ ] Um endereço de Conta-alvo inexistente mostra "Conta não encontrada" com um link de volta para Contas
- [ ] O visual segue o mock aprovado

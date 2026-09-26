# Spec: Conexões funcionais

**Status:** ready-for-agent

**Frente:** Conexões funcionais (Renan), em paralelo com a frente de envio (canais-03 e canais-04). Os combinados entre as duas estão em `.scratch/ORDEM-BUILD-FUNCIONAL.md`, seção "Frentes em paralelo". Decisões de domínio: [ADR-0016](../../docs/adr/0016-sincronizacao-do-hubspot-so-le-e-respeita-o-responsavel.md) e [ADR-0017](../../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md).

## Problem Statement

No Workspace operacional, a tela Conexões diz que o módulo está indisponível. Tudo o que ela mostra, Canais conectados, Integrações conectadas e o fluxo de "Autorizar", existe só na Demonstração. Quem usa a Althius de verdade não consegue ligar as ferramentas que já usa, e as Contas-alvo e os Contatos que o Cliente mantém no HubSpot precisam ser cadastrados de novo, um por um, à mão.

## Solution

A tela Conexões passa a funcionar no Workspace operacional. Um Administrador habilita uma Integração no Workspace, e cada participante conecta a própria conta daquele app, do mesmo jeito que um app se conecta ao Claude ou ao ChatGPT: um botão, o consentimento no próprio app e o estado real da conexão. Por baixo, a Althius é cliente MCP do servidor MCP oficial do app.

O HubSpot é a primeira Integração completa. Quem conectou o próprio Acesso aperta "Sincronizar agora", e as Companies atribuídas a participantes do Workspace chegam como Contas-alvo, com seus Contacts como Contatos e Vínculos do Contato. A Sincronização só lê, nunca apaga e respeita o Vendedor responsável. O Notion entra como segunda Integração, só com o Acesso, para provar que o mecanismo serve a qualquer app. As outras Integrações do catálogo aparecem como "Em breve" até terem o servidor MCP oficial confirmado. Os Canais continuam "Em breve".

## User Stories

### Catálogo e habilitação

1. Como participante de um Workspace operacional, quero abrir Conexões e ver o catálogo real de Canais e Integrações, para saber o que posso ligar à Althius.
2. Como participante, quero que nada na tela Conexões do Workspace operacional apareça como conectado sem estar, para confiar no que vejo.
3. Como participante, quero ver os Canais como "Em breve", para saber que eles existem mas ainda não funcionam.
4. Como participante, quero ver cada Integração do catálogo com um de três estados, "Em breve", "Não habilitada" ou "Habilitada", para entender o que já posso usar.
5. Como Administrador, quero habilitar uma Integração disponível no Workspace, para que os participantes possam conectar a própria conta dela.
6. Como Membro, quero ver que uma Integração ainda não foi habilitada e que só um Administrador a habilita, para saber a quem pedir.
7. Como Administrador, quero retirar uma Integração do Workspace, para que ninguém mais a use aqui.
8. Como Administrador, quero ser avisado antes de retirar uma Integração de que todos os Acessos serão desconectados e de que as Contas-alvo e os Contatos já sincronizados continuam no Workspace, para decidir sabendo o efeito.
9. Como participante, quero que retirar uma Integração não apague nenhuma Conta-alvo, Contato, Vínculo nem Interação, para não perder trabalho comercial.
10. Como participante da Demonstração, quero que a tela Conexões continue funcionando como antes, com o fluxo simulado, para apresentar o produto.

### Acesso à Integração

11. Como participante, quero conectar a minha própria conta de uma Integração habilitada, para que a Althius use o que eu enxergo naquele app.
12. Como participante, quero autorizar a conexão na tela de consentimento do próprio app, como faço no Claude ou no ChatGPT, para não precisar copiar chaves nem tokens.
13. Como participante, quero voltar para Conexões depois de autorizar e ver o meu Acesso como conectado, com a conta do app com que entrei, para ter certeza de que deu certo.
14. Como participante, quero ver uma mensagem clara quando eu recusar o consentimento, quando a autorização expirar ou quando algo falhar, sem o cartão fingir que conectou.
15. Como participante, quero desconectar o meu Acesso, para parar de dar à Althius acesso à minha conta daquele app.
16. Como participante, quero que desconectar o meu Acesso não afete o Acesso dos outros participantes nem os dados já sincronizados.
17. Como participante, quero ver quando o meu Acesso precisa ser reconectado, porque o app o revogou ou ele deixou de valer, para reconectar em vez de descobrir quando algo falhar.
18. Como participante, quero reconectar o meu Acesso pelo mesmo botão, para continuar de onde parei.
19. Como participante, quero ver quantos participantes do Workspace já conectaram o próprio Acesso, para saber se a equipe está usando a Integração.
20. Como participante, quero que ninguém, nem um Administrador, use o meu Acesso, para que a Althius aja com a minha conta só quando eu pedir.
21. Como participante, quero ver o que a Integração oferece aos Agentes, com a lista de ferramentas do servidor do app, para entender o que os Agentes poderão fazer quando usarem esta Conexão.
22. Como participante, quero ser recusado com uma mensagem clara quando eu conectar uma conta de outro portal HubSpot que não o do Workspace, para que dois CRMs nunca se misturem.
23. Como Administrador, quero trocar o portal HubSpot do Workspace retirando a Integração e habilitando de novo, para corrigir um portal conectado por engano.
24. Como participante, quero que o token da minha conta nunca chegue ao navegador, a logs compartilhados nem a outro participante, para que a minha conta do app fique protegida.

### Sincronização do HubSpot

25. Como participante com Acesso ao HubSpot, quero apertar "Sincronizar agora", para trazer para a Althius as Companies e os Contacts do HubSpot.
26. Como participante sem Acesso ao HubSpot, quero ver que preciso conectar o meu Acesso antes de sincronizar.
27. Como participante, quero que a Sincronização traga só as Companies cujo owner no HubSpot é um participante ativo do Workspace, para que a aba Contas não se encha de empresas sem dono.
28. Como participante, quero que a Sincronização use o meu Acesso e traga só o que eu enxergo no HubSpot, para não expor ao Workspace o que eu não veria lá.
29. Como Vendedor, quero que uma Company minha no HubSpot vire uma Conta-alvo sob a minha responsabilidade, para prospectá-la na Althius.
30. Como Vendedor responsável, quero que uma Conta-alvo que já existe continue sob a minha responsabilidade mesmo que o owner mude no HubSpot, para que ninguém tome a minha Conta por sincronização.
31. Como participante, quero que uma Company seja reconhecida pela URL da empresa, a partir do `website` ou do `domain`, para que ela atualize a Conta-alvo que já existe em vez de criar outra.
32. Como participante, quero que uma Company já sincronizada seja reencontrada mesmo que a URL dela mude no HubSpot, para não ganhar Contas-alvo duplicadas.
33. Como participante, quero que uma Company sem `website` e sem `domain` seja ignorada e contada, para saber que ela existe e por que não entrou.
34. Como participante, quero que os Contacts associados às Companies sincronizadas cheguem como Contatos, com Vínculo do Contato na Conta-alvo correspondente.
35. Como participante, quero que um Contact associado a várias Companies sincronizadas ganhe um Vínculo com cada Conta-alvo, para refletir que ele atua em todas.
36. Como participante, quero que um Contact com o e-mail, o telefone ou o LinkedIn de um Contato que já existe atualize esse Contato, em vez de criar outro.
37. Como participante, quero que um Contact já sincronizado seja reencontrado mesmo que tenha trocado de e-mail no HubSpot.
38. Como participante, quero que um Contact sem e-mail, sem telefone e sem LinkedIn seja ignorado e contado, porque o nome sozinho não identifica ninguém.
39. Como participante, quero que um Contact sem Company sincronizada seja ignorado e contado.
40. Como participante, quero que só os campos que a Althius tem sejam trazidos: nome, URL, LinkedIn e segmento da empresa; nome, cargo, e-mail, telefone e LinkedIn da pessoa.
41. Como participante, quero que o valor do HubSpot prevaleça sobre o da Althius num campo trazido, para que o CRM do Cliente continue sendo a referência.
42. Como participante, quero que um campo vazio no HubSpot nunca apague o que a Althius já tem, para não perder dados corrigidos aqui.
43. Como Vendedor responsável, quero que uma mudança de e-mail vinda do HubSpot atualize o Contato mas não o Destino de um passo que eu já confirmei na Sequência, para que a minha abordagem nunca seja redirecionada sem eu saber.
44. Como participante, quero que uma Company apagada ou mesclada no HubSpot não apague a Conta-alvo, para não perder o histórico comercial.
45. Como participante, quero que um Contact que perdeu a associação no HubSpot mantenha o Vínculo, que só quem tem permissão encerra.
46. Como participante, quero acompanhar a Sincronização enquanto ela roda, com o andamento e as contagens, para saber que ela não travou.
47. Como participante, quero ver ao final quantas Contas-alvo e Contatos foram criados, atualizados, vinculados, ignorados e quantos falharam.
48. Como participante, quero ver os itens ignorados e os que falharam, com o motivo, para corrigir no HubSpot e sincronizar de novo.
49. Como participante, quero ver no cartão do HubSpot quando foi a última Sincronização do Workspace e quem a pediu.
50. Como participante, quero que uma Sincronização interrompida continue de onde parou quando eu sincronizar de novo, sem duplicar nada.
51. Como participante, quero que duas pessoas apertando "Sincronizar agora" ao mesmo tempo não criem duas Sincronizações do mesmo Workspace.
52. Como participante, quero que a primeira Sincronização traga tudo e as seguintes tragam só o que mudou no HubSpot desde a última, para que elas sejam rápidas.
53. Como participante, quero que sincronizar duas vezes seguidas sem mudanças no HubSpot não altere nada, para confiar que a Sincronização é segura de repetir.
54. Como participante, quero que a Sincronização pare com uma mensagem clara quando o meu Acesso deixar de valer no meio dela, pedindo que eu reconecte.
55. Como participante, quero que as Contas-alvo e os Contatos sincronizados apareçam nas abas Contas e Contatos como qualquer outro, para trabalhar com eles sem diferença.
56. Como participante, quero que uma Conta-alvo ou um Contato sincronizado mostre discretamente que veio do HubSpot, para entender de onde ele veio.

### Isolamento e segurança

57. Como participante de um Workspace, quero que nenhum dado, Acesso ou Sincronização de outro Workspace apareça no meu.
58. Como participante removido de um Workspace, quero que o meu Acesso naquele Workspace pare de ser usado, mesmo sem eu desconectar.
59. Como Cliente, quero que um código de autorização ou um retorno do OAuth forjado nunca associe a conta de alguém ao meu Workspace.
60. Como Cliente, quero que o conteúdo vindo do HubSpot seja tratado como dado, sem nunca mudar permissões, responsáveis ou regras da Althius.

### Integrações seguintes

61. Como participante, quero conectar o meu Acesso ao Notion pelo mesmo fluxo do HubSpot, para usar a minha base de conhecimento quando os Agentes chegarem.
62. Como participante, quero que cada Integração do catálogo com servidor MCP oficial confirmado passe de "Em breve" a disponível, sem mudar a tela.

## Implementation Decisions

### Módulos

- **Fonte de Conexões.** Uma fronteira nova da tela Conexões, separada da fonte dos Agentes, com duas implementações: a simulada, que preserva a Demonstração, e a real, sobre o Supabase. Ela expõe o catálogo com o estado de cada Canal e Integração no Workspace e na sessão; habilitar e retirar uma Integração; iniciar a conexão do próprio Acesso, que devolve o endereço de consentimento; desconectar o próprio Acesso; listar as ferramentas de uma Integração; pedir uma Sincronização; e ler a Sincronização em curso ou a última, com as contagens e os itens ignorados. As ações que a fonte real não suporta recusam com erro, sem simular sucesso.
- **Catálogo.** A lista de Integrações e o que cada uma precisa para conectar (endereço do servidor MCP, forma de registrar o cliente OAuth, escopos) ficam no backend. A tela recebe só nome, categoria, descrição e estado. Uma Integração sem servidor MCP oficial confirmado fica "Em breve".
- **Cliente MCP.** Um módulo das Edge Functions, único para todas as Integrações, que faz a descoberta OAuth do servidor, o registro do cliente (dinâmico quando o servidor aceita, pré-registrado quando o app exige, como o MCP Auth App do HubSpot), o PKCE, a troca e a renovação de tokens, e as chamadas de ferramentas. É o único lugar que conhece o protocolo MCP.
- **Edge Function de conexões.** Recebe as ações autenticadas da tela (conectar, desconectar, listar ferramentas, sincronizar e continuar a Sincronização) e é o destino do retorno do OAuth. Tem segredos próprios, não recebe webhooks nesta spec e não reutiliza as funções nem os segredos da Unipile.
- **Aplicação da Sincronização no banco.** Uma função SQL, executável só pelo backend, recebe um lote já lido do HubSpot e decide tudo o que muda: correspondência pela Identidade externa, pela URL canônica e pelos Destinos do Contato; responsável da Conta-alvo nova; regra do vazio que não apaga; Vínculos; contagens e motivos. Assim a regra de negócio fica testável sem o HubSpot. A Edge Function só lê as páginas do HubSpot, entrega os lotes e guarda o cursor.

### Dados

- **Integração habilitada no Workspace.** Uma linha por Workspace e Integração, com quem habilitou, quando e o portal do app fixado pelo primeiro Acesso. Leitura para toda Participação ativa; escrita só por funções que conferem o papel de Administrador.
- **Acesso à Integração.** Uma linha por participante, Workspace e Integração, com a conta do app, o estado (conectado ou precisa reconectar) e os tokens. Fica no schema privado, acessível só pelo backend. A tela recebe apenas o estado e a conta do app do próprio participante, e a contagem de quantos participantes conectaram.
- **Tentativa de conexão.** Temporária, com `state` aleatório, verificador PKCE, participante, Workspace e Integração, e prazo curto. O retorno do OAuth só é aceito se casar com uma tentativa pendente, dentro do prazo, de um participante ainda ativo.
- **Identidade externa.** Uma linha por Workspace, Integração, portal, tipo de objeto e id no app, apontando para a Conta-alvo ou o Contato, com a marca de removida no app. Não vira coluna das tabelas de Contas-alvo e Contatos.
- **Sincronização.** Uma linha por execução, com quem pediu, estado, cursor, marca d'água da última modificação, contagens e itens ignorados ou com falha e o motivo. No máximo uma em andamento por Workspace e Integração.
- **Procedência.** A Conta-alvo e o Contato sincronizados guardam a origem "HubSpot" para a tela mostrar. As Interações continuam só manuais: engagements do HubSpot não entram.
- Migrations seguem `docs/agents/migrations.md`, com RLS explícito em toda tabela nova do schema public.

### Regras

- A Sincronização grava pela função própria de aplicação de lotes, em nome do sistema, e não pelas funções que os usuários chamam, porque estas exigem que quem chama seja o Vendedor responsável. Ela reaproveita as funções privadas de normalização já existentes (URL canônica, e-mail, WhatsApp e LinkedIn).
- Esta frente não redefine as funções de Sequências, de Interações nem de Contas remetentes. A Sincronização nunca lê nem grava o documento da Sequência: o Destino confirmado de um passo ([ADR-0014](../../docs/adr/0014-passo-confirmado-guarda-o-destino.md)) é da frente de envio.
- Responsável da Conta-alvo nova: o participante ativo cujo e-mail é o do HubSpot owner da Company. Uma Company sem owner participante não entra. Uma Conta-alvo que já existe mantém o responsável.
- Correspondência da Company: primeiro pela Identidade externa; senão pela URL canônica formada do `website` ou, na falta dele, do `domain`.
- Correspondência do Contact: primeiro pela Identidade externa; senão por e-mail, telefone ou LinkedIn de um Contato do Workspace. Se os Destinos de um Contact baterem com dois Contatos diferentes, ele é ignorado com esse motivo, sem mesclar.
- Campos trazidos: da Company, nome, URL, LinkedIn e segmento (indústria); do Contact, nome (primeiro e último), cargo, e-mail, telefone (principal ou celular) e LinkedIn, quando o portal tiver a propriedade.
- Um valor do HubSpot que a validação da Althius recusa (e-mail inválido, telefone sem DDD) é ignorado naquele campo e contado, sem derrubar o restante do registro.
- O primeiro Acesso fixa o portal do Workspace. Um Acesso a outro portal é recusado.
- Retirar uma Integração apaga os Acessos, as tentativas e as Identidades externas dela no Workspace. Nenhuma Conta-alvo, Contato, Vínculo ou Interação é apagado.
- Uma Participação desativada deixa de ter o Acesso usado; ele fica inválido até a pessoa voltar e reconectar.
- A Sincronização lê pelo Acesso de quem a pediu. Se ele deixar de valer no meio, a Sincronização para com o motivo e continua do cursor quando alguém sincronizar de novo.

### Contratos externos

- A pesquisa do primeiro ticket decide se a Sincronização do HubSpot lê o portal pelas ferramentas do servidor MCP ou por um app OAuth separado, sem mudar a tela, a Fonte de Conexões nem a aplicação de lotes no banco.
- O HubSpot limita um MCP Auth App não listado no marketplace a 25 instalações. Basta para a pré-produção.
- Segredos novos (cliente OAuth do HubSpot e o que a pesquisa indicar) são segredos das Edge Functions desta frente. Nenhum segredo usa o prefixo `VITE_`.

## Testing Decisions

Um bom teste verifica o que a pessoa vê e o que fica guardado, sem depender de nomes de componentes, tabelas internas ou do SDK. Seams, do mais alto para o mais baixo:

1. **O app renderizado no Workspace operacional**, com o Supabase falso já usado nos testes da raiz. A tela Conexões é dirigida como usuário: catálogo, habilitar e retirar, conectar e desconectar o próprio Acesso, sincronizar e ler o resultado. O Supabase falso ganha a chamada de Edge Functions. A Demonstração continua coberta pelos testes de Conexões que já existem.
2. **pgTAP** para o banco: RLS e papéis da habilitação, isolamento entre Workspaces, o Acesso privado, a aceitação do retorno do OAuth, e toda a regra da Sincronização pela função de aplicação de lotes (correspondência, responsável, vazio que não apaga, Vínculos, ignorados, idempotência, uma Sincronização por vez). Prior art: `contas_alvo_reais.sql`, `contatos_e_vinculos.sql` e `contas_remetentes_unipile.sql`.
3. **A validação real**, com um portal HubSpot de teste, fica como ticket humano, porque ainda não há conta HubSpot.

A Edge Function e o cliente MCP ficam finos: a regra de negócio mora na função SQL. O que houver de lógica neles (PKCE, validação do `state`, leitura das páginas) é validado na validação real. Não entra um job de testes Deno no CI nesta spec.

## Out of Scope

- Os Agentes usarem as ferramentas das Integrações. A Conexão fica pronta; o uso chega com o backend dos Agentes.
- Escrever no HubSpot. É ação de Agente sob a Permissão.
- Engagements do HubSpot (e-mails, ligações, reuniões) como Interações.
- Sincronização agendada ou por webhooks do HubSpot. Só o botão, com a Sincronização retomável desde já.
- Os Canais (Slack, WhatsApp, Microsoft Teams, E-mail) funcionando. Continuam "Em breve".
- Clay, Apollo, Lusha, Meta Ads e Google Ads conectando. A pesquisa confirma quais têm servidor MCP oficial; cada um vira um ticket novo depois.
- A Althius como servidor MCP, para o Claude ou o ChatGPT se conectarem a ela. Vira uma spec própria.
- As Contas remetentes, a Unipile e tudo o que é da frente de envio.
- Transferir responsabilidade de Contas-alvo, Roleta de Contas e importação por CSV.

## Further Notes

- **Pendência humana:** não há conta HubSpot. Um wizard guia a criação da conta de desenvolvedor, do portal de teste e do MCP Auth App, e o cadastro dos segredos. Mudar segredos no Supabase exige combinar antes.
- A tela preserva tipografia, cores, layout e componentes da Conexões atual. Mudam os estados dos cartões e entra o que a Sincronização precisa: o botão, o andamento e o resultado.
- O Supabase deste projeto (`ycbdilsmydvzezhlymty`) é pré-produção (ADR-0013). Aplicar migrations e publicar funções segue `docs/agents/migrations.md`, conferindo antes a última versão aplicada, porque a frente de envio também aplica migrations.
- Vocabulário novo no `CONTEXT.md`: Acesso à Integração, Identidade externa e Sincronização.

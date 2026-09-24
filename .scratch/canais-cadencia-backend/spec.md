# Sequências reais com Unipile e Supabase

Status: regras de produto confirmadas; tickets publicados em `issues/` e prontos para implementação na ordem das dependências. A captura de dados de contato pelo LinkedIn (seção própria e ticket 13) tem regra de produto confirmada e decisões ainda pendentes, listadas em "Decisões pendentes".

## Resultado esperado

Transformar o módulo existente de Sequências em operação real: conectar os canais pessoais do vendedor, executar passos programados, receber respostas, pausar a Conta-alvo, preparar uma Proposta de resposta e enviar somente depois da Aprovação do titular. O desenho visual existente será preservado; as opções SMS, Ligação e Tarefa serão retiradas conforme solicitado.

Quando um convite do LinkedIn do vendedor é aceito, a Althius também traz para o Contato o e-mail e o telefone que a pessoa compartilha com as conexões de 1º grau (ver "Enriquecer o Contato quando a conexão do LinkedIn é aceita").

Esta entrega substitui as simulações apenas no caminho de cadência e mensageria. Não implementa dashboard, caixa de entrada compartilhada, CRM completo, enriquecimento, motor de comissões ou funcionamento geral de todos os Agentes.

## Regras de produto confirmadas

1. A Conta-alvo é a unidade comercial. Há no máximo uma Sequência por Conta-alvo no Workspace, mesmo quando existem vários vendedores.
2. A Conta-alvo tem um Vendedor responsável exclusivo. Ele também é o responsável pela Sequência.
3. Todos os passos usam somente E-mail, LinkedIn ou WhatsApp desse responsável. Não há rodízio de remetentes nem uso dos canais de outro participante.
4. Outro participante, inclusive Administrador, não recebe autorização para editar a Sequência, assumir a Conta-alvo ou aprovar mensagens do responsável.
5. O responsável vê seu documento, conteúdo comercial recebido e Propostas de resposta. Os demais veem apenas eventos e status, como “Contato respondeu; sequência pausada”.
6. Qualquer resposta de um Contato da Conta-alvo, positiva ou negativa, pausa todos os passos programados daquela Sequência. Outras Contas-alvo continuam independentes.
7. A IA interpreta a resposta e prepara uma proposta. Não envia automaticamente, inclusive quando outro contexto do Agente admite Permissão Executar.
8. Somente o titular da Conta remetente aprova o envio da resposta. A proposta aprovada corresponde a uma versão específica do texto, destinatário e canal.
9. Uma Aprovação de resposta não retoma a Sequência. A retomada é uma ação explícita do responsável.
10. Permanecem a confirmação humana dos participantes, os passos ordenados, os delays em dias úteis, as janelas de horário e o mesmo documento entre Conversa, lista e detalhe da Conta-alvo.
11. Destinatários vêm dos Contatos cadastrados, com e-mail, telefone WhatsApp e identidade LinkedIn reais. Os destinos de teste serão fornecidos pelo usuário.
12. Inatividade, perda da oportunidade ou passagem de quatro meses não liberam a Conta-alvo para outro vendedor nesta entrega.

## Proposta de arquitetura

A proposta é concentrar o backend no Supabase e usar Unipile para comunicação externa. Supabase Auth identifica o usuário; Postgres persiste propriedade, Sequências e mensagens; funções de backend executam comandos e recebem webhooks; uma fila durável e um agendador executam passos mesmo com o navegador fechado. A integração não chama Meta, Gmail, Outlook ou LinkedIn diretamente.

Uma alternativa seria hospedar um servidor e worker separados, usando Supabase só como banco: oferece maior controle de processos longos, mas adiciona infraestrutura operacional. Outra seria executar os passos no navegador: foi descartada porque fechar a página interromperia a cadência e exporia a integração ao cliente. O plano de implementação deve usar operações curtas em backend e estado durável, sem esperar dias dentro de uma função.

O adapter Unipile isola a versão da API e normaliza diferenças entre e-mail e mensageria. A documentação v2 está em beta; a base proposta é v1, sujeita à compatibilidade da instância escolhida. Não misturar contratos das duas versões.

### Identidade e propriedade

- Toda operação real requer sessão autenticada e participação ativa no Workspace. Nome de usuário da demo ou identificador enviado pelo navegador não prova identidade.
- A atribuição inicial da Conta-alvo e a criação da Sequência devem ocorrer atomicamente. Duas solicitações concorrentes não podem produzir dois responsáveis ou duas Sequências.
- O backend verifica responsável, Workspace e propriedade das Contas remetentes em cada mutação e novamente antes do envio.
- Políticas de acesso no banco protegem dados mesmo contra chamadas diretas fora da interface.
- A saída de um vendedor do Workspace bloqueia acesso e novos envios com seus canais, preservando os registros. A entrega não cria uma interface de transferência, não entrega credenciais ao sucessor e não transfere contas automaticamente; o fluxo completo de sucessão por desligamento terá especificação própria.

### Dados mínimos

| Registro | Responsabilidade e acesso |
| --- | --- |
| Participação no Workspace | Identidade, papel e vínculo ativo para autorização |
| Responsabilidade comercial | Conta-alvo, Workspace e único vendedor; sem atualização arbitrária pelo cliente |
| Conta remetente | Titular, canal, identificador Unipile, estado de conexão; uso restrito ao titular |
| Contato e destinos | Vínculo à Conta-alvo, e-mail real, número normalizado e identidade LinkedIn |
| Dado de contato capturado do LinkedIn | Contato, tipo (e-mail ou telefone), valor, origem “Informações de contato do LinkedIn”, Conta remetente e titular que capturaram, `capturado_em`; ou a marca “não disponível no LinkedIn” por campo. Visibilidade pendente de decisão |
| Captura por conexão | Conta remetente, identificador LinkedIn da pessoa, evento de origem, resultado e data; chave única por Conta remetente e pessoa |
| Sequência e versão | Conta-alvo, responsável, participantes, janela, estado e revisão aprovada para execução |
| Passo e execução | Ordem, canal, destino, conteúdo, horário previsto, resultado e referência externa |
| Mensagem comercial | Direção, corpo, anexos, conversa externa e titular; conteúdo privado |
| Proposta de resposta | Mensagem de origem, texto, revisão, estado e aprovação do titular; conteúdo privado |
| Evento compartilhado | Conta-alvo, Sequência, tipo, data e status, sem corpo, assunto, anexos ou resumo livre da mensagem |
| Trabalho pendente | Envio, recepção ou geração de proposta com tentativas e resultado persistentes |

Separar mensagens privadas dos eventos compartilhados fisicamente ou por projeções que não exponham conteúdo. Não carregar mensagens no navegador de outro participante e apenas esconder os elementos visuais. Anexos usam armazenamento privado e acesso restrito ao titular; URLs `blob:` da demo não servem para envio futuro.

### Conectar canais

1. O usuário autenticado pede a conexão de um dos três canais.
2. O backend cria uma tentativa temporária vinculada ao usuário e Workspace e solicita autenticação hospedada à Unipile.
3. A conclusão é verificada pelo backend antes de associar a identidade externa ao titular. Redirecionamento do navegador ou campos enviados pelo cliente não bastam para provar conexão.
4. A interface existente reflete conexão, desconexão e necessidade de reconectar. Uma conexão de conversa com Agente não deve ser confundida com Conta remetente de prospecção.
5. Credenciais da Unipile ficam somente no backend. Revalidar a associação em reconexões; ninguém pode anexar uma identidade externa de outro titular.

No contrato v1, criar a conta externa ainda inicia sincronização: a prontidão precisa considerar os eventos de ciclo de vida, não apenas o retorno de criação. Reconexão deve reconciliar respostas acumuladas antes de liberar novos passos. O callback de autenticação hospedada e os webhooks de mensagens têm contratos próprios e devem ser autenticados separadamente.

### Preparar e executar uma Sequência

1. O responsável confirma participantes, conteúdo, canal e destinos reais; o backend rejeita canais fora do escopo e dados ausentes.
2. A ativação exige confirmação humana do documento a executar. Ter o status visual “Ativa” herdado da demo nunca autoriza envio real.
3. Registrar a versão autorizada e programar os passos em armazenamento durável.
4. Calcular datas respeitando a ordem, delays e janela. Proposta técnica inicial: fuso explícito `America/Sao_Paulo`, dias úteis de segunda a sexta, sem calendário de feriados nesta entrega; mudanças de fuso precisam recalcular os passos ainda não enviados.
5. Antes de cada envio, verificar novamente participação ativa, responsável, versão, pausa, horário, destino e conexão do canal.
6. O backend chama Unipile e persiste o resultado. Um erro não avança o passo como se tivesse sido enviado; confirmação de aceitação pelo provedor não equivale a entrega ou leitura.
7. E-mail manual continua dependendo de ação explícita do titular; não convertê-lo silenciosamente em envio automático. Convite, mensagem e InMail do LinkedIn dependem das capacidades da conta conectada.
8. Editar conteúdo de passos pendentes invalida a autorização daquela versão e exige confirmação do responsável. Passos já enviados preservam o histórico real.
9. Retomar após pausa não dispara uma rajada de passos vencidos; reprograma os pendentes a partir da retomada, respeitando a janela e os delays.

### Receber resposta, pausar e propor

1. O endpoint autentica a origem do webhook e persiste o evento antes de confirmá-lo ao provedor.
2. Identificar a Conta remetente e diferenciar mensagem recebida de mensagem enviada pelo próprio titular, inclusive fora da aplicação.
3. Correlacionar a mensagem à identidade do Contato e Conta-alvo sob o responsável correto. Uma conversa pessoal ou não relacionada não vira registro compartilhado e não é enviada à IA da cadência.
4. Persistir a resposta privada e pausar a Sequência em uma transação, invalidando os passos pendentes. O executor consulta a pausa antes de autorizar qualquer novo envio.
5. Publicar apenas o evento “Contato respondeu; sequência pausada” para os demais participantes.
6. Preparar uma Proposta de resposta com contexto restrito à prospecção relevante, atribuída ao Rhetor. O serviço de IA não recebe ferramenta nem credencial que permita enviar mensagens.
7. Falha na geração não desfaz a pausa nem perde a resposta. Registrar erro privado e permitir nova tentativa.
8. No recebimento de novas mensagens, uma proposta anterior não pode ser enviada como se estivesse atualizada sem revisão do titular.

Uma resposta não pode cancelar uma chamada já aceita pelo provedor antes de o evento chegar à Althius. O critério verificável é: após a pausa ser persistida, nenhum novo passo programado recebe autorização de envio. Corridas e eventos tardios devem ser registrados sem fingir garantia de cancelamento retroativo.

### Aprovar e enviar uma resposta

- O titular consulta a proposta no fluxo existente de Aprovações/Sequência; os demais não recebem seu conteúdo.
- Aprovar registra identidade, revisão, destinatário e canal e cria um único trabalho de envio. Rejeitar não envia.
- A aprovação autoriza somente aquela resposta. Não habilita um modo de resposta automática e não retoma a Sequência.
- Mudanças no texto ou destinatário exigem nova aprovação. Clique duplo e repetição da chamada não criam novos envios.
- Desconexão, remoção do usuário ou alteração de propriedade impedem o envio, mesmo com uma aprovação anterior.

### Enriquecer o Contato quando a conexão do LinkedIn é aceita

Regra de produto confirmada pelo Renan em 2026-09-24: quando um convite do LinkedIn do vendedor é aceito, a Althius usa a Conta remetente de LinkedIn desse vendedor (ADR 0008) para consultar o perfil da nova conexão e trazer para o Contato o e-mail pessoal e o telefone que a pessoa compartilha. É o mesmo comportamento do Sales Flow. Os dados se destinam a alimentar remarketing no futuro (públicos personalizados de Meta Ads e Google Ads), fora do escopo desta entrega.

Por que funciona: por padrão, o LinkedIn mostra o e-mail principal da conta às conexões de 1º grau, e as informações da seção Contact Info do perfil (como o telefone) também são visíveis só para elas. A pessoa pode restringir o e-mail a “Only visible to me”, e o telefone só existe quando ela o adicionou ([LinkedIn: visibilidade do e-mail](https://www.linkedin.com/help/linkedin/answer/a523134), [LinkedIn: o que aparece no perfil](https://www.linkedin.com/help/linkedin/answer/a545600)).

#### Gatilho: conexão aceita

1. Gatilho principal: o webhook de usuários da Unipile (`source: "users"`), evento `new_relation`, que já vem incluído por padrão. Ele cobre convites aceitos, com ou sem nota, e traz `account_id`, `user_provider_id`, `user_public_identifier` e `user_profile_url` ([Unipile: detectar convites aceitos](https://developer.unipile.com/docs/detecting-accepted-invitations)).
2. O evento **não é em tempo real**: o LinkedIn não oferece esse evento, e a Unipile consulta a lista de relações em intervalos aleatórios. O webhook pode chegar **até 8 horas depois** do aceite. O produto não promete o dado imediatamente após o aceite.
3. Caminho antecipado opcional: um convite com nota cria uma conversa contendo só a nota do vendedor, detectável pelo webhook de mensagens. Como a pessoa pode responder sem aceitar, esse sinal só vale após confirmar a relação no perfil (item 2 de “Consultar o perfil”). O eco da nota continua não sendo resposta comercial.
4. Reconciliação (proposta): como proteção contra webhook perdido, ler só a primeira página da lista de relações, poucas vezes ao dia, em intervalos aleatórios de várias horas e nunca em horário fixo, como recomenda a Unipile ([limites dos provedores](https://developer.unipile.com/docs/provider-limits-and-restrictions), [listar relações](https://developer.unipile.com/reference/userscontroller_getrelations)). A reconciliação usa a mesma chave de idempotência do webhook.
5. O endpoint do webhook segue as regras já definidas: autenticação própria (segredo em header, contrato v1), persistência antes de responder HTTP 200 e deduplicação. `new_relation` não é resposta comercial e não pausa a Sequência (ticket 07).

#### Consultar o perfil uma vez por nova conexão

1. Para cada nova conexão, o backend chama `GET /api/v1/users/{identifier}?account_id=...` com a Conta remetente que recebeu a conexão, usando o `user_provider_id` do evento ([Unipile: Retrieve a profile](https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier)). Não pedir `linkedin_sections` pesadas além do necessário para identificar a pessoa e a empresa atual, e manter `notify` no padrão `false`, sem notificar a visita.
2. Só gravar dados de contato se a resposta trouxer `network_distance = FIRST_DEGREE`. Qualquer outro valor encerra a captura como “sem relação de 1º grau”, sem gravar e-mail ou telefone.
3. Ler `contact_info.emails` e `contact_info.phones`. Os demais campos de `contact_info` não entram nesta entrega.
4. Idempotência por Conta remetente + pessoa (identificador LinkedIn nativo): o mesmo aceite, vindo do webhook, da reconciliação ou do caminho antecipado, gera uma única consulta de perfil. Reenvios do evento não geram nova chamada.
5. Volume baixo e dentro dos limites: a consulta de perfil conta no limite recomendado de cerca de 100 perfis por conta por dia, independente da rota ([limites dos provedores](https://developer.unipile.com/docs/provider-limits-and-restrictions)). Enfileirar as consultas, espaçá-las, parar ao atingir a cota diária da Conta remetente e continuar no dia seguinte. Não fazer retentativa cega: erros de limite, de conta desconectada ou de reconexão pendente seguem as regras de tentativas e reconexão já definidas (ticket 11).
6. A consulta é feita só pela Conta remetente do próprio titular e nunca pela de outro participante (ADR 0008).

#### Dados gravados no Contato

- E-mail(s) pessoal(is) e telefone(s), cada um com: origem “Informações de contato do LinkedIn, via Conta remetente”, a Conta remetente e o titular que capturaram, e `capturado_em`.
- Quando o campo vem vazio, porque a pessoa restringiu a visibilidade ou nunca adicionou telefone, gravar “não disponível no LinkedIn” para aquele campo, com a mesma origem e data. A tela mostra o canal como indisponível, sem inventar valor.
- Um dado já existente vindo de outra origem, como cadastro manual ou CRM, não é sobrescrito. Os valores coexistem, cada um com a sua origem.
- A captura não é Interação e não é Sinal: não altera o Último contato, não pausa nem retoma Sequências e não torna a Conta-alvo Quente.

#### Vincular a nova conexão ao Contato e à Conta-alvo

A spec atual só define que o Contato guarda a identidade LinkedIn e pertence a uma Conta-alvo. Não há regra de correspondência. Por isso, o que segue é **proposta**, a confirmar:

1. Correspondência pela identidade LinkedIn: identificador nativo (`provider_id`) ou, na falta dele, identificador público. Se a pessoa já é Contato do Workspace, os dados entram nesse Contato.
2. Convite enviado pela Sequência (ticket 07): o Contato já existe e está ligado à Conta-alvo da Sequência. A correspondência é direta.
3. Nova conexão que não é Contato: criar o Contato somente se a empresa atual do perfil corresponder a uma Conta-alvo do Workspace, pela página da empresa no LinkedIn ou pelo domínio. Caso contrário, não criar Contato nem guardar os dados de contato. Uma conexão pessoal ou não relacionada à prospecção não vira registro do Workspace, pela mesma regra aplicada às conversas pessoais.
4. Correspondência ambígua, como homônimos ou mais de uma Conta-alvo possível, não cria nem funde Contatos automaticamente. Fica registrada para revisão do titular.

#### Próximo passo, fora deste ticket: fallback pela Treg

Quando o LinkedIn não entregar e-mail ou telefone, um passo futuro poderá consultar o gateway Treg (treg.to): a rota em cascata de busca de e-mail `treg.people.email.find` a partir da `linkedin_url`, e provedores de telefone como Lusha e ContactOut. Nada disso faz parte deste ticket. Custos, consentimento e marcação de origem desses dados serão especificados à parte.

#### Uso em remarketing: fora de escopo

Os dados capturados se destinam a alimentar públicos personalizados de Meta Ads e Google Ads. Essas Integrações ainda são simuladas no protótipo, e o envio de públicos não faz parte desta entrega. Nenhum dado capturado sai da Althius nesta entrega.

#### Decisões pendentes (aguardando decisão do Renan, não decididas)

- **(a) Base legal na LGPD para usar e-mail e telefone pessoais em públicos de anúncio.** O dado foi compartilhado com o vendedor como conexão, não com a Althius nem com o Cliente para fins de publicidade. Hipótese a avaliar: legítimo interesse, com avaliação documentada (LIA), transparência sobre o uso e opt-out fácil. Antes da decisão, nenhum uso em remarketing é permitido.
- **(b) De quem é o dado: do Workspace ou do vendedor?** O ADR 0008 torna privados ao titular as mensagens e as Propostas de resposta da Conta remetente. Falta decidir se o dado de contato capturado pelo LinkedIn pessoal do vendedor vira dado do Workspace, visível ao time e utilizável em remarketing, ou fica privado ao vendedor. O ADR 0009 (um único Vendedor responsável por Conta-alvo) interage com essa decisão: se o dado for do Workspace, outro participante passaria a ver o contato de uma pessoa cuja Conta-alvo não é dele; se for privado, o remarketing do Workspace dependeria de cada vendedor.
- Proposta provisória, até a decisão (b): gravar os dados com acesso restrito ao titular que os capturou, como o conteúdo privado do ADR 0008, sem expô-los a outros participantes nem a Integrações. Isso preserva as duas saídas possíveis sem vazamento.

## Confiabilidade e limites

- Deduplicar recebimentos por conta externa e identidade estável de mensagem/evento; não contar os ecos dos próprios envios como respostas de Contatos.
- Reservar trabalhos de forma exclusiva, limitar tentativas e registrar motivo e próxima tentativa. Retentativas respeitam janelas e limites retornados pelo provedor.
- Quando houver dúvida se o provedor aceitou um envio, reconciliar antes de reenviar. Se não for possível comprovar, exigir resolução pelo titular; uma fila durável sozinha não garante envio externo exatamente uma vez.
- Reconexão não deve importar toda a caixa de entrada pessoal. A recuperação busca apenas o período e as conversas comerciais relevantes e deduplica eventos recuperados.
- Conteúdo externo é dado não confiável: não altera permissões, responsáveis, destinatários ou regras de pausa.
- Conteúdo e credenciais não aparecem em logs compartilhados, eventos, mensagens de erro para terceiros ou notificações públicas.
- Nenhuma métrica demo, participante fictício ou destino de exemplo pode alimentar o executor real. Métricas reais usam apenas os resultados comprovados.

### Cuidados específicos da Unipile v1

- Webhooks de mensagens usam segredo configurável em header. A documentação pede resposta HTTP 200 em menos de 30 segundos e prevê cinco retentativas. Não copiar autenticação HMAC da v2 para esse contrato.
- `message_received` inclui envios próprios; em e-mail, diferenciar `mail_received`, `mail_sent` e `mail_moved`. Reações, leitura e eventos técnicos não contam como resposta comercial.
- A primeira conexão não entrega todo o histórico via webhooks. Reconexões podem reenviar mensagens recebidas na indisponibilidade; deduplicação e tratamento de eventos fora de ordem são obrigatórios.
- Aceite de convite LinkedIn não equivale a resposta. Uma conversa criada a partir da nota de convite pode conter somente a própria mensagem enviada pelo vendedor.
- A rota v1 de envio de e-mail documenta `Idempotency-Key`, com retenção limitada e não durável em reinícios. Não presumir o mesmo suporte nas rotas de chat; persistir o controle interno de envios em todos os canais.
- `new_relation` (webhook de usuários) não é tempo real: pode chegar até 8 horas depois do aceite. Consultar perfil entra no limite recomendado de cerca de 100 perfis por conta por dia. Polling de relações só poucas vezes ao dia, com intervalos aleatórios.
- Anexos v1 usam multipart; validar capacidade e limite por canal, sem tratar um limite genérico como garantia para todos os provedores.

Referências para esses contratos: [webhooks v1](https://developer.unipile.com/docs/webhooks-2), [e-mails recebidos](https://developer.unipile.com/docs/new-emails-webhook), [ciclo de vida](https://developer.unipile.com/docs/account-lifecycle), [aceite de convites](https://developer.unipile.com/docs/detecting-accepted-invitations), [envio de e-mail](https://developer.unipile.com/reference/mailscontroller_sendmail), [mensagens e anexos](https://developer.unipile.com/docs/send-messages), [detectar convites aceitos / `new_relation`](https://developer.unipile.com/docs/detecting-accepted-invitations), [consultar perfil](https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier), [limites dos provedores](https://developer.unipile.com/docs/provider-limits-and-restrictions).

## Integração com o protótipo

Usar a fronteira existente `FonteDeSequencias` e fontes de Contas/Agentes para preservar as telas. A fonte real precisa expor resumo público separado do documento privado; a interface não deve receber campos privados para depois ocultá-los. Os pontos de entrada estão em `projeto-althius-frontend/src/fonte/`, `src/paginas/detalhe-sequencia.tsx`, `src/paginas/conexoes.tsx`, `src/paginas/aprovacoes.tsx` e `src/main.tsx`.

Preservar tipografia, cores, layout e componentes. Ajustes funcionais autorizados: retirar os três canais fora do escopo; usar os controles existentes para conexão e aprovação; impedir ações de outros participantes; substituir estados e métricas simuladas por resultados reais. Não desenhar dashboard ou caixa de entrada. Se faltar uma superfície indispensável à autenticação ou aprovação privada, apresentar a adaptação mínima antes de alterar o desenho.

## Critérios de aceite

1. Dois vendedores no mesmo Workspace conectam seus próprios canais; um não consegue usar a identidade externa do outro, inclusive por chamada direta ao backend.
2. Duas criações concorrentes para a mesma Conta-alvo resultam em uma única Sequência e um único responsável. Excluir ou recriar um registro não permite roubar a responsabilidade comercial.
3. Um terceiro e um Administrador não conseguem alterar a Sequência, ler corpos/anexos/propostas nem aprovar envios alheios. Outro Workspace não acessa nem os eventos.
4. Uma Sequência aprovada envia pelos três canais suportados, com navegador fechado, respeitando ordem, dias úteis, janela e remetente.
5. Resposta recebida por qualquer um dos canais pausa todos os passos da Conta-alvo; outra empresa segue funcionando.
6. Mensagem enviada pelo próprio titular não é confundida com resposta. Evento repetido não duplica Interação, proposta ou contagem.
7. A IA produz apenas proposta. Sem aprovação do titular não há chamada de envio; com aprovação há um único envio da revisão correta.
8. Aprovar resposta não retoma a cadência. Retomada explícita reprograma sem rajada de atrasados.
9. Desconexão, erro de provedor, falha de IA e remoção da participação preservam histórico e impedem resultados falsos ou uso de credenciais alheias.
10. Lista, Conta-alvo e Conversa refletem o mesmo estado com a visibilidade apropriada. Não há dados demonstrativos apresentados como mensagens reais.
11. Anexos persistem entre sessões e só são enviados quando formato/tamanho são suportados pelo canal conectado.
12. Validar o fluxo real nos destinos indicados pelo usuário e registrar evidências por canal. Testes com mocks não bastam para declarar a integração externa concluída.
13. Uma conexão de LinkedIn aceita gera no máximo uma consulta de perfil por Conta remetente e pessoa. Só com `FIRST_DEGREE`, e-mail e telefone entram no Contato com origem, titular e data. Campos vazios ficam “não disponível no LinkedIn”, e nenhum dado capturado é usado em remarketing antes das decisões pendentes (ticket 13).

## Dependências para validação externa

- Projeto Supabase de destino escolhido pelo usuário: `ycbdilsmydvzezhlymty`, URL `https://ycbdilsmydvzezhlymty.supabase.co`. Reutilizar esse projeto, sem criar outro. Após reconexão, leitura confirmada: nome `Althius Backend`, região `sa-east-1`, estado `ACTIVE_HEALTHY`, nenhuma tabela no schema `public`. Escrita ainda não testada; nenhuma alteração remota foi feita.
- Instância Unipile, versão compatível, credencial no backend e contas pessoais conectadas pelos titulares.
- Serviço/modelo de IA e credencial para geração de propostas; esta especificação não assume que o runtime do Codex seja uma API disponível ao aplicativo.
- Destinatários reais indicados pelo usuário para E-mail, WhatsApp e LinkedIn, com capacidade de acompanhar envio e resposta.
- Autenticação real e duas identidades de teste para verificar isolamento; não usar o usuário fixo da demonstração como autorização.
- Para o ticket 13: uma conexão real de LinkedIn de teste que aceite o convite, de preferência uma com e-mail visível e outra com e-mail “Only visible to me” e sem telefone; e as decisões pendentes (a) e (b) do Renan.

## Referências

- Regras do protótipo: `../sequencias/spec.md`.
- Decisões desta entrevista: `entrevista.md`.
- ADRs 0002, 0003, 0004, 0008 e 0009 em `../../docs/adr/`.
- Captura de contato pelo LinkedIn: `issues/13-contato-do-linkedin-ao-aceitar-conexao.md`; [Unipile: detectar convites aceitos](https://developer.unipile.com/docs/detecting-accepted-invitations), [Unipile: consultar perfil](https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier), [LinkedIn: visibilidade do e-mail](https://www.linkedin.com/help/linkedin/answer/a523134).
- [Unipile: visão geral](https://developer.unipile.com/docs/getting-started), [autenticação hospedada](https://developer.unipile.com/docs/hosted-auth), [mensagens recebidas](https://developer.unipile.com/docs/new-messages-webhook), [aviso da versão v2](https://developer.unipile.com/v2.0/docs/welcome).
- [Supabase: funções de backend](https://supabase.com/docs/guides/functions), [agendamento](https://supabase.com/docs/guides/functions/schedule-functions), [filas](https://supabase.com/docs/guides/queues), [políticas de acesso](https://supabase.com/docs/guides/database/postgres/row-level-security).

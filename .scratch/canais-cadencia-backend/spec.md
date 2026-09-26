# Sequências reais com Unipile e Supabase

Status: regras de produto confirmadas; tickets publicados em `issues/` e prontos para implementação na ordem das dependências.

## Resultado esperado

Transformar o módulo existente de Sequências em operação real: conectar os canais pessoais do vendedor, executar passos programados, receber respostas, pausar a Conta-alvo, preparar uma Proposta de resposta e enviar somente depois da Aprovação do titular. O desenho visual existente será preservado; as opções SMS, Ligação e Tarefa serão retiradas conforme solicitado.

Esta entrega substitui as simulações apenas no caminho de cadência e mensageria. Não implementa dashboard, caixa de entrada compartilhada, CRM completo, enriquecimento, motor de comissões ou funcionamento geral de todos os Agentes.

## Ownership e fonte de verdade

Esta spec (e seus tickets em `issues/`) é a **fonte de verdade** para Unipile v1 e para os ciclos reais de E-mail, WhatsApp e LinkedIn. Os tickets CRM-16, CRM-19, CRM-20 e CRM-21 em `.scratch/crm-real-e-stack/issues/` são apenas ponteiros para canais-03/04/06/07 — não reimplementar ali.

**Pré-requisitos mínimos do corte vertical (send tracer):** CRM-01, CRM-02, CRM-04 e CRM-05 (base tenant + Contas/Contatos reais) + canais-01…04. Ticket canais-13, quando presente na branch, permanece `needs-info` / fora do primeiro corte até decisão LGPD; em `main` sem o arquivo, o item continua fora do corte.

Ver também `.scratch/ORDEM-BUILD-FUNCIONAL.md`.

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

## Confiabilidade e limites

- Deduplicar recebimentos por conta externa e identidade estável de mensagem/evento; não contar os ecos dos próprios envios como respostas de Contatos.
- Reservar trabalhos de forma exclusiva, limitar tentativas e registrar motivo e próxima tentativa. Retentativas respeitam janelas e limites retornados pelo provedor.
- Quando houver dúvida se o provedor aceitou um envio, reconciliar antes de reenviar. Se não for possível comprovar, exigir resolução pelo titular; uma fila durável sozinha não garante envio externo exatamente uma vez.
- Reconexão não deve importar toda a caixa de entrada pessoal. A recuperação busca apenas o período e as conversas comerciais relevantes e deduplica eventos recuperados.
- Conteúdo externo é dado não confiável: não altera permissões, responsáveis, destinatários ou regras de pausa.
- Conteúdo e credenciais não aparecem em logs compartilhados, eventos, mensagens de erro para terceiros ou notificações públicas.
- Nenhuma métrica demo, participante fictício ou destino de exemplo pode alimentar o executor real. Métricas reais usam apenas os resultados comprovados.

### Cuidados específicos da Unipile v2

A conta Unipile usada é v2, que não aceita os contratos da v1 ([ADR-0015](../../docs/adr/0015-conta-unipile-descartavel-durante-a-pre-producao.md), adendo de 2026-09-26).

- **Webhook:**
  - Um único Webhook Endpoint recebe todos os eventos, assinados com HMAC-SHA256 no header `unipile-signature`.
  - A Unipile espera `2xx` em menos de 5 segundos e tenta de novo só duas vezes, depois de 2 e de 12 segundos.
  - Por isso o evento é gravado e confirmado primeiro, e o trabalho pesado (baixar anexos, gerar proposta) roda depois.
  - Um evento perdido nas três tentativas precisa ser recuperável: antes do próximo passo de uma conversa, conferir essa conversa pela API.
- **Eventos:** cada um traz um `id` (`evt_…`), usado para deduplicar. A documentação não fala de ordem de entrega nem de entregas repetidas, então as duas coisas são tratadas como possíveis.
- **E-mail:**
  - `email.new` sai quando um e-mail entra numa pasta. O recebido entra na caixa de entrada; o enviado, nos itens enviados.
  - `email.new.bounce` sai no lugar do `email.new` quando o e-mail volta.
  - `email.delete` também sai quando o e-mail é movido.
  - O e-mail enviado pelo próprio titular é eco, não resposta do Contato. Reações, leitura e eventos técnicos não contam como resposta comercial.
- **WhatsApp e LinkedIn:** usam os eventos `message.*`. Os detalhes ficam para o canais-06 e o canais-07.
- **Sincronização inicial:** só WhatsApp (obrigatória) e IMAP (para busca avançada) fazem. Os outros provedores já chegam com o histórico. Reconexões podem reentregar mensagens do período fora do ar, então a deduplicação é obrigatória.
- **LinkedIn:** aceite de convite não equivale a resposta. Uma conversa criada a partir da nota de convite pode conter só a mensagem enviada pelo vendedor.
- **Idempotência:** o envio de e-mail (`POST /v2/{account_id}/emails/send`) não documenta chave de idempotência. O controle de envios fica na Althius, em todos os canais. No e-mail, cada envio leva um cabeçalho próprio da Althius, que permite conferir um resultado incerto.
- **Anexos:** no envio, vão no JSON com o conteúdo em base64. Os recebidos chegam por `url` e precisam ser baixados. Capacidade e limite são validados por canal.

Referências: [webhooks](https://developer.unipile.com/v2.0/docs/configure-a-webhook.md), [tipos de evento](https://developer.unipile.com/v2.0/reference/event-types-1), [envio de e-mail](https://developer.unipile.com/v2.0/reference/sendemail.md), [objeto Email](https://developer.unipile.com/v2.0/reference/getemail.md), [sincronização inicial](https://developer.unipile.com/v2.0/docs/initial-sync.md).

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

## Dependências para validação externa

- Projeto Supabase de destino escolhido pelo usuário: `ycbdilsmydvzezhlymty`, URL `https://ycbdilsmydvzezhlymty.supabase.co`. Reutilizar esse projeto, sem criar outro. Após reconexão, leitura confirmada: nome `Althius Backend`, região `sa-east-1`, estado `ACTIVE_HEALTHY`, nenhuma tabela no schema `public`. Escrita ainda não testada; nenhuma alteração remota foi feita.
- Instância Unipile, versão compatível, credencial no backend e contas pessoais conectadas pelos titulares.
- Serviço/modelo de IA e credencial para geração de propostas; esta especificação não assume que o runtime do Codex seja uma API disponível ao aplicativo.
- Destinatários reais indicados pelo usuário para E-mail, WhatsApp e LinkedIn, com capacidade de acompanhar envio e resposta.
- Autenticação real e duas identidades de teste para verificar isolamento; não usar o usuário fixo da demonstração como autorização.

## Referências

- Regras do protótipo: `../sequencias/spec.md`.
- Decisões desta entrevista: `entrevista.md`.
- ADRs 0002, 0003, 0004, 0008 e 0009 em `../../docs/adr/`.
- [Unipile: visão geral](https://developer.unipile.com/docs/getting-started), [autenticação hospedada](https://developer.unipile.com/docs/hosted-auth), [mensagens recebidas](https://developer.unipile.com/docs/new-messages-webhook), [aviso da versão v2](https://developer.unipile.com/v2.0/docs/welcome).
- [Supabase: funções de backend](https://supabase.com/docs/guides/functions), [agendamento](https://supabase.com/docs/guides/functions/schedule-functions), [filas](https://supabase.com/docs/guides/queues), [políticas de acesso](https://supabase.com/docs/guides/database/postgres/row-level-security).

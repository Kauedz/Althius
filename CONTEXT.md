# Althius

Althius é um Revenue OS: uma plataforma em que empresas B2B operam o seu go-to-market com a ajuda de agentes especialistas. Os módulos são a aba de Agentes e Contas e Contatos.

## Plataforma

**Revenue OS**:
A plataforma Althius como um todo, composta de módulos; a aba de Agentes é o primeiro.
_Avoid_: CRM, ferramenta de vendas

**Workspace**:
O espaço de trabalho dentro da Althius, com seus agentes, conexões e dados próprios. Pode ser um Workspace pessoal ou um Workspace da empresa.
_Avoid_: conta, tenant, organização

**Workspace operacional**:
Um Workspace real, aberto por uma Conta de usuário autenticada com Participação ativa. Só mostra o que foi guardado e confirmado; um módulo ainda sem backend aparece como indisponível, sem dados, resultados ou ações da Demonstração.

**Demonstração**:
O ambiente de exemplo da Althius, identificado pelo selo "Demonstração", com dados, resultados e roteiros fictícios. Seus dados e seu estado ficam isolados: nada do que acontece nela chega a um Workspace operacional, nem o contrário.
_Avoid_: modo demo

**Workspace pessoal**:
O Workspace próprio de uma Conta de usuário, criado automaticamente no cadastro e inicialmente nomeado com o nome da pessoa. É onde quem se cadastra sem convite começa e configura sua empresa ou projeto. Pode receber participantes por convite e ter seu próprio plano, e permanece disponível quando a pessoa perde acesso a um Workspace da empresa.

**Titular do Workspace pessoal**:
A Conta de usuário para a qual o Workspace pessoal foi criado. É Administrador nele e não pode ser removido nem rebaixado, mesmo por outro Administrador convidado; compartilhar o Workspace pessoal não transfere a titularidade.
_Avoid_: dono, owner

**Workspace da empresa**:
O Workspace de um Cliente, criado por escolha explícita, cujo acesso depende da Participação de cada pessoa. Remover essa Participação encerra o acesso aos dados da empresa, sem transferi-los ao Workspace pessoal.

**Sugestão de Workspace por domínio**:
A indicação de um Workspace da empresa associado ao domínio do e-mail verificado da pessoa. Ajuda a encontrar a empresa, mas não concede Participação nem substitui o convite necessário para acessar seus dados.

**Cliente**:
O negócio cujo go-to-market um Workspace opera, e a referência de seu ICP, Memória do Workspace e Sinais: a empresa dona de um Workspace da empresa, ou a empresa ou projeto que o Titular configurou num Workspace pessoal.
_Avoid_: usuário, conta

**Administrador**:
O papel de acesso de um usuário que gerencia o Workspace e seus participantes. Somente usuários com esse papel podem aprovar ou recusar revisões do ICP e das Personas propostas pelos Agentes.

**Conta de usuário**:
A identidade pessoal de acesso à Althius, com um Workspace pessoal e eventuais Participações em Workspaces da empresa. Remover uma pessoa de um Workspace da empresa não exclui sua Conta de usuário nem seu Workspace pessoal.

**Participação no Workspace**:
O vínculo de uma Conta de usuário com um Workspace, com papel de Administrador ou Membro. Sua remoção encerra o acesso àquele Workspace, preservando a Conta de usuário e outros vínculos.

**Membro**:
O papel de acesso de um usuário que consulta as informações compartilhadas e altera suas próprias preferências, sem administrar o Workspace. Pode solicitar revisões do ICP e das Personas pelos Agentes, mas não aprovar ou recusar essas alterações.

**Convite**:
O pedido de um Administrador para que uma pessoa, identificada pelo e-mail, entre num Workspace com o papel de Administrador ou Membro. Fica pendente até ser aceito, expirar ou ser revogado; só a Conta de usuário com exatamente o e-mail convidado, verificado, o aceita, e só então nasce a Participação. Enquanto pendente, não conta como participante, e o domínio do e-mail nunca o substitui.
_Avoid_: convite por domínio, solicitação de acesso

**Plano do Workspace**:
A situação comercial de um Workspace na Althius, e não de uma Conta de usuário. Todos os participantes consultam o mesmo plano e o uso do Workspace: participantes ativos, sem contar convites pendentes, e Execuções de Agentes num período indicado. O plano é por assento: cada Participante ativo é um assento pago pelo Stripe, e cada fatura paga traz a cota de Créditos dos assentos. Sem plano ativo (nem liberação manual da Althius), o Workspace operacional fecha e só a Demonstração abre; com o pagamento atrasado, segue aberto durante a carência.
_Avoid_: assinatura, plano do usuário

**ICP**:
O perfil de cliente ideal do Cliente, documentado na memória compartilhada do Workspace e utilizado como referência pelos Agentes e módulos da Althius.
_Avoid_: CP

**Memória do Workspace**:
A documentação compartilhada do Cliente, incluindo o ICP e as definições de Personas, que serve de referência para todo o Workspace. É distinta da Memória individual de cada Agente.

**Revisão da Memória do Workspace**:
A proposta de um Agente para substituir o ICP (Scopus) ou as definições de Personas (Ethos), pedida por qualquer participante numa Conversa. É uma categoria de Aprovação que só um Administrador ativo decide: enquanto pendente ou recusada, nada muda; aprovada, substitui o documento vigente e atualiza de uma vez as configurações que dependem dele. Não é uma versão do documento: a Memória do Workspace guarda só o vigente. No Workspace operacional, a revisão é a nova versão de uma seção do Playbook da Especialidade do Agente (o Scopus no ICP e no Mercado; o Ethos nas Personas, no Processo de compra, na Dor e percepção e nas Objeções): aprovada, vira a versão vigente da seção; se a seção mudou antes da decisão, fica desatualizada e não vale mais.
_Avoid_: versão, rascunho

**Conta-alvo**:
Uma empresa que o Cliente quer vender para: recomendada pela Althius ou importada pelo Cliente. A URL da empresa identifica uma Conta já conhecida para atualizar seus dados; compartilhar domínio ou identificador legal, por si só, não mescla Contas. É o objeto que os agentes analisam. "Contas" é aceito só como rótulo curto no menu e na aba.
_Avoid_: lead, prospect, conta

**Roleta de Contas**:
Distribuição automática e rotativa das novas Contas-alvo recomendadas pela Althius entre todos os participantes ativos do Workspace, Administradores e Membros, atribuindo cada Conta a um único Vendedor responsável. Uma recomendação que atualiza uma Conta já registrada não cria outra atribuição.

**Distribuição da importação**:
A ação de um Administrador que, logo depois de uma importação, passa Contas-alvo do lote importado do importador para outros participantes ativos. Cada Conta importada é distribuída uma única vez, até 24 horas depois de importada e enquanto não tem Sequência. Depois disso, a responsabilidade só muda por Transferência de responsabilidade.
_Avoid_: redistribuição, reatribuição

**Importação por CSV**:
O envio de um arquivo CSV com Contas-alvo e, opcionalmente, Contatos. Vira um lote durável: o participante mapeia as colunas, revisa na prévia as Contas novas, as atualizadas, os Contatos que já existem e as linhas inválidas, e só então confirma. O lote é processado em blocos, uma linha de cada vez, e termina num relatório por linha (criadas, atualizadas, vinculadas, ignoradas e com falha), com os erros para baixar. Quem importa é o Vendedor responsável inicial das Contas novas. A URL da empresa encontra a Conta; e-mail, telefone ou LinkedIn encontram o Contato, nunca o nome. Célula vazia nunca apaga dado.
_Avoid_: upload, carga

**Origem do campo**:
Quem escreveu o valor de um campo da Conta-alvo ou do Contato: uma pessoa no app (manual), uma importação ou o enriquecimento automático. Um valor manual só é trocado pelo CSV se quem importa confirmar "substituir dados corrigidos manualmente"; os outros são atualizados. É diferente da origem da Conta (manual, recomendada ou importada).

**Transferência de responsabilidade**:
A ação excepcional de um Administrador que passa uma Conta-alvo a um participante ativo depois que o Vendedor responsável deixou o Workspace. Exige motivo e fica auditada. A Sequência e as Contas remetentes do antigo responsável não vão junto: a Sequência dele é encerrada e o novo responsável cria a dele, com o documento e as Contas remetentes dele.

**Aderência**:
A classificação de encaixe de uma Conta-alvo no ICP pelo Scopus: **Fit** ou **Não fit**. Uma Conta-alvo importada fica sem Aderência até ser avaliada; um Sinal disparado a torna Quente sem determinar esse encaixe.
_Avoid_: momento, temperatura, fit score, nota, score, morna, frio

**Quente**:
A condição de uma Conta-alvo com ao menos um Sinal disparado nos últimos 30 dias, indicando uma razão para prospectar, sem garantir compra nem determinar Fit. O foguinho mostra a quantidade de Sinais válidos; mais sinais não criam novos níveis, e reencontrar o mesmo acontecimento não aumenta a contagem.

**Contato**:
Uma pessoa registrada com identidade única dentro do Workspace, venha de cadastro, importação, enriquecimento ou de um Agente. Sua associação profissional a uma ou mais Contas-alvo é representada por Vínculos do Contato. Uma mesma pessoa pode ter Vínculos ativos com mais de uma Conta-alvo quando atua em ambas. Pode ou não fazer parte do Comitê de compra.
_Avoid_: lead, prospect

**Vínculo do Contato**:
A associação profissional de um Contato com uma Conta-alvo. Um Vínculo pode ser encerrado quando a pessoa deixa a empresa; iniciar outro Vínculo não move Interações anteriores, que permanecem associadas à Conta-alvo onde ocorreram.

**Canais do Contato**:
Os e-mails e os telefones de um Contato: até três de cada. O e-mail tem um rótulo de uma lista fixa (Trabalho, Pessoal ou Outro); o telefone é Celular ou Fixo e traz a marca "usa WhatsApp", independente do tipo. O primeiro de cada lista é o principal (o "número 1"); um e-mail ou telefone pertence a um só Contato do Workspace, entre principal e adicionais. Cada passo da Sequência escolhe qual usar, do número 1 ao 3, e a confirmação fixa esse Destino.
_Avoid_: destinos múltiplos, e-mail secundário

**Arquivamento**:
A saída reversível de uma Conta-alvo ou de um Contato da operação. A Conta arquivada some das listas e buscas padrão, pausa a Sequência (a Sequência pausada pela Conta) e deixa de receber Interação manual, Contato, Vínculo e Sequência novos; o Contato arquivado tem os Vínculos ativos encerrados, e eles voltam quando ele é restaurado. O histórico fica, e o Vendedor responsável ou um Administrador restaura. Restaurar não retoma a Sequência.
_Avoid_: exclusão, soft delete

**Apagamento definitivo**:
A ação, só de um Administrador e com o nome do registro digitado como confirmação, que remove os dados pessoais de uma Conta-alvo ou de um Contato: o Contato some, e a Conta fica só como marcador sem dado da empresa. Some também o que dependia deles (respostas recebidas e anexos, o documento e os Envios das Sequências, as linhas do CSV importado, a Memória dos Agentes que os cita). Ficam apenas os eventos comerciais desidentificados, como o tipo e a data de cada Interação, sem nome, e-mail, telefone nem URL. Não se desfaz.
_Avoid_: arquivar, remover

**Persona**:
A classificação de um Contato por um papel do Comitê de compra descrito pelo Ethos, cuja definição é documentada na Memória do Workspace. Um Contato tem no máximo uma Persona, e pode não ter nenhuma.
_Avoid_: perfil, papel, arquétipo

**Sinal**:
Uma evidência de possível necessidade comercial de uma Conta-alvo relacionada ao que o Cliente oferece, obtida de acontecimentos externos, condições históricas internas ou ações realizadas para investigar essa necessidade. Tem data e, quando houver, fonte e evidência de origem; uma resposta comercial ou a interpretação de seu conteúdo, por si só, não é um Sinal.
_Avoid_: evento, alerta, gatilho

**Sinal externo**:
Um Sinal obtido de acontecimentos ou condições de mercado que o Cliente não provoca, como contratações, investimentos ou mudanças financeiras.

**Sinal interno**:
Um Sinal obtido de condições históricas e temporais dos dados comerciais do Cliente, como uma negociação parada, ausência de resposta ou uma proposta recusada há determinado tempo. A Interação de origem permanece no histórico comercial.

**Sinal originado**:
Um Sinal obtido a partir de uma ação realizada para investigar uma possível necessidade comercial, como um teste de atendimento que identifica ausência de resposta segundo os critérios definidos.

**Monitoramento**:
Uma configuração que define o que acompanhar e em qual público encontrar Sinais, com critérios e prazos ajustáveis ao negócio do Cliente. O Cliente pode manter vários Monitoramentos do mesmo tipo, cada um com nome e critérios próprios, e pausá-los separadamente.

**Interação**:
Um contato comercial registrado entre alguém do Cliente e um Contato: e-mail enviado ou recebido, mensagem enviada, ligação ou reunião. Uma sequência só criada, sem envio, não é Interação. A Interação permanece associada à Conta-alvo onde ocorreu mesmo após encerrar ou mudar o Vínculo do Contato. O "Último contato" de uma Conta-alvo é a Interação mais recente ocorrida com um Contato dela.
_Avoid_: toque, atividade, engajamento

**Comitê de compra**:
O conjunto de pessoas de uma Conta-alvo que influenciam ou decidem a compra.
_Avoid_: buying committee, stakeholders, decisores

**TAM**:
Todas as Contas-alvo de um Workspace, em qualquer Estágio de prospecção. É a base do funil: dela saem as Contas Quentes, as com Fit e as abordadas.
_Avoid_: base total, universo

**Playbook do Workspace**:
A Memória do Workspace estruturada nas seções fixas do playbook do setup (Empresa, ICP, Mercado, Personas, Processo de compra, Dor e percepção, Pipeline, SLA e metas, Rotina, Cadência, Scripts, Templates, Objeções, Frameworks, Apresentação, Negociação e follow-up). Cada seção é versionada; o Administrador edita, e a mudança proposta por um Agente é uma Revisão da Memória do Workspace. Cada Agente lê as seções da sua Especialidade e sempre a seção Empresa.
_Avoid_: manual, documento de vendas

**Estágio de prospecção**:
Onde uma Conta-alvo está no funil de prospecção: Descoberta, Quente, Fit, Em abordagem, Respondeu, Reunião, No CRM ou Descartada. Os eventos (Sinal, Aderência, Envio, resposta, reunião, envio ao CRM) movem o estágio, e a pessoa também move à mão. Depois de Em abordagem, nunca volta para trás, exceto para Descartada.
_Avoid_: status do lead, fase, etapa do pipeline

**Enviar ao CRM**:
Levar uma Conta-alvo, seus Contatos e uma nota com os Sinais e a abordagem para o CRM conectado do Cliente, sob a Permissão de quem envia. Depois do envio, o CRM manda: a Althius só lê de lá o estágio do negócio.
_Avoid_: exportar, converter lead

**Reativação de Sinais**:
A varredura que revisita as Contas-alvo com Fit sem Sinal válido: mensal e automática dentro do Teto aprovado, ou sob pedido pelo botão "Buscar Sinais de novo", com o custo mostrado antes. Cada pedido, do clique ou do mês, é uma **Busca de Sinais** numa Conta: varre a Conta com todos os Monitoramentos ativos do Workspace, mesmo que ela não esteja no público deles, e cada Conta é revisitada no máximo uma vez a cada 30 dias.
_Avoid_: reprocessamento, nova varredura

**Resultado do Envio**:
O desfecho observado de um Envio de passo que saiu: resposta, resposta positiva, resposta negativa, reunião marcada ou oportunidade. Um Envio sem desfecho está sem resposta. A resposta recebida registra "resposta" sozinha; o resto é dito pela pessoa responsável pela Sequência ou por um Agente, e fica quem classificou e quando. Resposta negativa conta como resposta, nunca como sucesso. As taxas por canal e segmento são do Workspace e não saem dele.

**Crédito**:
A unidade de consumo de um Workspace. Gastam créditos a varredura de Sinais, a coleta de pessoas, a revelação de e-mail (só quando traz um e-mail que o Contato ainda não tinha) e cada Execução de Agente. Telefone não se revela. O saldo é único por Workspace, abastecido pelos assentos do plano e por pacotes, com limite por pessoa definido pelo Administrador. Paga o Workspace onde a ação acontece.
_Avoid_: token, saldo de uso

**Teto**:
O limite mensal de Créditos que uma ação automática pode gastar. Nada automático roda sem Teto; ao atingi-lo, a ação volta a pedir confirmação até o próximo ciclo.
_Avoid_: orçamento, budget

**Observador**:
Um participante que só consulta o Workspace: não conecta canais, não gasta Créditos e não ocupa assento pago.
_Avoid_: visitante, leitor

**Setup**:
O serviço de entrada da Althius para um Cliente: monta o Playbook do Workspace, importa a base de pesquisa como Contas-alvo, liga as Integrações e libera o Workspace da empresa.
_Avoid_: onboarding pago, implantação

## Agentes

**Especialidade**:
Um dos quatro tipos fixos de trabalho do catálogo da Althius (Scopus, Ethos, Rhetor, Oraculum). O Cliente não cria Especialidades.
_Avoid_: template, modelo, tipo de agente

**Agente**:
Um trabalhador de uma Especialidade dentro de um Workspace. É um Agente padrão ou um Agente criado.
_Avoid_: bot, assistente, "agente de X"

**Agente padrão**:
O Agente que todo Workspace tem para cada Especialidade, com o nome dela (ex.: "Scopus"). Não pode ser excluído.

**Agente criado**:
Um Agente que o Cliente cria a partir de uma Especialidade, nomeado "Especialidade · complemento" (ex.: "Scopus · Enterprise LATAM"). Começa com uma cópia da Personalização, das Permissões e das Habilidades do Agente padrão, com Memória vazia e sem Rotinas, e pode ser excluído.
_Avoid_: agente personalizado, cópia, clone

**Scopus**:
A Especialidade de ICP: define o perfil de cliente ideal e avalia a Aderência das Contas-alvo.

**Ethos**:
A Especialidade de Persona: descreve dores, objeções e gatilhos de cada papel do Comitê de compra.

**Rhetor**:
A Especialidade de escrita persuasiva: produz e-mails, sequências, posts e copy no tom da marca e por persona.

**Oraculum**:
A Especialidade de GEO (Generative Engine Optimization): mede e melhora como a marca aparece e é citada em respostas de LLMs.
_Avoid_: agente de SEO, agente geográfico

**Personalização**:
Os ajustes que o Cliente faz num Agente: instruções, tom de voz, base de conhecimento, ferramentas e canais. Não inclui renomear o Agente.
_Avoid_: customização

**Memória**:
Os fatos que um Agente aprendeu sobre o Cliente e seus usuários, cada um com origem e editável.

**Habilidade**:
Um procedimento que o Agente criou ou refinou com o uso e passa a reaplicar.
_Avoid_: skill, prompt, template

**Conversa**:
Uma troca entre um usuário e a Althius: direta com um Agente, ou coordenada, quando o pedido é feito sem escolher um Agente e a Coordenação distribui o trabalho. A Conversa é de quem a começou. Cada pedido fica guardado com os seus passos (Agentes chamados, consultas, resposta ou falha) e roda uma vez só: recarregar a página só retoma a leitura.
_Avoid_: chat

**Rotina**:
Uma tarefa agendada que o Agente executa sozinho de forma recorrente.
_Avoid_: automação, cron

**Execução**:
Cada vez que um Agente é acionado (por Conversa, Menção, Coordenação, Rotina ou Canal) e entrega um resultado. A decisão de uma Aprovação não é uma Execução nova: é uma ação dentro da Execução que a propôs.

**Atividade**:
O histórico de tudo que um Agente fez, com o gatilho e o resultado: um item por Execução e um item por ação (agir sozinho pela Permissão Executar ou a decisão de uma Aprovação). O gatilho é o que acionou o trabalho (Conversa, Menção, Coordenação, Rotina ou Canal); uma ação herda o gatilho da Execução que a gerou, onde quer que a Aprovação seja decidida.
_Avoid_: log

**Menção**:
Chamar um Agente com @ no meio de uma Conversa, no estilo Grok. "@Scopus" chama o Agente padrão; um Agente criado é chamado pelo nome completo.

**Colaboração**:
Quando um Agente repassa trabalho a outro por conta própria (ex.: Scopus → Ethos → Rhetor).
_Avoid_: orquestração, pipeline

**Coordenação**:
Quando a Althius, sem ser um Agente e sem nome próprio, divide um pedido de uma Conversa coordenada entre os Agentes necessários e junta as respostas numa só. Um Agente @mencionado no pedido é sempre incluído; um pedido genérico pode ser respondido sem chamar nenhum Agente. A Coordenação não usa Integrações: quem age são os Agentes, cada um com a sua Permissão.
_Avoid_: orquestração, orquestrador, 5º agente

## Sequências

**Sequência**:
O plano de abordagem de uma Conta-alvo, com Contatos participantes e passos ordenados que definem canal, mensagem e momento de contato. Cada Conta-alvo tem no máximo uma Sequência em andamento no Workspace, sob seu vendedor responsável (as encerradas ficam como histórico); lista de Sequências, detalhe da Conta-alvo e Conversa refletem o mesmo plano, respeitando a visibilidade de cada participante.
_Avoid_: cadência como rótulo de interface

**Sequência encerrada**:
A Sequência que o sistema encerrou para sempre porque a responsabilidade da Conta-alvo foi transferida ou a Conta-alvo foi apagada. Não volta a andar nem muda de titular; os passos pendentes são cancelados e fica só como histórico. Quem assume a Conta-alvo cria uma Sequência nova.
_Avoid_: Sequência arquivada, Sequência cancelada

**Sequência pausada pela Conta**:
A Sequência em andamento que foi pausada porque a Conta-alvo foi arquivada. O titular não a retoma enquanto a Conta estiver arquivada; restaurar a Conta só destrava, e reativar os envios continua sendo uma ação explícita do responsável.

**Vendedor responsável**:
O usuário que detém a responsabilidade comercial exclusiva por uma Conta-alvo dentro do Workspace. Outro participante não pode assumir sua prospecção nem criar uma Sequência concorrente para essa Conta-alvo. A responsabilidade só muda pela Distribuição da importação, logo depois de importar, ou por Transferência de responsabilidade, depois que ele deixa o Workspace.

**Canal de abordagem**:
O meio pelo qual um passo da Sequência alcança um Contato: E-mail, LinkedIn ou WhatsApp. É distinto do Canal usado para conversar com um Agente.

**Destino**:
O e-mail, o número de WhatsApp ou o perfil de LinkedIn de um Contato por onde um Canal de abordagem o alcança; nos e-mails e telefones, o passo escolhe um dos Canais do Contato. Um passo só é enviado ao Destino que o Vendedor responsável confirmou, e só enquanto o Contato ainda o tiver.
_Avoid_: endereço de envio

**Responsável pela Sequência**:
O Vendedor responsável pela Conta-alvo, que opera sua Sequência e fornece suas próprias Contas remetentes para todos os passos. Outros participantes do Workspace acompanham eventos e status, sem alterar a Sequência, acessar o conteúdo das mensagens ou aprovar envios em nome dele.

**Conta remetente**:
A identidade de E-mail, LinkedIn ou WhatsApp pertencente a um usuário e conectada para enviar mensagens aos Contatos. As Interações da Sequência pertencem ao Workspace, sem transformar as conversas pessoais do usuário em uma caixa de entrada compartilhada.
_Avoid_: WhatsApp do Workspace, conta compartilhada

**Envio do passo**:
O registro de um passo de E-mail que o Vendedor responsável confirmou, avulso ou pela ativação da Sequência: o Destino fixado na confirmação, a Conta remetente usada, o que o provedor respondeu (`id` e `message_id`), o assunto e o corpo que saíram e a situação — esperando a vez, programado, confirmado, aguardando reconfirmação, enviando, enviado, incerto, falhou, devolvido ou cancelado. A aceitação pelo provedor não é entrega nem leitura. Só o titular lê o Envio; os demais veem a Interação "e-mail enviado" da Conta-alvo.
_Avoid_: disparo, mensagem enviada como sinônimo de entrega

**Versão autorizada**:
A cópia do documento da Sequência que o Vendedor responsável ativou para rodar sem ele ("Ativar envios"). Só o conteúdo dela sai pelo Executor. Editar um passo ainda não enviado revoga a versão, e os envios automáticos param até uma nova ativação. O status "Ativa" herdado da demonstração não é autorização.
_Avoid_: aprovação (reservada à Proposta de resposta), publicar

**Reconciliação da Conta remetente**:
Depois de uma queda ou reconexão de uma Conta remetente, a conferência das conversas que tinham saído por ela, para gravar as respostas que chegaram com a conta fora do ar. Até terminar, nenhum passo sai pela conta.
_Avoid_: ressincronização (é da Unipile), reconexão (é o ato do titular)

**Executor**:
O trabalho do backend que, a cada minuto e com o navegador fechado, envia os passos automáticos cuja hora chegou, revalidando tudo antes de cada envio. Um passo de E-mail manual nunca sai pelo Executor: na hora dele, espera o envio explícito do titular.
_Avoid_: robô, disparador

**Proposta de resposta**:
Uma resposta a um Contato preparada pela IA e sujeita à Aprovação do titular da Conta remetente antes de qualquer envio. Seu conteúdo é restrito ao titular e sua criação não retoma a Sequência pausada da Conta-alvo.

## Conexões e permissões

**Conexão**:
Uma ferramenta externa habilitada no Workspace por um Administrador e usada pelos Agentes autorizados. É um Canal ou uma Integração.

**Canal**:
Uma Conexão onde se conversa com um Agente (ex.: Slack, WhatsApp, Teams, E-mail).
_Avoid_: integração

**Integração**:
Uma Conexão com um app externo, de onde os Agentes leem e para onde escrevem dados sob a Permissão, e que pode alimentar uma Sincronização (ex.: HubSpot, Clay, Apollo, Lusha, Notion, Meta Ads, Google Ads). Habilitá-la no Workspace não dá acesso a ninguém: cada participante entra com o próprio Acesso à Integração.

**Acesso à Integração**:
A autorização que um participante dá, com a própria conta no app externo, para a Althius usar uma Integração habilitada no Workspace. Enxerga só o que essa conta enxerga no app; desconectá-lo não afeta o Acesso dos outros participantes nem os dados já sincronizados.
_Avoid_: conta conectada, credencial, token
_Avoid_: canal, conector

**Identidade externa**:
A referência de uma Conta-alvo ou de um Contato ao objeto correspondente numa Integração, guardada à parte do registro. É por ela que uma Sincronização reencontra o mesmo objeto, mesmo que a URL da empresa ou o e-mail tenham mudado.
_Avoid_: id do HubSpot, external id

**Sincronização**:
A leitura de uma Integração, pelo Acesso à Integração de quem a pede, que cria ou atualiza Contas-alvo, Contatos e Vínculos do Contato no Workspace. Traz só as empresas atribuídas no app a participantes ativos. Só lê e nunca apaga: escrever na Integração é ação de um Agente sujeita à Permissão, um valor vazio no app não apaga o que o Workspace tem, e o que some do app continua no Workspace. Uma Conta-alvo que já existe mantém seu Vendedor responsável.
_Avoid_: importação, sync, integração bidirecional

**Permissão**:
O nível de ação de um Agente sobre uma Integração: **Ler**, **Propor** (exige Aprovação) ou **Executar** (age sozinho).

**Aprovação**:
Uma ação proposta por um Agente que só acontece depois que um humano a aceita, na fila de Aprovações ou no Canal de origem. Guarda o gatilho da Execução que a propôs. Quando um Agente criado é excluído, as Aprovações dele, pendentes ou decididas, são excluídas junto. A Revisão da Memória do Workspace só Administradores decidem. No Workspace operacional, as Aprovações de ação também (decisão do Nan, 2026-10-01): uma pendente vence em 7 dias e vira expirada, quem pediu pode cancelar, e depois de aprovada o servidor confere tudo de novo antes de executar (executada ou falhou). Com a Permissão Executar, a Aprovação já nasce liberada, para ficar auditada.
_Avoid_: revisão, confirmação

**Aviso do Workspace**:
O que a Althius comunica quando uma Aprovação é pedida ou decidida ou uma Execução falha. Vai só a quem diz respeito pela Participação e pelo papel e não dá capacidade de decidir.
_Avoid_: alerta, evento

**Notificação do navegador**:
Um Aviso do Workspace mostrado pelo navegador, com o aplicativo aberto. Recebê-la é preferência da Conta de usuário e depende da permissão do navegador.
_Avoid_: push

# Spec: Stack operacional real do Althius

**Status:** ready-for-agent

**Ownership Unipile / ciclos de canal:** conexão Unipile e os ciclos reais de E-mail, WhatsApp e LinkedIn são implementados por `.scratch/canais-cadencia-backend/` (tickets canais-03, canais-04, canais-06 e canais-07). Esta spec de CRM **não** reimplementa esses fluxos. Os tickets CRM-16, CRM-19, CRM-20 e CRM-21 passam a ser ponteiros para aqueles tickets; o CRM permanece dono de Contas/Contatos, Seq↔Conta UUID, ADRs e demais domínio comercial.

## Problem Statement

O protótipo mostra Contas e Contatos, Agentes e Conversas, Sinais, Configurações, Onboarding, Aprovações e Sequências, mas a maioria das telas ainda recebe dados de fontes simuladas. A única integração de persistência de produto existente é parcial em Sequências. Isso permite que uma tela autenticada mostre resultados demonstrativos como se fossem trabalho real, e os módulos não compartilham uma identidade estável de Workspace, Conta-alvo e Contato.

Precisamos de uma base única e durável para que cada ação apresentada como operacional seja persistida, autorizada, observável e recuperável. A implementação deve reutilizar os fluxos, navegação, estados vazios, filtros, detalhes, aprovações e contratos de tela que já existem. Novos conectores entram sob contratos de domínio, sem espalhar chamadas de fornecedor pelo frontend.

## Solution

Um usuário pode se cadastrar publicamente, verificar e-mail, criar seu Workspace e operar nele como Administrador. Ele pode criar/atualizar Contas-alvo e Contatos, importar CSV, atribuir responsabilidade pela roleta, acompanhar Sinais com fonte verificável, configurar Agentes/permissões e Aprovações, conectar canais pessoais e operar Sequências. Membros convidados entram somente após convite. Os módulos compartilham IDs e projeções; eventos de um módulo aparecem nos outros onde o produto já prevê essa relação.

Não há resultado, execução, aprovação, mensagem, Sinal ou integração de demonstração no Workspace real. O modo Demonstração permanece disponível separado, com marcação explícita e dados isolados.

## User Stories

### Cadastro, acesso e Workspace

1. Como visitante, quero me cadastrar publicamente e verificar meu e-mail, para começar a usar o Althius sem convite.
2. Como novo usuário verificado, quero que meu primeiro acesso crie um Workspace onde sou Administrador, para começar a operar sem provisionamento manual.
3. Como usuário, quero recuperar o acesso à minha identidade, para voltar sem criar uma conta duplicada.
4. Como pessoa convidada para um Workspace, quero aceitar um convite dirigido à minha identidade, para entrar somente no Workspace que me convidou.
5. Como usuário, quero consultar minhas memberships ativas e alternar apenas entre esses Workspaces, para manter os dados de cada Workspace isolados.
6. Como Administrador, quero convidar participantes, alterar seus papéis e removê-los, para controlar o acesso ao Workspace.
7. Como Administrador, quero que o sistema impeça a remoção ou rebaixamento do último Administrador, para que o Workspace continue gerenciável.
8. Como participante removido, quero que minha identidade global permaneça separada da membership removida, para que a remoção não apague minha conta nem reescreva o histórico do Workspace.

### Contas-alvo, Contatos e responsabilidade

9. Como participante, quero criar uma Conta-alvo manualmente, para começar o trabalho comercial sem importar um arquivo.
10. Como participante, quero buscar, filtrar, ordenar, abrir o detalhe da Conta e voltar mantendo o contexto da lista, para continuar usando o fluxo existente com dados reais.
11. Como participante, quero consultar Sinais, Contatos e Interações no detalhe da Conta, para ver o contexto comercial relacionado em um só lugar.
12. Como participante, quero que a URL da empresa encontre uma Conta existente para atualização, para que importações repetidas não criem empresas duplicadas.
13. Como participante, quero que domínio ou identificador legal isolados não mesclem Contas, para manter organizações distintas separadas até que a URL canônica corresponda.
14. Como participante ativo, quero que uma Conta nova seja atribuída atomicamente pela roleta entre Administradores e Membros ativos, para distribuir responsabilidades de forma rotativa.
15. Como participante, quero que atualizar uma Conta existente não consuma outra atribuição da roleta, para não distorcer a distribuição.
16. Como Administrador, quero distribuir linhas importadas entre participantes ativos, para organizar a responsabilidade por grandes importações.
17. Como Administrador, quero transferir uma Conta somente como exceção auditada quando seu responsável sair, para manter a cobertura sem reatribuição silenciosa.
18. Como participante, quero criar e editar Contas sob minha responsabilidade e seus Contatos, para que o fluxo normal respeite as responsabilidades.
19. Como participante, quero uma identidade canônica de Contato no Workspace com um ou mais vínculos com empresas, para representar corretamente uma pessoa que atua em várias empresas.
20. Como participante, quero encerrar um vínculo e criar outro quando a pessoa mudar de empresa, para manter as Interações anteriores na empresa onde ocorreram.
21. Como participante que importa um Contato, quero escolher entre atualizar campos, adicionar um vínculo ou transferi-lo, para que uma correspondência por nome não mescle nem mova a pessoa silenciosamente.
22. Como participante, quero arquivar uma Conta ou Contato de forma reversível, para tirar registros inativos das listas normais sem perder o histórico.
23. Como usuário autorizado, quero que o apagamento permanente remova dados pessoais e passos pendentes, preservando apenas eventos comerciais anonimizados, para ter um resultado de privacidade definido.

### Importação, procedência e fotos

24. Como participante, quero enviar um CSV de forma privada e pré-visualizar linhas mapeadas e erros, para corrigir os dados antes de afetar o Workspace.
25. Como participante, quero validar URL da empresa e nome obrigatório do Contato, mantendo LinkedIn, telefone e e-mail opcionais, para que canais ausentes não bloqueiem trabalho de CRM sem relação.
26. Como participante, quero que campos não vazios do CSV atualizem os campos mapeados e campos vazios não apaguem dados salvos, para repetir importações com segurança.
27. Como participante, quero que o enriquecimento automático preencha campos vazios e preserve correções manuais até eu confirmar a substituição, para manter clara a origem e a confiabilidade dos dados.
28. Como participante, quero que importações sejam processadas em lotes duráveis e retomáveis e mostrem linhas criadas, atualizadas, vinculadas, ignoradas e com falha, para recuperar importações interrompidas.
29. Como participante, quero consultar a foto de perfil do LinkedIn por meio do Actor selecionado do Apify usando a URL do Contato, para exibir imagens reais quando estiverem disponíveis.
30. Como participante, quero que o avatar use o fallback visual atual quando não houver imagem recuperável, para manter a lista funcional sem inventar uma foto.
31. Como participante, quero limitar custo e frequência das consultas de foto/perfil e não executá-las ao renderizar cada lista, para que abrir uma tela não dispare operações descontroladas no provedor.

### Sinais

32. Como participante, quero configurar Monitoramentos independentes de Sinais, para executar e pausar cada público e critério separadamente.
33. Como participante, quero que a coleta de Sinais por Actors habilitados do Apify salve fonte, evidência, data de observação e identidade de deduplicação, para verificar os Sinais encontrados.
34. Como participante, quero que Sinais internos venham de Interações reais e Sinais externos somente de execuções concluídas de provedores, para que resultados simulados nunca apareçam como reais.
35. Como participante, quero ver Sinais válidos no módulo de Sinais e na Conta relacionada, para compartilhar a mesma evidência entre os fluxos.
36. Como participante, quero que observações duplicadas do mesmo acontecimento não renovem sua validade de 30 dias, para manter o estado Quente confiável.
37. Como participante, quero que um Sinal válido torne a Conta Quente independentemente de Fit/Não fit, para manter urgência e aderência ao ICP como conceitos separados.

### Agentes, Conversas, Configurações e Aprovações

38. Como participante, quero gerenciar Especialidades fixas e Agentes criados no Workspace com configurações persistentes, para manter consistente o modelo atual de Agentes.
39. Como participante, quero persistir permissões de Agentes por integração como Ler, Propor ou Executar, para explicitar a autoridade de cada Agente.
40. Como participante, quero persistir Conversas, @menções, etapas de Coordenação, chamadas de ferramentas e resultados, para inspecionar e retomar trabalho real.
41. Como participante, quero que chamadas a modelos e provedores ocorram no backend e usem somente contexto autorizado do Workspace, para proteger segredos e fronteiras entre tenants.
42. Como participante, quero retomar uma execução de Conversa ou consultar seu estado final após atualizar/desconectar, para que interrupções de streaming não percam trabalho nem dupliquem ações.
43. Como participante, quero que propostas que exigem aprovação entrem em uma fila durável, para impedir que Agentes contornem as permissões configuradas.
44. Como aprovador autorizado, quero que a aprovação fique vinculada à ação e ao payload exatos, para exigir nova aprovação quando a ação mudar materialmente.
45. Como Administrador, quero que alterações aprovadas de ICP e Persona sigam as regras atuais de revisão e propagação, para manter consistente a orientação do Workspace.
46. Como participante, quero persistir perfil, preferências do Workspace, tema e notificações, para manter minhas configurações entre sessões e dispositivos.
47. Como participante, quero que plano/consumo demonstrativos e cartões de provedores não implementados estejam identificados como demonstração, para não confundi-los com billing ou integrações reais.

### Sequências e canais

48. Como vendedor responsável, quero criar e operar no máximo uma Sequência para minha Conta, para preservar a regra atual de responsabilidade exclusiva.
49. Como vendedor responsável, quero manter documento e destinatários da Sequência privados, compartilhando com o Workspace somente status e eventos permitidos, para proteger conteúdo de remetente pessoal.
50. Como titular de uma conta remetente, quero conectar e reconectar canais pessoais via Unipile e ver o estado confirmado pelo provedor, para não exibir como pronta uma conexão revogada ou desatualizada.
51. Como participante, quero executar etapas da Sequência em jobs duráveis com envio idempotente e reconciliação, para que tentativas repetidas não enviem mensagens duplicadas.
52. Como titular de uma conta remetente, quero que respostas recebidas pausem a Sequência inteira da Conta e que propostas de resposta exijam minha aprovação, para manter o outbound sob controle humano.
53. Como Administrador restaurando uma Conta arquivada, quero exigir confirmação explícita do vendedor responsável para retomar a Sequência, para que o trabalho pausado não recomece inesperadamente.
54. Como participante, quero bloquear uma ação somente quando faltar o destino exigido por seu canal, para que a ausência de e-mail/telefone/LinkedIn não bloqueie ações sem relação.

### Integridade, segurança e operação

55. Como participante de um Workspace, quero que todo registro operacional, evento, job e arquivo pertença ao meu Workspace, para que outros Workspaces não possam lê-los ou alterá-los.
56. Como operador, quero que comandos privilegiados e callbacks de provedores validem identidade, membership, responsabilidade, assinatura e idempotência, para que o estado no cliente não conceda acesso.
57. Como operador, quero implantar migrations, funções, tipos gerados, segredos, filas, agendamentos e políticas de Storage de forma consistente por ambiente, para que o sucesso local não esconda uma capacidade ausente em produção.
58. Como participante, quero que modo real e modo Demonstração usem fontes isoladas e identidade clara, para impedir que fixtures entrem em registros de produção.
59. Como participante, quero estados acionáveis de carregamento, vazio, falha, nova tentativa, permissão e conexão em cada tela existente, para entender falhas de rede ou provedor.

## Implementation Decisions

**Escopo funcional:** tornar reais cadastro/Auth, Workspaces/People, Contas, Contatos, importação, roleta, Configurações, Agentes, Conversas, Aprovações, Sinais, Conexões e Sequências na mesma aplicação. Billing, checkout e conteúdo informativo/legal ficam fora.

**Seams para integração e validação:** manter telas e contratos `Fonte*` como seam mais alto; a composição do app autenticado injeta adapters reais pelo Workspace e o modo Demonstração injeta fontes isoladas. Validar pelo app renderizado e dirigido como usuário, atravessando os fluxos que ligam os módulos. Não criar seams de teste por implementação interna sem necessidade demonstrada.

### Decisões de arquitetura, produto e dados

### Princípios de produto

1. **Preservar o produto existente:** manter layout, conteúdo, navegação e comportamentos já aprovados. Mudanças visuais só quando necessárias para estados reais de carregamento, permissão, erro, conexão e confirmação.
2. **Real significa verificável:** só declarar uma ação concluída depois de persistir/confirmar sua operação. Mostrar origem, estado e erro de integração; nunca substituir falha por fixture.
3. **Uma identidade canônica:** Auth identifica a pessoa; Membership liga a pessoa ao Workspace; Conta-alvo e Contato têm UUIDs canônicos; integrações e remetentes são relações separadas.
4. **Workspace é a fronteira de dados:** todo registro operacional de cliente pertence a um Workspace e é protegido no banco por RLS e comandos de servidor para transições multi-registro.
5. **Permissões explícitas:** Administrador e Membro são os únicos papéis. Permissões de Agentes por integração continuam Ler/Propor/Executar; Propor cria aprovação quando assim definido; Agente não contorna essas permissões.
6. **Dados por campo e procedência:** guardar origem e momento de atualização para valores importados/enriquecidos. CSV atualiza campos mapeados não vazios; preenchimento automático completa vazios; uma fonte externa não sobrepõe correção manual sem confirmação.
7. **Conectores substituíveis:** cada integração implementa um contrato do domínio, com credenciais no backend, limites, idempotência, auditoria, health/status e política de remoção.
8. **Processamento durável:** importação, coleta de Sinais, cadências, webhooks, reconciliação e tarefas longas usam jobs/filas e podem ser retomados sem duplicar efeitos.

### Experiência e comportamentos a preservar

O inventário de telas foi feito nas specs e issues existentes de Contas e Contatos, Agentes, Sinais, Configurações, Onboarding e Sequências, além das ADRs 0001–0009. A implementação deve conservar:

- Contas: busca/filtros/ordenação, tabela, detalhe, Sinais/Contatos/Interações, estados vazios/erro, retorno mantendo busca e posição.
- Contatos: listagem, busca/filtros, disponibilidade de canais, navegação para Conta-alvo e fallback atual de avatar quando não há imagem.
- Agentes: grade, especialidades fixas, Agentes criados, Memória, Habilidades, Rotinas, permissões, atividade e ações permitidas.
- Conversas/Coordenação: pedidos, @menções, colaboração entre Agentes, histórico, execução em streaming e saída consolidada, sem atribuir ações à Coordenação como se fosse um Agente.
- Sinais: catálogo, Monitoramentos independentes, rascunho/ativo/pausado, execuções/resultados, origem/evidência, deduplicação e histórico da Conta.
- Configurações: perfil, Workspace, participantes/convites, papéis, ICP/Personas, revisões/aprovações, tema e notificações. Plano/consumo permanece demonstrativo até escopo de billing.
- Onboarding: entrada de criador/convidado, verificação, progresso recuperável e checklist existente. Texto instrucional continua conteúdo; leitura de site/IA só é real quando há execução real.
- Sequências: lista/detalhe, documento privado, destinatários, canais, janelas/delays, aprovação humana, estado por Conta-alvo, resposta pausa a Sequência inteira e conteúdo de mensagem privado.

Portas `Fonte*` já existentes devem ser preservadas como costura de UI/adapters onde forem úteis. Não é necessário manter a interface monolítica atual de `FonteDeAgentes` internamente: comandos e leituras podem ser separados por domínio atrás de uma fachada compatível. Nenhum componente deve chamar Supabase ou SDK de fornecedor diretamente.

### Regras de domínio confirmadas

#### Identidade e Workspace

- Cadastro público sem convite cria uma identidade Auth verificada e, no primeiro acesso do novo usuário, um Workspace próprio com Membership Administrador.
- A entrada em Workspace já existente é somente por convite dirigido à identidade/e-mail, com aceite autenticado. Domínio de e-mail não concede acesso automaticamente.
- Remover uma Membership não apaga a identidade global nem o histórico comercial do Workspace.
- Impedir remoção/rebaixamento do último Administrador.
- Estado de convite (pendente, aceito, expirado, revogado) e alterações de papel ficam auditáveis.

#### Contas-alvo e roleta

- URL canônica da empresa é a chave de correspondência para atualização; domínio e identificador legal sozinhos nunca mesclam registros.
- Se uma Conta for encontrada pela URL, atualizar o registro; não criar outra nem consumir a roleta.
- Conta nova recomendada pela Althius entra automaticamente na roleta de todos os participantes ativos (Administradores e Membros) e recebe um único responsável. Criação manual atribui ao criador; importação atribui ao importador por padrão, com distribuição de linhas feita por Administrador.
- Regra da roleta: distribuição rotativa e determinística entre participantes ativos, com estado persistido e atribuição atômica. Mudanças na lista de participantes não devem perder o histórico nem permitir duas atribuições concorrentes. Auditoria registra participantes elegíveis, cursor anterior/novo, origem e responsável.
- Depois da atribuição inicial, a responsabilidade não pode ser alterada no fluxo normal.
- Só em saída de membro o Administrador pode transferir responsabilidade para membro ativo, como exceção auditada. Integrações/remetentes não são transferidos junto.
- Arquivar Conta com Sequência ativa pausa a Sequência, cancela passos pendentes, preserva histórico; reativação requer confirmação explícita do responsável.

#### Contatos e privacidade

- Uma identidade de Contato por Workspace, associada a Contas por Vínculos do Contato. A mesma pessoa pode ter vínculos ativos simultâneos quando realmente trabalha para mais de uma empresa.
- Mudança de empresa encerra o vínculo anterior e abre o novo; Interações históricas ficam na Conta onde ocorreram.
- CSV que encontra um Contato existente apresenta opções claras de atualizar campos, adicionar vínculo à Conta ou transferir vínculo (encerrando o anterior); não deduplica só pelo nome.
- Admin atribui/redistribui linhas importadas. Membro cria/edita Contas sob sua responsabilidade e seus Contatos. Todos os participantes ativos consultam os dados comerciais compartilhados; conteúdo privado de remetentes e Sequências segue a ADR-0008.
- Arquivar é reversível. Apagamento permanente é ação distinta, remove PII e passos pendentes, e mantém somente eventos comerciais desidentificados. Aplicar cascata/anonimização no backend, com registro de auditoria sem PII residual.

#### Fotos e enriquecimento LinkedIn

- Apify é o provedor escolhido para consultar foto pública de perfil do LinkedIn a partir da URL LinkedIn já informada para o Contato. A integração roda no backend por Actor selecionado e validado; token Apify não vai ao browser. O resultado é opcional, pode incluir URL de imagem e campos ausentes, e registra Actor, execução, origem e data de observação.
- Solicitar/atualizar foto sob demanda ou por job controlado, nunca executar uma varredura de perfis ao abrir a lista. Deduplicar por identidade/URL normalizada, limitar concorrência e custo, tratar retries e perfis inacessíveis sem criar imagem fictícia.
- A foto pode estar ausente, indisponível ou expirada. Nesse caso, exibir o fallback visual atual (iniciais/avatar padrão) e manter o restante do Contato funcional.
- Não tratar URL de foto do Actor como permanente. Armazenamento/cache durável e prazo de retenção/remoção precisam ser compatíveis com o Actor escolhido e as regras aplicáveis. Enquanto isso, persistir estado/origem e atualizar via nova consulta quando solicitada.
- Dados retornados seguem procedência, data de observação e as regras de sobrescrita por campo; valores de origem automática completam vazios e não sobrepõem correções manuais sem confirmação.

#### Sinais

- Sinal válido é um fato observado, com categoria, fonte/conector, URL ou referência de evidência, observado-em, identificador de dedupe, confiança/qualidade quando fornecida e Conta relacionada.
- Catálogo e definição de Monitoramento são configuração; execução de coleta, resultado e evidência são registros distintos.
- Duplicata do mesmo evento não renova validade; Sinal válido torna Conta Quente por 30 dias independentemente de Fit/Não fit (ADR-0007).
- Sinais internos usam eventos reais de Interação; Sinais externos só são marcados como coletados quando um conector habilitado retorna evidência válida. Monitoramentos sem fornecedor configurado não simulam resultados.
- Catálogo de fontes não equivale a contrato de coleta. Apify é o primeiro provedor de coleta externa; cada Actor habilitado requer escolha de fonte, autorização, custo/limites, retenção, dedupe e critério de qualidade antes de ativar produção.

#### Agentes, Conversas, Aprovações e Integrações

- Conversas, execuções, passos, ferramentas invocadas, propostas e aprovações têm identidade de Workspace/ator, estado durável e resultado/erro rastreável.
- Requisições a modelos e provedores ocorrem no backend. Histórico e dados enviados ao modelo seguem minimização e política de acesso por Workspace.
- Streaming da UI pode usar transporte streaming ou eventos Realtime sobre execução persistida. Recarregar/desconectar permite retomar ou consultar o estado final sem duplicar execução.
- A Coordenação roteia Agentes e não executa ações externas por conta própria (ADR-0004). Permissões por integração e estado da Aprovação são verificados no servidor imediatamente antes da ação.
- Aprovação é vínculo entre proposta, ator autorizado, escopo, payload e expiração/decisão. Mudança material no payload exige nova aprovação. Rejeição/cancelamento/auditoria ficam persistidos.
- Conexões de CRM/ferramentas simuladas continuam como itens demonstrativos até cada fornecedor ter contrato e decisão próprios. Supabase e Unipile são as bases já escolhidas; Unipile cobre canais pessoais, não coleta genérica de Sinais.

#### Sequências e canais

- A Conta-alvo tem no máximo uma Sequência e um Vendedor responsável exclusivo, conforme ADR-0009 e tickets de canais.
- Credenciais e conteúdo privado de remetente/caixa ficam privados ao titular; Workspace compartilha eventos e status previstos, não conteúdo pessoal da mensagem (ADR-0008).
- Resposta recebida pausa a Sequência da Conta inteira. Proposta de resposta requer aprovação do titular e aprovação não retoma automaticamente a Sequência.
- Nunca mudar titular/remetente por roleta ou transferência comercial. Revogação, reconexão e reconciliação são estados explícitos.
- Unipile v1 é o primeiro conector de canais pessoais. Autenticação hosted e consulta de status já têm código local parcial; recebimento, envio, filas, cadenciador, reconciliação e deploy remoto ainda precisam ser implementados — **na spec de canais** (`.scratch/canais-cadencia-backend/`), não reimplementados aqui.

### Arquitetura alvo

#### Stack e limites

- **Supabase Auth:** identidade, verificação, sessão e recuperação de acesso.
- **Postgres:** fonte de verdade operacional multi-tenant, com UUIDs permanentes, chaves estrangeiras, `workspace_id`, constraints e RLS. RPCs transacionais para bootstrap do Workspace, convite/aceite, roleta/transferência, import commit, arquivamento e apagamento/anonymização.
- **Edge Functions:** operações privilegiadas, modelo/fornecedor, assinatura/validação de webhook, início de OAuth/Hosted Auth e comandos que exigem segredo. Validar JWT/membership para tráfego de usuário; callbacks/webhooks validam assinatura própria. `service_role` nunca chega ao browser.
- **Supabase Storage privado:** CSV temporário, documentos e anexos protegidos por Workspace/titular, URLs assinadas curtas e políticas de retenção/apagamento.
- **Supabase Queues/PGMQ + Cron + workers:** tarefas duráveis de importação, coleta de Sinais, processamento de mensagens, execução de Sequências, callbacks e reconciliação. Claim/lease, idempotência, retry/backoff, dead-letter, concorrência limitada e logs correlacionados.
- **Realtime/stream:** atualização de estado e feed da UI a partir de registros persistidos, sem ser a fonte primária da verdade.
- **Frontend:** preserva componentes e portas `Fonte*`; composition root escolhe adapter real por Workspace autenticado ou adapter demo isolado. DTOs/projeções compatíveis com telas. Geração de tipos Supabase e migrações versionadas mantêm contrato sincronizado.
- **Conectores:** `SignalProvider`, `ChannelProvider`, `EnrichmentProvider` e `ModelProvider` isolados, com capacidades declaradas, estado de conexão, rate limits, política de dados e mapa de erros para linguagem de produto.

#### Modelo de dados lógico

Entidades base: `profiles`, `workspaces`, `workspace_memberships`, `workspace_invitations`, `accounts`, `account_responsibilities`, `contacts`, `contact_account_links`, `account_field_sources`/procedência por campo, `contact_field_sources`, `interactions`, `import_batches`, `import_rows`, `signals_catalog`, `signal_monitors`, `signal_runs`, `detected_signals`, `agents`, `agent_settings`, `agent_permissions`, `conversations`, `conversation_messages`, `agent_executions`, `execution_events`, `proposals`, `approvals`, `provider_connections`, `sender_accounts`, `sequences`, `sequence_documents`, `sequence_steps`, `delivery_events`, `audit_events` e registros de jobs.

O modelo físico pode separar/especializar relações para minimizar duplicação, mas deve conservar as invariantes. `sequences.target_account_id` e `sales_responsibilities.target_account_id` hoje são textuais e precisam de migração para FK UUID, com estratégia compatível e validação antes de trocar adapters. Tabelas e views da demo não se misturam ao schema de produção.

#### Segurança e observabilidade

- RLS deny-by-default; testar isolamento entre dois Workspaces e ausência de privilégio de usuário sem membership ativa.
- Toda transição privilegiada também verifica autorização no servidor/RPC; frontend não decide papel ou atribuição.
- Chaves secretas somente em secrets de ambiente/backend. Dados de mensagem, documentos e tokens têm política de acesso menor que dados de Conta compartilhados.
- `audit_events` guarda ator, Workspace, ação, alvo, resultado, timestamp, correlação e origem sem copiar segredos/PII desnecessária.
- Métricas operacionais: taxa de sucesso/falha por provider/job, tentativas, atraso de fila, dedupe, reconexão, import rows, custo/limite quando disponível. Erros apresentados no módulo dono do fluxo.

### Resolução de origem e atualização de dados

Para cada campo externo/importado guardar origem, identificador da fonte, horário da observação/importação e se houve correção manual. Dados manuais confirmados têm precedência. CSV só atualiza campo mapeado com valor não vazio; campos vazios do CSV nunca limpam dados existentes. Enriquecimento automático preenche campo vazio e registra a fonte; divergência com dado manual apresenta revisão/solicita confirmação. A origem de um campo não deve ser confundida com a origem geral da Conta.

### Importação CSV

1. Upload privado inicia `import_batch`; não grava linhas de negócio diretamente pelo browser.
2. Leitura/preview detecta delimitador/cabeçalho, permite mapear colunas, valida erros por linha e faz prévia de correspondências por URL de empresa e identidade de contato.
3. Nome e URL da empresa são obrigatórios; nome do Contato é obrigatório quando aquela linha cria/atualiza Contato. LinkedIn, telefone e e-mail são opcionais. Ausência de canal só bloqueia ação que dependa daquele canal.
4. Usuário revisa updates, vínculos de Contato, transferências e linhas inválidas antes de confirmar. Confirmação cria um job durável por lotes idempotentes.
5. Importador é atribuição inicial padrão; Administrador pode distribuir linhas entre membros ativos. Relatório mostra criadas/atualizadas/vinculadas/ignoradas/falhas e permite baixar erros.

### Fases de entrega

As fases são incrementais na mesma aplicação, banco e contratos. Um módulo só muda para modo real quando suas migrações, RLS, backend, adapter, configuração, observabilidade e fluxos de erro estão implantados juntos.

#### Fase 0 — Base de tenant e corte demo/real

Auth real, cadastro público, verificação, criação atômica de Workspace/Admin, convite/aceite, composição demo versus real, políticas RLS, IDs UUID, auditoria, feature flags por módulo e ambiente remoto/local sincronizados.

#### Fase 1 — Workspace, Pessoas e CRM core

Perfil, participantes, papéis, Contas, Contatos/vínculos, origem por campo, CRUD manual, busca/detalhe e navegação atuais, CSV assíncrono, responsabilidades e roleta. Ligar telas existentes aos adapters Supabase. Esta fase oferece o primeiro Workspace utilizável e dados comerciais consistentes.

#### Fase 2 — Sinais verificáveis e projeções em Contas

Persistir catálogo/Monitoramentos/execuções/resultados, Sinais internos baseados em Interações, histórico na Conta e derivação de Quente. Implementar o primeiro `SignalProvider` sobre Apify Actors, habilitado por Actor/fonte após validar custo, limites, retenção e qualidade. A mesma projeção alimenta as telas de Sinais e Contas.

#### Fase 3 — Configurações, Aprovações, Agentes e Conversas reais

Preferências, ICP/Personas com versão aprovada segundo spec, Agents e permissões, execução real backend, histórico durável, streaming retomável, propostas e aprovações verificadas. Só capacidades com modelo/ferramenta configurados aparecem como disponíveis.

#### Fase 4 — Sequências e canais pessoais ponta a ponta

Migrar FKs de Sequências para Accounts UUID (ticket CRM-17) e manter Seq↔Conta, responsabilidade exclusiva e ADRs no domínio CRM. O trabalho Unipile v1 (conexão, callbacks, status, reconexão/revogação, envio/recebimento, filas/cadenciador, conteúdo privado, eventos compartilhados, respostas e aprovação do titular) é **consumido** da spec `.scratch/canais-cadencia-backend/` — CRM não reimplementa. Nenhum envio ocorre sem destinatário/canal disponível e permissão.

**Ordem recomendada:** Fases 0–1 (CRM-01 → 02 → 04 → 05, + CRM-17 se a FK textual bloquear) → canais-01…04 para o primeiro send tracer. Fases 2–3 (Sinais/Agentes) podem vir depois do tracer se o objetivo imediato for envio real cedo.

#### Fase 5 — Enriquecimento e conectores adicionais

Foto/logotipo/enriquecimento, Actors/fontes adicionais de Sinais via Apify, CRM/ferramentas, relatórios operacionais e otimizações entram conforme fornecedor, permissão, custo e ticket aprovados. A interface de conector permite habilitar fontes progressivamente sem alterar o modelo compartilhado.

### Critérios de aceite de produto

- Um novo usuário consegue cadastrar, verificar e obter Workspace/Admin próprio sem poder descobrir/entrar em Workspace alheio.
- Usuário convidado só entra após aceite de convite válido e autenticado; Admin/Membro são aplicados no backend.
- Duas sessões de Workspaces distintos não leem/escrevem dados uma da outra, inclusive Storage, jobs, realtime e funções.
- Contas, Contatos, vínculos, Sinais, Interações e responsabilidade mantêm UUIDs consistentes em todas as telas e Sequências.
- Regra de URL, fontes por campo, CSV sem limpeza acidental, vínculos e atribuição pela roleta são verificáveis e auditados.
- A roleta não duplica nem perde atribuição em requisições concorrentes; só participantes ativos entram; URL já existente não avança cursor.
- Arquivamento, restauração e apagamento seguem regras aprovadas; passos pendentes cancelados e PII removida conforme pedido.
- Todos os estados de tela atuais continuam corretos com dados reais: carregando, vazio, falha, retry, filtros, navegação de retorno e erro de entidade ausente.
- Workspaces reais não recebem fixtures nem resultados roteirizados. Demo mantém o selo e banco/fonte separados.
- Foto pública consultada via Apify é exibida quando disponível; foto ausente/expirada usa o fallback visual atual e não quebra contato nem lista.
- Sinal exibido como real possui fonte/evidência/data; duplicata não renova Quente; estado aparece coerente na listagem e detalhe da Conta.
- Conversa, execução, proposta e aprovação podem ser retomadas após refresh e não são duplicadas por retry.
- Conexões e Sequências mostram estado confirmado pelo provider; falha ou credencial revogada nunca aparece como pronto.
- Build local/remoto usa o mesmo histórico versionado de migrations/functions, tipos e secrets explicitamente provisionados por ambiente.

### Dependências e riscos observáveis

- Projeto Supabase consultado `ycbdilsmydvzezhlymty`: estado observado em 2026-09-25 contém três migrations remotas, quatro tabelas parciais (`workspace_memberships`, `sales_responsibilities`, `sequences`, `private.sequence_documents`), todas sem linhas, e nenhuma Edge Function implantada. Código/migrations locais adicionais não equivalem a implantação remota.
- O schema geral de Workspaces/Contas/Contatos ainda precisa ser criado e integrado; ownership de Sequências e responsabilidades precisa migrar de IDs textuais.
- Apify foi escolhido como provedor inicial de coleta externa de Sinais e de consulta de fotos públicas por URL LinkedIn. Actors e fontes concretos ainda exigem validação de termos, qualidade, custo, latência e retenção antes de execução em produção.
- Unipile pode retornar foto de perfil em contexto compatível; retorno é opcional e a URL pode expirar. Não prometer cobertura universal nem cache permanente antes de verificar contrato vigente e retenção.
- Integrações listadas na demo (HubSpot, Clay, Apollo, Lusha, Notion, Meta Ads, Google Ads) não estão aprovadas como conectores reais por aparecerem na UI.
- Provisionamento remoto (migrations, functions, Auth URLs, provider secrets, cron/queues e storage) é parte necessária da entrega, não substituível por validação local.

## Testing Decisions

- Um bom teste verifica o comportamento observável na interface e os efeitos persistidos/retornados por uma operação real; não depende de nomes de componentes, hooks, tabelas internas ou detalhes do SDK.
- O seam principal será o app renderizado e operado como usuário, com adapters de domínio reais e isolados por Workspace. Os fluxos prioritários atravessam cadastro → Workspace → Conta/Contato → import/roleta → Sinal → Agente/Aprovação → Sequência/canal.
- Testes de integração de banco e funções validam RLS, membership, último Administrador, ownership, constraints, idempotência, roleta concorrente, anonimização, callbacks assinados e separação de conteúdo privado. Cobrem contratos de segurança no servidor, além da experiência visível.
- Testes de provider usam fixtures contratuais para respostas/erros de Apify e Unipile e verificam normalização, ausência de foto, URL expirada, rate limit, retries e deduplicação sem depender de serviço externo em cada execução.
- Testes end-to-end exercitam signup, verificação/retorno, convite, CSV com preview e commit, Conta/Contato, Sinal e a jornada de Sequência com estados de conexão e aprovação. Ter um workspace/demo seed isolado não autoriza compartilhar fixtures no modo real.
- Priorizar os testes comportamentais já usados pelo frontend renderizado, migrações/pgTAP de Supabase e os testes de integração das Edge Functions; expandir cobertura somente junto a cada ticket funcional.
- Execução real depende de credenciais/ambiente de teste para Auth, Supabase, Apify e Unipile. Teste com stub prova contrato; só teste contra provider prova credenciais, permissão e configuração remota.

## Out of Scope

- Billing, checkout, plano/cobrança, métricas financeiras e limites comerciais.
- Conteúdo estático/legal/ajuda que não executa operação de produto.
- Importar dados de provedores ou ativar integrações que não estejam escolhidas, contratadas e habilitadas; aparecem como indisponíveis/demonstração até o ticket próprio.
- Descoberta irrestrita de pessoas por nome ou coleta indiscriminada de perfis LinkedIn; nesta spec a busca de foto parte da URL fornecida para o Contato e usa o Actor selecionado.
- Trocar o design aprovado, reescrever navegação, adicionar workflow/CRM comercial genérico não documentado ou reintroduzir Etapas/negócios excluídos das specs existentes.
- Entregar todas as capacidades numa única implantação. A spec prevê fases dentro da mesma stack e habilitação de cada domínio após sua entrega completa.

## Further Notes

**Estado observado do backend:** no projeto Supabase consultado, existem migrations parciais de membership/responsabilidade/Sequências, schema geral de CRM ainda ausente e nenhuma Edge Function implantada. Código local e documentação de migrations não significam deploy remoto. A primeira fase precisa reconciliar os ambientes.

**Provedores:** Apify foi escolhido para Sinais externos e consulta de foto por URL pública de LinkedIn; o Actor concreto e seus limites, custo, retenção e qualidade serão validados no ticket de integração. Unipile v1 é o primeiro provedor de canais pessoais. Apify não substitui o provedor de canais e Unipile não substitui coleta de Sinais.

**Fases:** base de acesso/tenant → Workspace/CRM/CSV/roleta → (opcional antecipar) canais Unipile/ciclos via `.scratch/canais-cadencia-backend/` → Sinais/Apify → Configurações/Agentes/Conversas/Aprovações → migração Seq↔Conta UUID no CRM + consumo dos ciclos canais → enriquecimento e conectores adicionais. Cada fase deixa uma jornada real utilizável e não cruza fixtures para o modo real. Detalhe operacional em `.scratch/ORDEM-BUILD-FUNCIONAL.md`.

**Glossário e ADRs:** usar os termos de `CONTEXT.md`; manter ADRs 0002–0009. A regra nova de roleta já foi registrada no glossário; esta spec não substitui as ADRs de Sinais, Coordenação, privacidade de remetentes e responsabilidade exclusiva.

**Documentação de produto revisada:** specs atuais de Contas e Contatos, Agentes, Sinais, Configurações, Onboarding, Sequências e Canais/Cadência, respectivos tickets existentes, catálogo/entrevista de Sinais, CONTEXT e ADRs 0001–0009. Reutilizar esses fluxos como contrato de UX e só resolver divergências onde esta spec registra decisão nova.

## Documentos relacionados

- `CONTEXT.md` (vocabulário e roleta)
- `docs/adr/0002-permissoes-ler-propor-executar.md`
- `docs/adr/0003-prototipo-simulado-com-marcas-reais.md`
- `docs/adr/0004-coordenacao-sem-quinto-agente.md`
- `docs/adr/0005-agentes-criados-a-partir-de-especialidades.md`
- `docs/adr/0007-sinal-disparado-torna-conta-quente.md`
- `docs/adr/0008-contas-remetentes-pessoais-e-interacoes-do-workspace.md`
- `docs/adr/0009-responsabilidade-comercial-exclusiva-por-conta-alvo.md`
- `.scratch/contas-e-contatos/spec.md`
- `.scratch/pagina-de-agentes/spec.md`
- `.scratch/modulo-de-sinais/spec.md`
- `.scratch/configuracoes/spec.md`
- `.scratch/onboarding-pos-login/spec.md`
- `.scratch/sequencias/spec.md`
- `.scratch/canais-cadencia-backend/spec.md`

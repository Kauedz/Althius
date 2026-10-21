# Sequências coordenadas entre Contatos da mesma Conta-alvo

Status: ready-for-agent

Documento de produto e critérios de aceite; não autoriza implementação sem tickets, alinhamento com Renan nas interfaces de canais, merge ou publicação. Base inspecionada: origin/main em 9fce6defdaa0b3c48674c8312df0bedcc723faa0. Comportamento desejado, não declaração de disponibilidade em produção.

## Problem Statement

O Vendedor responsável quer coordenar abordagens a várias pessoas da mesma Conta-alvo para aumentar respostas positivas e reuniões por Conta, não apenas disparar mais mensagens. Hoje o contrato admite Contatos por passo, mas o agendamento é uma fila global serial; uma espera para uma pessoa pode impedir outra abordagem independente. A geração pelo modelo de Cadência concentra os passos em um Contato.

O Cliente precisa partir de templates ou do zero, atribuir pessoas diretamente e adaptar a estratégia sem preencher Playbook nem cadastrar Personas. A complexidade de execução não pode virar complexidade visual: a estrutura de layout atual deve permanecer intacta.

## Solution

Manter uma Sequência em andamento por Conta-alvo, sob seu Vendedor responsável, com passos que podem avançar independentemente ou depender do envio efetivo de outro passo da mesma Sequência. A lista atual organiza a visualização; a condição explícita determina a execução.

O Vendedor escolhe um template da Althius, um template próprio ou começa do zero. Atribui Contatos reais na visualização existente, escreve mensagens com variáveis verificáveis, configura a agenda e autoriza os caminhos completos. Persona e Playbook não são pré-requisitos.

A experiência é orientada a templates com assistência da IA: sugerir templates acessíveis, justificar a adequação à Conta e propor mensagens, passos e ajustes com dados reais do Workspace. Usar ICP, Sinais, Contatos e Playbook quando disponíveis, sem torná-los pré-requisitos nem inventar contexto ausente. Sugestões não alteram o documento autorizado: o humano revisa e aceita; ativar envios permanece uma ação separada. O fluxo manual continua completo se a IA falhar ou não puder consumir créditos. Essa inteligência entra nos componentes atuais, nunca em um redesenho. Na divisão aprovada, a sugestão de templates entra no ticket 07, sugestões sobre templates próprios no 08 e análise de respostas no 05.

Atualização de base: origin/main observado em 474e2c8 inclui a proposta de Sequência pelo Rhetor. Reaproveitar essa capacidade e seus controles de privacidade/autorização, sem recriar o fluxo nem presumir publicação em produção.

Ao receber uma resposta correlacionada à abordagem, o sistema registra o recebimento e retém preventivamente os próximos envios da Conta inteira. A IA analisa e recomenda; somente o Vendedor decide pausar ou continuar todos ou alguns Contatos. A análise não é pré-requisito para o registro, a retenção nem a decisão humana.

### Experiência e escopo obrigatório

- Preservar estrutura atual de layout, blocos, navegação, menu e rotas. Reutilizar lista/timeline, editor e componentes atuais; não substituir a tela por uma nova lista ou reorganizá-la.
- Introduzir somente campos, estados e ações necessários dentro dos espaços existentes. Se a implementação exigir alteração estrutural, parar e pedir decisão explícita.
- Campos conceituais por passo: destinatário, canal, mensagem e quando executar. Pendências têm motivo e correção no contexto do passo.
- Sem editor gráfico de dependências, faixas por Contato, dashboard novo ou biblioteca compartilhada de templates nesta versão.
- Referência a Apollo é intenção de simplicidade, não especificação de paridade nem autorização para copiar layout.

## User Stories

1. Como Vendedor responsável, quero manter uma Sequência por Conta-alvo, para coordenar a abordagem comercial sem concorrência interna.
2. Como Vendedor responsável, quero iniciar por um template da Althius, para aproveitar uma estrutura pronta.
3. Como Vendedor responsável, quero criar do zero, para não depender de um template adequado.
4. Como Vendedor responsável, quero salvar um template próprio, para reaplicar minha estrutura.
5. Como Vendedor responsável, quero que meus templates sejam privados, para não expor conteúdo a outros participantes.
6. Como Cliente, quero usar templates da Althius sem editar seus originais, para preservar a referência fornecida.
7. Como Vendedor responsável, quero uma cópia independente ao usar um template, para adaptar sem afetar outras Sequências.
8. Como Vendedor responsável, quero acrescentar e editar passos na cópia, para adequar a abordagem à Conta.
9. Como Vendedor responsável, quero atribuir Contatos diretamente, para não depender de cadastro de Personas ou Playbook.
10. Como Vendedor responsável, quero identificar destinatários ausentes, para completar a abordagem na própria tela.
11. Como Vendedor responsável, quero iniciar caminhos independentes em paralelo, para abordar mais de uma pessoa de maneira coordenada.
12. Como Vendedor responsável, quero aguardar um envio para outro Contato, para conectar as abordagens da Conta.
13. Como Vendedor responsável, quero definir espera após ativação, para planejar o início.
14. Como Vendedor responsável, quero liberar um passo manualmente, para controlar situações que exigem julgamento.
15. Como Vendedor responsável, quero ver dependências inválidas, para corrigir planos impossíveis antes de ativar.
16. Como Vendedor responsável, quero que falha ou incerteza não libere dependentes, para não executar passos baseados em acontecimentos não confirmados.
17. Como Vendedor responsável, quero que uma espera local não bloqueie caminhos independentes, para evitar a limitação da fila global.
18. Como Vendedor responsável, quero usar dados reais da Conta, Contatos e Sinais, para personalizar sem informações inventadas.
19. Como Vendedor responsável, quero referenciar outro Contato com evidência, para distinguir envio, resposta e indicação.
20. Como Vendedor responsável, quero bloquear passos com variáveis ausentes, para não enviar mensagens incompletas.
21. Como Vendedor responsável, quero conferir conteúdo, destinatários e regras antes de autorizar, para controlar o que será executado.
22. Como Vendedor responsável, quero ativar somente caminhos completos selecionados, para começar sem autorizar partes incompletas.
23. Como Vendedor responsável, quero confirmar um destinatário incluído depois, para impedir envios não autorizados.
24. Como Vendedor responsável, quero configurar fuso, dias e janela, para respeitar a agenda da abordagem.
25. Como Vendedor responsável, quero limite diário por Conta e intervalo mínimo, para evitar excesso de mensagens entre pessoas da mesma empresa.
26. Como Vendedor responsável, quero que os limites do canal prevaleçam quando mais restritivos, para preservar a segurança operacional.
27. Como Vendedor responsável, quero que esperas dependentes contem desde o envio efetivo, para não adiantar abordagens após atrasos.
28. Como Vendedor responsável, quero que respostas sejam registradas mesmo sem IA disponível, para não perder o histórico.
29. Como Vendedor responsável, quero retenção preventiva da Conta ao receber resposta, para não continuar uma abordagem inadequada enquanto decido.
30. Como Vendedor responsável, quero análise com evidência e recomendação da IA, para decidir com contexto.
31. Como Vendedor responsável, quero decidir sem esperar a IA, para operar durante falha ou indisponibilidade de créditos.
32. Como Vendedor responsável, quero revisar conjuntamente respostas pendentes, para não ignorar a resposta de outro Contato.
33. Como Vendedor responsável, quero retomar todos ou alguns Contatos, para adaptar a estratégia sem apagar o histórico.
34. Como Vendedor responsável, quero nova retenção quando outra resposta chegar, para revisar o contexto atualizado.
35. Como Vendedor responsável, quero retomada sem rajada de atrasados, para respeitar limites e intervalos.
36. Como Contato, quero que meu descadastro seja respeitado, para não voltar a receber mensagens por uma retomada da Sequência.
37. Como Vendedor responsável, quero revisar possíveis pedidos de não contato, para aplicar corretamente o bloqueio.
38. Como participante não responsável, quero acompanhar somente os eventos e status permitidos, para colaborar sem ler conteúdo privado.
39. Como Cliente, quero avaliar respostas positivas e reuniões por Conta, para distinguir conversão de aumento de volume.
40. Como usuário da Demonstração, quero continuar usando os fluxos simulados, para conhecer o produto sem afetar dados operacionais.
41. Como Vendedor responsável, quero manter o layout conhecido, para aprender apenas os controles novos necessários.
42. Como equipe Althius, quero histórico auditável das autorizações, decisões, bloqueios e execuções, para investigar o comportamento sem expor conteúdo indevido.

## Implementation Decisions

### Reaproveitamento e domínio

- Evoluir o contrato da Fonte de Sequências, o documento privado, as autorizações e o agendador existentes; não construir um segundo Executor nem um segundo cadastro de Contatos/Personas.
- Reutilizar public.sequences, private.sequence_documents, private.sequence_authorizations e private.sequence_step_sends, preservando responsabilidade e privacidade. Extensões aditivas de contrato e armazenamento devem ser definidas nos tickets; esta spec não inventa nomes de tabelas ou RPCs novas.
- Um passo tem identidade estável, um Contato concreto quando completo e uma condição de liberação: ativação mais espera, envio de um predecessor mais espera, ou liberação humana. No máximo um predecessor, da mesma Sequência; vários passos podem depender dele. Rejeitar autorreferência, ciclos e referências inexistentes no servidor.
- Ordem visual não autoriza envios nem define implicitamente dependências no modelo novo. Reordenar não deve alterar silenciosamente a estratégia autorizada.
- Para documentos legados, preservar semântica serial: não interpretar ausência de dependência como paralelismo. Conversão deve manter IDs, envios, destinos e autorização; não ativar novos envios por migração. Estratégia exata de compatibilidade deve ter teste antes da mudança.
- Passo falho/incerto não satisfaz dependência. Incerteza não provoca repetição automática. Bloqueio local não deve impedir passos independentes, salvo guarda comum da Conta/canal/autoridade.

### Templates e variáveis

- Templates da Althius são referências selecionáveis; templates próprios pertencem ao criador no contexto do Workspace. Não conceder acesso por compartilhamento implícito entre Workspaces.
- Template é uma estrutura reutilizável, sem identidades concretas, destinos, respostas, evidências pessoais, histórico ou autorizações. Salvar deve oferecer conteúdo seguro parametrizado; copiar apenas texto livre sem revisar possíveis dados pessoais não satisfaz o requisito.
- A cópia pode ser alterada sem propagação em qualquer direção. Editar um template não muda Sequências em andamento.
- Perfis descritivos podem orientar atribuição, sem cadastro obrigatório. Nenhum preenchimento silencioso de destinatário autoriza envio.
- Variáveis usam fontes reais autorizadas do Workspace. Referências cruzadas distinguem tentativa enviada, resposta e indicação comprovada; nomes de pessoas não são evidência de indicação.
- Conteúdo e destinos efetivamente autorizados devem permanecer protegidos. Alteração de dado que mude a mensagem aprovada exige revisão/reconfirmação; não resolver variável mutável silenciosamente em mensagem diferente no momento do envio.
- Coleta de templates de especialistas/comunidade é curadoria futura, sujeita a direitos e atribuição. Não alegar eficácia comprovada sem evidências.

### Autorização, execução e agenda

- Somente Vendedor responsável ativo opera e autoriza a Sequência e usa suas Contas remetentes. Administrador não ganha capacidade de ler conteúdo ou enviar em seu nome apenas pelo papel.
- Ativação parcial fixa os passos/caminhos selecionados e válidos. Caminhos incompletos permanecem pendentes; nova atribuição, mensagem ou alteração de regra não herda autorização automaticamente.
- Manter regras de Destino confirmado do ADR-0014 e restrições de encerramento, arquivamento, responsabilidade, canal e reconciliação.
- Agenda explícita: fuso válido, dias permitidos dentro de segunda a sexta, janela, máximo diário por Conta e intervalo mínimo. Sem feriados nesta versão. Sem valores ocultos: sugestões são confirmadas pelo Vendedor.
- Contar prazo dependente a partir do envio efetivo, não da previsão. Respeitar janela após o prazo e mudanças de fuso/horário de verão de forma determinística. Limites mais restritivos dos canais prevalecem.
- Agendador deve selecionar passos elegíveis sem starvation entre caminhos e reservar capacidade de forma concorrente segura; excesso aguarda, não cancela.
- Liberação humana de passo não dispensa autorização de mensagem/destino. Retomar não sobrepõe supressão nem desbloqueia dependências não satisfeitas.

### Respostas, análise e decisão humana

- Registro de recebimento e retenção preventiva são determinísticos e independentes de IA. Correlacionar somente respostas pertinentes às abordagens; não analisar toda a caixa pessoal ou mensagens de outras Contas indiscriminadamente.
- Retenção vale para próximos envios da Conta. Duplicatas de evento não devem criar novas respostas, cobranças ou retenções após revisão do mesmo evento.
- IA apresenta interpretação, trecho de evidência e recomendação. Pode propor mudanças, não aplicá-las nem enviar. O conteúdo recebido é dado não confiável, nunca instrução operacional para ferramentas.
- Respostas automáticas podem ser classificadas como tal, mas a classificação não libera envios sem humano. Esta regra final substitui a sugestão anterior de liberar automaticamente outros Contatos diante de ausência.
- Sem IA por falha, Teto ou créditos, manter resposta disponível e retenção; permitir decisão humana imediata. IA paga passa pelas guardas existentes; cliente vê apenas créditos, nunca Teto em US$.
- Decisão conjunta fixa quais respostas foram vistas e quais caminhos serão continuados. Conferir atomicamente se não chegou nova resposta; confirmação obsoleta não libera a Conta ignorando evento novo.
- Revalidar retenção/autoridade imediatamente antes de liberar envio ao provedor. Não prometer recolher mensagem já aceita pelo provedor: envio em trânsito deve ser auditado e tratado sem duplicação.
- Descadastro registrado é bloqueio independente. Possível pedido textual de não contato permanece sob revisão com retenção; confirmado, bloqueia destinatário. Continuar não remove bloqueio.
- Diferenciar retenção preventiva, pausa decidida, pendência local e envio incerto no estado consultável, sem impor um redesenho de tela.

### Segurança, arquitetura e entrega

- O desenho refina ADR-0009: preserva exclusividade e suspensão de envios da Conta diante de resposta, mas distingue retenção automática de decisão humana. ADR-0008 e ADR-0014 continuam válidos.
- RLS e validação de papel no servidor; conteúdo sensível permanece privado. RPCs privilegiadas usam security definer e search_path vazio. Testar isolamento entre Workspaces, participantes e templates.
- Migrations somente novas/aditivas, reversíveis quando possível, sem editar migrations antigas, SQL destrutivo ou aplicação remota pelo agente.
- Canais/recebimento pertencem ao Renan: desenho compartilhado precisa de alinhamento antes de mudanças nesses componentes. Kauê decide produto; agente de código implementa tickets autorizados.
- Preservar estrutura visual é GATE, não preferência. Usar padrões atuais e lucide-react, sem emojis na UI.

## Testing Decisions

### Pontos de teste propostos

Usar o ponto público mais alto possível: jornadas pela Fonte/tela e operações públicas de autorização/agendamento/recebimento. Não testar nomes de campos internos como substituto de comportamento. O banco precisa de testes próprios porque o frontend não é barreira de segurança; handlers precisam de testes de provedor porque pgTAP não prova entrega externa. Estes pontos foram apresentados para confirmação do usuário; não declarar confirmação ainda não recebida.

- Vitest/Testing Library: estender os testes existentes do detalhe da Sequência, Fonte Supabase, fonte simulada e modelo de Cadência. Precedente: renderizar a aplicação e interagir pelos papéis, textos e ações do usuário.
- pgTAP: seguir testes existentes do Executor, Sequência em segundo plano e fila de entrada, usando relógio controlado e RPCs com identidades distintas. Cobrir autorização, destino, dependências, concorrência e isolamento, não somente estrutura do documento.
- Deno: estender handlers existentes de Executor, ritmo e reconciliação, com contratos do provedor controlados; não criar um adaptador paralelo só para testar.
- Aceite visual: comparar a tela atual com a implementada, em desktop e viewport estreita, verificando blocos, navegação e estrutura. Teste de texto não comprova layout preservado.

### Critérios de aceite verificáveis

1. Sem Playbook ou Persona cadastrada, criar uma Sequência, atribuir Contatos, adicionar passos e revisar autorização.
2. Dois passos independentes para pessoas diferentes podem ficar elegíveis; um passo manual pendente não bloqueia o outro.
3. Dependente somente fica elegível após envio confirmado do predecessor e prazo; falha, incerteza ou envio planejado não satisfazem condição.
4. Rejeitar ciclos, dois predecessores, predecessor externo/inexistente e alteração não autorizada, mesmo por chamada direta ao backend.
5. Ativação parcial não envia passos não selecionados; completar depois exige confirmação.
6. Variável ou evidência ausente bloqueia passo; alteração posterior não modifica silenciosamente conteúdo autorizado.
7. Resposta retém Conta antes da IA; falha de análise mantém retenção e permite revisão humana.
8. Duas respostas pendentes são revisadas juntas; resposta concorrente ou posterior impede continuação desatualizada. Duplicata não reinicia retenção já resolvida.
9. Retomada seletiva preserva histórico e dependências; não libera destinatário suprimido nem gera rajada.
10. Corrida entre Executor, retenção e confirmação não libera novo envio após guarda transacional; envio já em trânsito é reportado sem promessa de cancelamento retroativo.
11. Limites diários/intervalos são respeitados com workers concorrentes, fusos e finais de semana; não contar previsão como envio realizado.
12. Template próprio não é legível por outro usuário/Workspace; cópia independente não propaga edição; salvamento não expõe dados reais nem autorizações.
13. Documento legado mantém comportamento serial e histórico, sem ativação automática ao converter.
14. Outro participante, inclusive Administrador sem responsabilidade, não lê conteúdo nem autoriza envio em nome do titular.
15. Demonstração permanece isolada e funcional; sem dados simulados no Workspace operacional.
16. Estrutura de layout, rotas, menu e blocos permanece igual; adições se limitam aos controles aprovados dentro dos componentes atuais.
17. Resultados por Conta deduplicam Contatos/eventos no período declarado; respostas negativas não contam como positivas e ausência de resposta não vira sucesso. Sem dashboard novo.
18. Reunião/encerramento e interrupções existentes continuam respeitados; caminhos bloqueados não são apresentados como concluídos apenas por não haver envio elegível.

### GATE de implementação

Exigir lint, typecheck, Vitest, build, Deno e pgTAP pertinentes, mais regressão visual. Registrar comandos, totais e falhas; nenhum teste foi executado na autoria desta spec. Validação local não comprova migration publicada nem fluxo real com provedor. Comandos executáveis e escopos específicos acompanham os tickets, após confirmar ferramentas/configuração local.

## Out of Scope

- Redesenho de layout, novas rotas/menu, editor gráfico, faixas por pessoa ou dashboard adicional.
- Dependências múltiplas com E/OU, ciclos, condições por abertura de e-mail ou interpretação autônoma da IA.
- Envios, edição automática de mensagens ou retomada por decisão exclusiva da IA.
- Biblioteca compartilhada do Workspace, marketplace, importador da internet ou reprodução automática de conteúdo de especialistas.
- Playbook ou Persona como pré-requisito; remoção de integrações existentes com Playbook não é necessária.
- Novos canais, novos conectores, habilitação de canais indisponíveis e alterações sem alinhamento com Renan.
- Calendário de feriados, promessa de cancelar envios já aceitos pelo provedor, contornar descadastro.
- Aplicar migrations, deploy, merge ou envio real a terceiros pelo agente de código.

## Further Notes

### Ordem e responsabilidades

Próxima etapa: tickets pequenos por comportamento vertical, com arquivos e funções reais verificados na base atual. Uma branch nova a partir de origin/main atualizado e um PR por ticket contra main; worktree próprio em paralelo. Kauê mescla com merge commit. Agente para ao abrir PR e entrega arquivos, migrations, testes, decisões e dúvidas. Esta spec não substitui o prompt específico de execução de cada ticket.

Publicação, mediante pedido explícito: migration → Edge Functions → worker → frontend. Planejar compatibilidade considerando CI do frontend após merge. Antes de migration em produção: backup, bloco transacional e registro em schema_migrations com md5, sob operação autorizada. Não imprimir/comitar secrets.

Aceite humano: Kauê valida experiência e conteúdo; Renan valida pontos de canais; teste com provedor real exige autorização e ambiente/Contatos de teste. Separar código pronto, teste local, componente publicado e E2E real.

Templates melhoram reutilização; a hipótese de melhorar conversão exige dados reais. Não atribuir causalidade a um template apenas por aumentar envios. Nenhuma promessa comercial de ganho percentual foi definida.

Histórico da entrevista está preservado no registro de decisões desta frente. A última regra confirmada prevalece sobre sugestões anteriores de pausa automática ou faixas por Contato.

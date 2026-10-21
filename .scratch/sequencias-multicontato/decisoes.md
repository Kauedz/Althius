# Sequências coordenadas entre Contatos — entrevista

Status: entrevista em andamento. Decisões de produto confirmadas, não capacidade implementada. Sem autorização de implementação, merge ou publicação.

## Rodada 1 — confirmada pelo usuário

1. Uma Sequência por Conta-alvo permite caminhos por Contato em paralelo sob regras comuns da Conta. Uma espera não bloqueia caminhos independentes.
2. Passos podem depender do histórico de outro Contato da mesma Conta. Variáveis de mensagem com dados reais da Conta, Contato e Sinais são distintas das condições de execução.
3. Resposta humana pausa todos os envios pendentes da Conta, preservando caminhos e histórico. Vendedor responsável decide quais retomar. Respostas automáticas identificadas requerem tratamento separado, ainda a detalhar.
4. Avaliar resultados por Conta-alvo: resposta positiva e reunião, acompanhando volume e respostas negativas, não confundir mais mensagens com melhor conversão.

## Rodada 2 — confirmada pelo usuário

5. Playbook não é pré-requisito. Usuário quer templates prontos, citando Apollo.io como referência de produto; nenhuma equivalência funcional com Apollo foi verificada. A associação entre destinatários do template, Personas e Contatos reais permanece aberta.
6. Três formas iniciais de liberar passos: após ativação respeitando prazo/janela; após envio de outro passo, inclusive de outro Contato, mais espera configurada; após liberação explícita do Vendedor responsável. Liberação de passo não dispensa autorização humana de envio.
7. Limite configurável de envios por Conta e intervalo mínimo entre envios, além dos limites por canal. Excedentes esperam sem cancelamento nem bloqueio permanente dos demais. Valores padrão e janela de contagem ainda abertos.
8. Referências entre Contatos exigem acontecimentos comprovados e distinguem envio, resposta e indicação. Dado ou evidência ausente bloqueia o passo para revisão; nunca inventar texto ou enviar variável vazia.

## Rodada 3 — respostas do usuário

9. Confirmado: templates prontos da Althius, começar do zero e salvar configurações como templates próprios. Interesse futuro em templates inspirados em cadências da comunidade e especialistas. Não implica comprovação de eficácia, licença de reprodução nem autorização para importar/publicar conteúdo de terceiros.
10. Confirmado: atribuição pragmática de Contatos diretamente na visualização, sem exigir Persona cadastrada nem Playbook. Perfis como técnico podem orientar a escolha, mas não bloquear por ausência de classificação. Quando faltar destinatário ou informação, mostrar a pendência para o usuário resolver ali. Regra para ativar parcialmente enquanto faltam destinatários ainda não decidida.
11. Confirmado: Sequência é cópia independente do template e pode ser adaptada, inclusive adicionando passos, sem modificar o template de origem. Alterações no template não propagam para Sequências existentes.
12. Usuário redefiniu a regra: IA observa as respostas, registra que houve resposta e humanos decidem se devem pausar ou continuar a Sequência. Isso revisa a decisão inicial de pausa definitiva automática por resposta humana. Q13 CONFIRMADA: segurar preventivamente os próximos envios da Conta inteira enquanto a decisão humana está pendente. A espera preventiva não é decisão da IA de pausar; o Vendedor decide pausar ou continuar. Política para múltiplas respostas pendentes e retomada ainda a detalhar. Distinguir registro factual de resposta recebida da classificação/interpretação pela IA. Reconciliar com ADR-0009 antes de especificar; não alterar a regra atual em código.

## Rodada 4 — confirmada pelo usuário

14. Retomada de todos os caminhos ou seletiva por Contato. Dependências de ações não realizadas permanecem bloqueadas; nunca pular condições automaticamente.
15. Revisão conjunta das respostas pendentes da Conta. Vendedor vê todas antes de confirmar; nova resposta posterior volta a reter envios para decisão.
16. Retomada respeita janelas, intervalos e limites por Conta/canal, sem rajadas para compensar espera. Prazos dependentes de envio futuro contam a partir do envio real.
17. Ativação parcial somente de caminhos completos, selecionados e autorizados explicitamente. Caminhos incompletos ficam pendentes. Atribuir Contato posteriormente exige confirmação antes de enviar e preserva dependências.

## Rodada 5 — respostas do usuário

18. Usuário pede experiência simples, semelhante ao Apollo, sem excesso de funcionalidades. NÃO confirmou faixas por Contato nem editor visual de conexões. Proposta de UI simplificada ainda sujeita a confirmação; referência ao Apollo não equivale a inspeção de sua interface.
19. Confirmado: IA propõe interpretação, alterações de mensagem/próximos passos; não altera nem envia automaticamente. Sem análise disponível por falha, créditos ou limite, resposta permanece registrada, envios retidos e humano pode decidir sem IA.
20. Confirmado: descadastro registrado bloqueia destinatário e continuar Sequência não remove bloqueio; possível pedido de não contato exige revisão, com retenção; pedido confirmado bloqueia destinatário. Recusa comercial sem pedido de não contato segue decisão comercial. Mudanças nos canais exigem alinhamento com Renan.
21. Confirmado: política explícita por Sequência com fuso, dias/janela, máximo diário por Conta e intervalo mínimo. Template pode sugerir; Vendedor confirma antes de ativar. Limites mais restritivos dos canais prevalecem.

## Rodada 6 — confirmada pelo usuário

22. Interface em lista de passos com template, destinatários editáveis e resumo antes de ativar. Sem editor gráfico, novas rotas/menu nem dashboard adicional. Ordem visual não substitui condição de execução.
23. Templates da Althius selecionáveis sem edição do original pelo Cliente. Templates próprios privados do criador. Sequências usam cópias adaptáveis. Biblioteca compartilhada fora da primeira versão. Salvar template não leva dados reais de Contatos nem histórico.
24. Esperas em dias úteis de segunda a sexta, sem calendário de feriados inicialmente, respeitando fuso/janela confirmados. Dependência temporal conta a partir do envio efetivo, não do planejado.

## Restrição de layout — confirmada pelo usuário

Preservar a estrutura de layout atual do app, incluindo a tela de Sequências. Não redesenhar a tela, reorganizar blocos, alterar rotas, menu ou navegação para acomodar a funcionalidade. A lista de passos acordada deve reaproveitar a estrutura e os componentes existentes; não autoriza um novo layout. Somente campos, estados e ações estritamente necessários dentro dessa estrutura. Qualquer necessidade de mudança estrutural exige decisão explícita do usuário antes da implementação. Esta restrição deve constar na spec, nos tickets e nos critérios de aceite.

## Consolidação para confirmação final

Decisões Q1–Q24 consolidadas; Q3 foi substituída pela regra Q12/Q13 de retenção preventiva com decisão humana. Q18 foi refinada pela interface simples Q22. Aguardar confirmação final do entendimento antes da spec e tickets.

Guardas CONFIRMADAS pelo usuário: impedir dependências cíclicas; falha em passo não libera dependente; envio incerto não pode ser repetido automaticamente nem ser contado como envio confirmado; falha/espera local não impede caminhos independentes, salvo retenção ou bloqueio comum da Conta; máximo uma dependência de passo por passo inicialmente, permitindo vários dependentes do mesmo passo e sem combinações avançadas E/OU. Usuário confirmou o desenho, mas terminou a mensagem com “e mais”: aguardar complemento antes de fechar entrevista e produzir spec/tickets. Renan deve alinhar os pontos de canais/recebimento antes de implementação nesses componentes.

Detalhes a fechar na spec sem alegar comportamento já implementado: atomicidade da retenção e envios já em trânsito, evidências das variáveis, sanitização de templates, critérios de encerramento, medição deduplicada por Conta, segurança e isolamento, cálculo de agenda e testes da migração do modelo serial.

## Referência de código

Inspeção de origin/main em 9fce6defdaa0b3c48674c8312df0bedcc723faa0: contrato permite Contato por passo, mas execução atual é fila global serial. Esta entrevista define evolução, não retrata funcionamento publicado. CONTEXT.md foi atualizado somente nesta branch de documentação isolada.

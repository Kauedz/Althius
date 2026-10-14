# Vitrine de Sinais

**Origem:** pedido de 14/10/2026, depois do PR-A (catálogo único, `signal_catalog` e `signal_requests`). A Althius é um Revenue OS de prospecção B2B2B. Não é um CRM.

## Problema

O catálogo de Sinais é uma grade de cards claros, sem destaque, sem o que o Workspace já ativou e sem um jeito de saber o que vem por aí. A página do Sinal mostra fonte e custo em texto corrido, com dois botões de criar Monitoramento.

## O que muda

Só a camada visual de `/sinais` e de `/sinais/tipos/:id`, no estilo de uma vitrine (inspirada na PSN Store, sem compras). Casca, menu lateral, barra de topo, rotas e componentes base continuam os mesmos.

1. **Fundo escuro com o degradê da marca** em qualquer tema (`al-zona-escura`), com as quatro imagens de referência como capas (`src/assets/vitrine/`). Sem emoji: só ícones da biblioteca do app.
2. **Sinal da semana:** capa com brilho animado (some com `prefers-reduced-motion`) e prévia ao vivo das últimas empresas detectadas no Workspace, ou um estado vazio.
3. **Meus Sinais:** Monitoramentos ativos com os disparos, Contas Quentes e Sequências em andamento.
4. **Prateleiras:** Para o seu nicho, Mais ativados, Novos, Movimento de equipe, Mídia e anúncios, Exclusivos do seu Workspace e Lançamentos (Avise-me).
5. **Todos os Sinais:** a grade do PR-A, com busca e filtros. Com filtro ativo, a vitrine mostra só a grade.
6. **Precisa de outro Sinal?** sempre no fim, com "Falar com a equipe Althius" (`/sinais/pedidos`).
7. **Página do Sinal:** capa grande, prévia, fonte, frequência, custo em créditos, resultado, nichos e um único botão, "Ativar Monitoramento".

## Decisões

- **Nicho do Workspace:** lido nos Segmentos do ICP da Memória. Sem nicho reconhecido, "Para o seu nicho" mostra os Sinais de todos os nichos e pede para descrever os Segmentos.
- **Sinal da semana:** o de mais disparos nos últimos sete dias; senão, o do disparo mais recente; senão, um card do nicho que muda por semana.
- **Mais ativados:** pelos Monitoramentos ativos do próprio Workspace. Não há contagem entre Workspaces sem migração.
- **Novos:** os cards que entraram com as cascatas em 13/10/2026 e os exclusivos do Workspace.
- **Lançamentos:** os cards do catálogo sem coletor (Anunciando no Google, Publicações da empresa). Saem das outras prateleiras e a página deles troca "Ativar Monitoramento" por "Avise-me".
- **Avise-me:** vai pela fila de `signal_requests` (`request_signal`), com o evento "Avise-me quando lançar: <nome>". A equipe recebe o aviso pela `signal-request-notify`. Não entra em Exclusivos.
- **Exclusivos:** cards com `workspace_id` (selo "Exclusivo") e pedidos abertos: "Pedido recebido" (novo) ou "Em produção pela equipe Althius" (em análise ou em construção).
- **Custo em créditos:** "1 crédito por Conta varrida"; os internos "Não gasta crédito", como o editor já diz.
- **Frequência:** o Monitoramento roda uma vez por dia (`every_hours` 24). Base de CNPJ e comércio exterior: a base pública muda uma vez por mês.
- **Resultado:** Conta Quente por 30 dias. "Candidata na Descoberta" só onde a descoberta por perfil roda (a Demonstração, nas famílias que a aceitam). No operacional ela ainda não roda.

## Fora de escopo

Migração, deploy, segredo, coletor novo, contagem de ativações entre Workspaces, a página de Mercado e o editor do Monitoramento.

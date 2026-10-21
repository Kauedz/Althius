# ADR-0031 — Sequência coordenada entre Contatos, com retenção por resposta

Status: decisão de produto confirmada. Ticket 01 entregue no PR #244 (contrato e validação no banco; seletores de liberação escondidos na tela até o ticket 02). Demais tickets pendentes.

## Contexto

Uma fila serial por Conta-alvo impede abordagens independentes a diferentes Contatos. Separar Sequências por pessoa perderia coordenação, guardas comuns e responsabilidade comercial exclusiva. O usuário confirmou paralelismo com dependências simples, preservação integral da estrutura visual e decisão humana sobre respostas.

## Decisão

Manter uma Sequência em andamento por Conta-alvo, sob um único Vendedor responsável. Passos independentes podem avançar em paralelo; cada passo pode depender de no máximo um outro passo da mesma Sequência, sem ciclos. Falha ou incerteza não satisfaz dependência e não autoriza repetição automática.

Refinar a regra de resposta do [ADR-0009](0009-responsabilidade-comercial-exclusiva-por-conta-alvo.md): recebimento correlacionado registra a resposta e retém preventivamente os próximos envios da Conta inteira. A IA recomenda; o Vendedor decide pausar ou continuar, inclusive seletivamente. Retenção não é decisão comercial da IA. A revisão abrange respostas pendentes e não pode ignorar evento concorrente. Indisponibilidade da IA não bloqueia decisão humana nem libera envios.

Preservar responsabilidade exclusiva, privacidade e contas pessoais do [ADR-0008](0008-contas-remetentes-pessoais-e-interacoes-do-workspace.md) e Destino autorizado do [ADR-0014](0014-passo-confirmado-guarda-o-destino.md). Descadastro é guarda independente e não é removido por continuação.

Templates geram cópias independentes sem exigir Playbook/Persona. Interface permanece na estrutura existente: sem nova navegação, reorganização dos blocos ou editor gráfico.

## Consequências

O agendador passa a avaliar elegibilidade por passo e guardas comuns, exigindo validação de dependências, compatibilidade serial para documentos legados, retenção e autorização concorrentes seguras. Limites de frequência comuns à Conta evitam que paralelismo vire excesso de envios. Conteúdo já enviado e envios em trânsito não são retroativamente alterados. Renan deve alinhar as interfaces de canais antes de mudanças nessas partes.

## Alternativas

- Fila global serial: menor complexidade, mas não atende à independência entre abordagens.
- Uma Sequência por Contato: permite paralelismo, mas fragmenta responsabilidade, resposta e limites da Conta.
- Motor genérico de automações e editor gráfico: flexível, porém excede o escopo e contraria a simplicidade e preservação do layout.
- Continuar enviando até decisão humana: reduz espera, mas permite abordagem inadequada após resposta. Rejeitado em favor da retenção preventiva.

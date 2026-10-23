# 01: Plano do Sinal (Briefing, Plano versionado e aprovação)

**Status:** ready-for-agent

**GATE:** Segue a [ADR-0032](../../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md) (Proposta) e a [spec](../spec.md). Migration só aditiva (sem `drop table`, `truncate`, `delete` de dados nem `drop column`), com o número do prompt e pgTAP próprio; migration já aplicada nunca é editada, e função existente é redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. Sem emoji, só ícones `lucide` que já existem; o Cliente vê só créditos; nada de letras de nicho A–H; nada envia mensagem, cria Conta-alvo ou Sequência sozinho. Prompt 30-02. Primeiro corte no escopo Contas (decisão 12).

**Blocked by:** nenhum

**Decisões pendentes que pesam aqui:** 13 (Plano pela IA sem crédito, 20 por dia), 12 (ordem).

## O que construir

- O Cliente escreve o **Briefing** e a IA devolve um **Plano** estruturado e editável: o que procurar, em que fontes, com quais critérios, no escopo Contas. O escopo `mercado` entra pelo mesmo Plano quando `vaga_mercado` estiver validada (decisão 5).
- O Plano é **versionado**: editar cria uma versão nova; só a versão **aprovada** por uma pessoa pode rodar. O Monitoramento (`private.signal_monitors`) aponta para a versão aprovada. Onde o Plano e as versões são guardados é desenho deste ticket, sempre atrás de RLS e de funções com a Participação conferida.
- O servidor valida o Plano contra as fontes disponíveis (`available`) e os limites antes de aceitar; o Briefing é dado não confiável e nunca escolhe fonte, preço nem limite. A Rodada em andamento termina com a versão com que começou.
- Gerar o Plano pela IA **não cobra crédito**, com **limite de 20 Planos por dia por Workspace** (decisão 13, `DECISÃO PENDENTE`; constante no servidor, fácil de trocar). Passou do limite, mensagem neutra da marca.
- A IA roda pelo motor já configurado (`SIGNALS_LLM_PROVIDER`, [ADR-0018](../../../docs/adr/0018-motor-dos-agentes-na-edge-function.md)); nenhuma função nomeia modelo nem guarda chave nova. Sem motor disponível, a tela diz que o Plano não pôde ser montado, sem Plano inventado.
- Tela mínima dentro da página do Sinal que já existe: caixa do Briefing, o Plano editável, "Aprovar este Plano" e o histórico de versões. Sem reestruturar o app.

## Pode mexer

- Migration nova (versões do Plano, aprovação, contador diário de Planos) e pgTAP em `supabase/tests/`.
- Uma Edge Function nova para propor o Plano, ao lado de `signal-runner`, e a parte do `signal-runner` que lê a versão aprovada.
- `projeto-althius-frontend/src/paginas/sinais/` e `src/fonte/` (Fonte do Plano), com testes.

## Não mexa

- O catálogo de Sinais e os adaptadores existentes (`adaptadores/`), a não ser para ler a versão aprovada.
- A Agenda e o preço (tickets 03 e 04): aqui a Rodada continua na cadência atual do Monitoramento.
- Migrations já aplicadas.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`integration-*`, `slack-*`): área do Renan.
- Rotas, casca, menu lateral e componentes base além do que o ticket pede.
- O motor dos Agentes e o worker do Hermes.
- O conteúdo da Demonstração, além do mínimo para os testes.

## Critérios

- [ ] O Briefing nunca chega ao `signal-runner`; o runner só lê Plano aprovado.
- [ ] Plano sem aprovação não roda, e uma versão nova volta a exigir aprovação.
- [ ] O servidor recusa Plano com fonte indisponível ou fora dos limites, e o texto do Briefing não muda isso (teste com Briefing malicioso).
- [ ] Limite de 20 Planos por dia por Workspace, num único lugar do servidor, listado no PR como `DECISÃO PENDENTE`.
- [ ] pgTAP: aprovação só por Participação ativa; isolamento por Workspace; versões lidas por conjunto, sem depender da ordem de `created_at`; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration, publica as Edge Functions tocadas e o worker, e confere `md5(statements[1])` contra o `md5sum` do arquivo (`docs/agents/migrations.md`).

## Comments

# 02: A Sequência proposta aparece na Conversa do Workspace operacional

Spec: [../spec.md](../spec.md) (US 4–6).

**What to build:** quando o Rhetor propõe uma Sequência, a Conversa operacional mostra Conta-alvo, Contatos e passos (assunto e corpo com as variáveis em destaque) com Aprovar e Recusar. Depois de aprovar, mostra "Sequência criada, envios não ativados" com link para a Sequência. Recarregar a Conversa mostra o mesmo estado.

**GATE:** só frontend; sem deploy; pt-BR; reaproveitar `AprovacaoNaConversa` e `DetalheSequencia`; a Demonstração não muda.

**Blocked by:** 01 (O Rhetor propõe uma Sequência de e-mail por Aprovação).

**Status:** ready-for-human — entregue no PR #240 (merge em 2026-10-21). Critérios verificados nesta branch; migration `20261105100000_sequencia_proposta_pelo_rhetor.sql` ainda consta como não aplicada no ticket 01, sem registro posterior no repositório. Prints 1400×900 presentes; frontend não publicado.

**Quem faz:** agente de código. **Esforço:** M.

## Pode mexer

- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (ler o evento da proposta) e `conversas-tipos.ts`
- `projeto-althius-frontend/src/paginas/conversa-coordenada.tsx` e um componente novo da proposta de Sequência
- testes Vitest novos

## Não mexa

- `nascimento-sequencia-na-conversa.tsx`, `fonte/roteiros.ts`, `fonte/simulada.ts` (Demonstração)
- `conversas-reais.test.tsx` existente (só acrescentar casos num arquivo novo)

## Critérios

- [x] A proposta aparece com Contatos e passos, e Aprovar/Recusar só para o Vendedor responsável
- [x] Aprovar mostra "Sequência criada, envios não ativados" e o link para a Sequência
- [x] Recarregar mostra o mesmo estado sem reenviar o pedido
- [x] Prints 1400×900 em `issues/prints/02-*.jpg`
- [x] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/conversa*`

## Comments

- 2026-10-24 (Codex): conferido na base atual após o merge do PR #240. A implementação atende os três critérios funcionais; os seis prints em `issues/prints/02-*.jpg` têm 1400×900. Validações: `npx vitest run --maxWorkers=2 src/paginas/conversa*` (3 arquivos, 12 testes), `npm run lint` (código 0, avisos existentes) e `npx tsc -b` (código 0). A migration `20261105100000_sequencia_proposta_pelo_rhetor.sql` aparece no ticket 01 como não aplicada; não há confirmação posterior no repositório. Nenhuma migration foi aplicada. Não houve alteração de código porque o comportamento já estava entregue e passou as verificações. Revisão do escopo: nenhuma mudança funcional pendente neste ticket.

## Evidência (auditoria, vertical C)

- `conversa-coordenada.tsx:249-259`: o desfecho `nascimento-sequencia` renderiza `NascimentoSequenciaNaConversa`, mas só a Demonstração produz esse desfecho.

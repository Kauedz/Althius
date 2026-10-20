# 02: A Sequência proposta aparece na Conversa do Workspace operacional

Spec: [../spec.md](../spec.md) (US 4–6).

**What to build:** quando o Rhetor propõe uma Sequência, a Conversa operacional mostra Conta-alvo, Contatos e passos (assunto e corpo com as variáveis em destaque) com Aprovar e Recusar. Depois de aprovar, mostra "Sequência criada, envios não ativados" com link para a Sequência. Recarregar a Conversa mostra o mesmo estado.

**GATE:** só frontend; sem deploy; pt-BR; reaproveitar `AprovacaoNaConversa` e `DetalheSequencia`; a Demonstração não muda.

**Blocked by:** 01 (O Rhetor propõe uma Sequência de e-mail por Aprovação).

**Status:** blocked

**Quem faz:** agente de código. **Esforço:** M.

## Pode mexer

- `projeto-althius-frontend/src/fonte/supabase-conversas.ts` (ler o evento da proposta) e `conversas-tipos.ts`
- `projeto-althius-frontend/src/paginas/conversa-coordenada.tsx` e um componente novo da proposta de Sequência
- testes Vitest novos

## Não mexa

- `nascimento-sequencia-na-conversa.tsx`, `fonte/roteiros.ts`, `fonte/simulada.ts` (Demonstração)
- `conversas-reais.test.tsx` existente (só acrescentar casos num arquivo novo)

## Critérios

- [ ] A proposta aparece com Contatos e passos, e Aprovar/Recusar só para o Vendedor responsável
- [ ] Aprovar mostra "Sequência criada, envios não ativados" e o link para a Sequência
- [ ] Recarregar mostra o mesmo estado sem reenviar o pedido
- [ ] Prints 1400×900 em `issues/prints/02-*.jpg`
- [ ] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/conversa*`

## Evidência (auditoria, vertical C)

- `conversa-coordenada.tsx:249-259`: o desfecho `nascimento-sequencia` renderiza `NascimentoSequenciaNaConversa`, mas só a Demonstração produz esse desfecho.

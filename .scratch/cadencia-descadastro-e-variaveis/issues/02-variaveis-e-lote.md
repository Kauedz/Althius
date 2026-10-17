# 02: Variáveis de personalização e criação em lote

**What to build:** `{{primeiro_nome}}`, `{{nome}}`, `{{sobrenome}}`, `{{empresa}}`, `{{cargo}}`, `{{email}}`, `{{segmento}}`,
`{{dominio}}` e os nomes com grupo que já existiam; variável sem valor segura o passo com motivo visível; criação em lote.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Critérios

- [x] `private.step_variable_value` e `missing_step_variables`; `render_step_template` com os apelidos.
- [x] Variável sem valor ou desconhecida: `missing_variable`, Envio aguardando reconfirmação com `missing_variable:<nomes>`.
- [x] Motivo em pt-BR na tela (`motivoDoEnvio`) e na descrição do Envio.
- [x] A pré-visualização usa os mesmos nomes (`fonte/variaveis-do-passo.ts`) e destaca o que falta.
- [x] `{{conta.sinal}}` e `{{persona}}` não são variáveis do envio: saem do seletor do editor, a prévia as mostra como faltando e o banco segura o passo que as use (vitest e pgTAP).
- [x] RPC `create_sequences_in_batch` (até 200 Contas), com pgTAP: pula Sequência em andamento, outro responsável e Contato sem e-mail, suprimido ou já em Sequência ativa.
- [ ] Tela da criação em lote: ticket 03.

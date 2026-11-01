# 12: Auditoria de presença em LLM como ferramenta interna

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Nenhuma migration apaga dado. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** nenhum (D3 pura; não faz parte da cadeia D9a–d da trilha de retirada, por isso não bloqueia nem é bloqueada pelos tickets 10/11/13/15)

**Decisões:** D3 (a auditoria de presença em LLM, hoje "Oraculum", vira ferramenta interna, não Agente) da ADR-0033.

## O que construir

- A auditoria de presença de marca em LLMs (ChatGPT, Perplexity, Gemini, Claude) hoje só existe como roteiro do protótipo da página de Agentes (`.scratch/pagina-de-agentes/spec.md`, histórias 28 e 40), sem implementação de produção: não há ferramenta real de busca nos LLMs, nem RPC, nem Edge Function que a execute hoje. Este ticket não migra código de produção — ele retira o vínculo exclusivo dessa ideia com "Oraculum" no vocabulário e no protótipo, e deixa documentado, num lugar discreto, que ela é candidata a virar uma ferramenta interna (chamável por quem vier a precisar, sem Especialidade dona), para quando for implementada de verdade.
- Nenhuma tela de produção perde funcionalidade: a auditoria nunca funcionou fora do protótipo, então não há regressão de uso real.
- O protótipo da página de Agentes (`.scratch/pagina-de-agentes/`), se ainda for usado para demonstração, para de nomear essa capacidade como "pedido ao Oraculum" e passa a apresentá-la de forma neutra, já que o Oraculum sai do produto (ADR-0033, D1).

## Pode mexer

- `.scratch/pagina-de-agentes/spec.md` e o roteiro do protótipo (se ele seguir em uso para demonstração), só na nomeação da auditoria de presença em LLM — sem mudar o resto do protótipo, que é escopo de outra frente.
- Documentação de produto (este ticket, a spec, a ADR) que registra a auditoria como ferramenta interna candidata, sem código de produção a mudar hoje.

## Não mexa

- Nenhuma Edge Function de produção: não existe implementação real para mover.
- `supabase/functions/_shared/orquestracao.ts`: a limpeza do mapa de personas (que inclui a descrição do Oraculum) é o ticket 14, não este.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [x] Nenhum código de produção muda de comportamento (não havia implementação real a mudar).
- [x] A documentação do protótipo (se mantida) não nomeia mais essa capacidade como exclusiva do "Oraculum".
- [x] A spec e a ADR-0033 continuam descrevendo a auditoria como ferramenta interna candidata, não como Especialidade.
- [x] Nenhum teste de produção quebra (não há suíte cobrindo uma implementação que não existe).

## Passos do Nan

Nenhum passo manual: ticket só de documentação/protótipo, sem migration nem deploy.

## Comments

- 2026-10-25 — Retirei do protótipo a atribuição exclusiva da auditoria de presença em LLM ao Oraculum e registrei na spec e na ADR-0033 que ela é candidata a ferramenta interna, sem implementação de produção. As verificações documentais passaram; `src/App.test.tsx` passou (69 testes), lint e TypeScript passaram. A suíte Vitest completa excedeu 300 s sem concluir e sem relatar falhas antes do timeout. O diff não toca código de produção; status `ready-for-human` para revisão e integração.

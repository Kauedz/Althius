# 03: O selo do Agente não diz "Disponível" quando as Conversas estão indisponíveis

Spec: [../spec.md](../spec.md) (US 1, 5).

**What to build:** na página de Agentes, na página do Agente e na barra lateral da Casca, um Agente ocioso aparece como "Disponível" só quando as Conversas estão disponíveis. Com o módulo indisponível, o selo diz "Sem conversas no momento". Os estados "Trabalhando" e "Detectou" não mudam.

**GATE:** só frontend; sem deploy; pt-BR; só ícones `lucide-react` existentes.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/components/marca.tsx` (`SeloDeEstado`, `ROTULO_DO_ESTADO`)
- `projeto-althius-frontend/src/paginas/agentes.tsx`, `paginas/agente.tsx`, `components/casca.tsx` (passar a disponibilidade)
- testes Vitest novos; nos existentes (`agentes-reais.test.tsx` e afins), só asserções de "Disponível" que dependam do módulo

## Não mexa

- `fonte/composicao.ts`, `fonte/supabase-conversas.ts`, `auth/aplicativo.tsx` (são do ticket 02)

## Critérios

- [ ] Conversas indisponíveis: nenhum selo diz "Disponível"; o ocioso diz "Sem conversas no momento"
- [ ] Conversas disponíveis: selo igual a hoje
- [ ] A Demonstração não muda
- [ ] Prints 1400×900 da página de Agentes nos dois casos em `issues/prints/03-*.jpg`
- [ ] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/agentes src/components`

## Evidência (auditoria, vertical B)

- `components/marca.tsx:90-91`: `ocioso: 'Disponível'`, estado de runtime lido do banco.
- `paginas/agentes.tsx:53`: o aviso usa `disponivel('conversas')`; `agentes.tsx:134` usa `SeloDeEstado` sem olhar o módulo.

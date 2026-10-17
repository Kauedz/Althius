# 01: Vitrine do catálogo e página do Sinal

**Status:** closed

**GATE:** depois do PR-A (catálogo único). Sem migração, deploy ou segredo. Só a camada visual de `/sinais` e `/sinais/tipos/:id`.

## O que construir

- Vitrine escura com o degradê da marca: Sinal da semana, Meus Sinais, prateleiras, Todos os Sinais e o card "Precisa de outro Sinal?".
- Página do Sinal com capa, prévia, fonte, frequência, custo em créditos, resultado e um único "Ativar Monitoramento".
- Lançamentos com Avise-me pela fila de `signal_requests`.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/pagina-sinais.tsx`, `pagina-do-tipo.tsx` e arquivos novos `vitrine*.ts(x)` em `paginas/sinais/`.
- `src/index.css` (classes `vitrine-*`), `src/assets/vitrine/`.
- Testes de tela que procuravam o card na tela inteira ou o botão "Criar Monitoramento" da página do Sinal.

## Não mexa

- Rotas, casca, menu lateral, barra de topo, componentes base, tokens.
- `catalogo-visivel.ts`, `arquivados.ts`, Fontes, migrações, Edge Functions.
- A página de Mercado e o editor do Monitoramento.

## Critérios

- [x] Sem emoji; só ícones do `lucide-react`.
- [x] Nenhuma letra A–H na tela; só o nome do nicho.
- [x] Prévia com dados do Workspace, ou estado vazio.
- [x] Exclusivo com selo e "Em produção pela equipe Althius".
- [x] Lançamentos com Avise-me.
- [x] Página do Sinal com um único "Ativar Monitoramento".
- [x] Sem rolagem horizontal da página em 390 px.
- [x] `tsc -b`, lint, vitest e build verdes.

## Passos do Nan

Nenhum passo manual além de publicar o frontend no fluxo normal, depois do CI verde. Para conferir logado: abrir `/sinais` e `/sinais/tipos/nova-lideranca`.

## Comments

Implementado. Lógica em `vitrine.ts` (prateleiras, Sinal da semana, nicho pelos Segmentos do ICP, ficha do Sinal, Avise-me), peças em `vitrine-pecas.tsx`. Testes novos: `vitrine.test.ts` (7) e `vitrine-de-sinais.test.tsx` (9). Testes antigos ajustados: "Criar Monitoramento" da página do Sinal virou "Ativar Monitoramento", e a busca de um card por nome passou a olhar a grade "Catálogo de sinais", porque o mesmo card agora aparece em mais de uma prateleira. Os dois testes de estado vazio que usavam `anuncios-google` passaram para `anuncios-meta`, porque Anunciando no Google virou Lançamento. Prints em `prints/` (Demonstração, 1440 e 390 px).

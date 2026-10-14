# 02: Grade única, letras fora da URL e painéis de mercado

**Status:** ready-for-agent

**GATE:** pode seguir em paralelo ao 01 na mesma PR. A tela usa o catálogo do código (e, no operacional, a RPC quando ela existir). Sem deploy. Sem aplicar migração.

## O que construir

- Um grid em `paginas/sinais`. Filtro por nicho (nome, sem letra) e por família. Card igual: nome, frase, selos, "N ativos", seta. Sem "Em breve", "Em teste", "Sem fonte" e sem a seção "Sinais por mercado".
- `/sinais/tipos/:id` com o que detecta, fonte em linguagem de usuário, custo estimado, Monitoramentos e o botão "Criar Monitoramento" (também no estado vazio). "Criar o primeiro" sai.
- Abertura de vagas: um card; cargos mudam com o nicho; coletores seguem por trás.
- Arquivados não aparecem, nem para admin. `ARCHIVED_SIGNALS` e `docs/sinais-arquivados.md`.
- `/sinais/mercado/:slug` com redirect das letras A–H. Título só com o nome do nicho. Editor de cascata: nome do nicho, ou "Nicho não encontrado".
- Volume por porto, CBS/IBS e impacto por CNAE são painéis em Mercado, não cards.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/**`, `src/fonte/sinais-*`, `src/App.tsx` nas rotas de Sinais.
- Testes de tela que descreviam o catálogo antigo ou as letras.

## Não mexa

- Motor de cascata, `signal-runner`, Hermes.
- O perfil firmográfico (`perfil-personalizado.tsx`): é o público do Monitoramento, não o construtor de Sinal personalizado. Ver a spec.

## Critérios

- [ ] A grade não mostra letra A–H, "Em teste", "Em breve" nem "Sem fonte".
- [ ] `/sinais/mercado/A` redireciona para o slug e o título é "Comex e importação".
- [ ] O editor de cascata sem nicho conhecido diz "Nicho não encontrado".
- [ ] Textos da UI em pt-BR. Nenhum nome de fornecedor.

## Passos do Nan

Publicar o frontend no fluxo normal do repositório, depois do CI verde. Conferir a grade logado: um grid, chips com nome de nicho, sem letra na URL de Mercado.

## Comments

Implementado nesta branch. A grade de Sinais é um grid só, com chips de nicho (nome) e de família. O card abre `/sinais/tipos/:id` com "Criar Monitoramento". Abertura de vagas guarda o nicho e os cargos nos critérios; o coletor gravado continua `vaga_linkedin`. Arquivados e "Em teste" não entram na grade. `/sinais/mercado/:slug` redireciona a letra A–H e mostra os painéis (volume por porto, CBS/IBS, impacto por CNAE). O editor de cascata usa o nome do nicho ou "Nicho não encontrado".

Passos do Nan: publicar o frontend no fluxo normal, depois do CI verde. Conferir logado: um grid, chips com nome de nicho, URL de Mercado sem letra.

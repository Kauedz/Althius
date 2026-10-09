# Handoff: motor-hermes 01, pesquisar a documentação do Hermes

Branch: `claude/hermes-01-pesquisar-documentacao`. Ticket: `.scratch/motor-hermes/issues/01-pesquisar-a-documentacao-do-hermes.md`. Status: `ready-for-human`.

## Tarefa

Confirmar ou corrigir, na documentação oficial do Hermes Agent, cada item de "Recomendações a conferir" da spec, com link
da fonte, em `.scratch/motor-hermes/pesquisa-hermes.md`. Pesquisa só de leitura: sem código, sem migration, sem deploy,
sem tocar no Supabase.

## Arquivos

- `.scratch/motor-hermes/pesquisa-hermes.md` (novo): 7 seções, uma por critério, com marcação Confirmado, Corrigido,
  Novo e Não confirmado, e um fecho "O que isto muda nos tickets seguintes".
- `.scratch/motor-hermes/issues/01-pesquisar-a-documentacao-do-hermes.md`: 7 critérios marcados `[x]` com a evidência
  de cada um; status passou a `ready-for-human`.
- `.scratch/handoffs/motor-hermes-01.md` (este arquivo).

## Loop

Script fora do repositório (scratchpad da sessão), `check-pesquisa.sh`: exige o arquivo, as 7 seções, ao menos um link
da documentação oficial em cada seção, e que cada link de documentação responda 200. Vermelho antes (arquivo
inexistente), verde depois. Ele não confere se o texto reflete a fonte; isso foi lido na documentação (`llms-full.txt`,
5,5 MB, baixado no scratchpad) e deve ser revisado pelo Nan. O link da issue no GitHub não é conferido pelo `curl` (o
proxy devolve 403); foi lido via WebFetch.

## Aprendizados

- A documentação publica o texto completo em `https://hermes-agent.nousresearch.com/llms-full.txt`. Baixar e usar
  `grep` é muito mais rápido do que ler página a página.
- O padrão da API do Hermes inclui `terminal`, arquivos e navegador. Cada perfil precisa de `agent.disabled_toolsets`.
- Perfil não é sandbox, e o login OAuth (Anthropic, Codex, xAI) é compartilhado entre perfis. Por Workspace, só chave
  de API.
- A Groq não é provedor nativo: entra como endpoint compatível com OpenAI. O modelo precisa chamar ferramentas bem;
  a documentação avisa que modelos pequenos dizem que salvaram memória sem salvar.
- Cabeçalho do MCP é por servidor, não por chamada: o Workspace deve vir do perfil/token, nunca de argumento do modelo.

## Não confirmado (vira teste no ticket 02)

1. Escopo do limite de 10 runs: por processo ou por perfil.
2. Vazamento entre perfis no multiplexador (registro de ferramentas, MCP): a documentação não garante nada.
3. Chave `platform_toolsets.api_server` (inferida por analogia).
4. Se o s6 do Docker (um gateway por perfil) conflita com o multiplexador (um gateway por host).
5. Se a fila de `write_approval` (memória e skills) é utilizável por API, fora de CLI e mensageiros.
6. Campo de metadados no `POST /v1/runs`: não documentado.
7. Consumo do Supabase auto-hospedado (ADR-0013) e se app + Hermes + Supabase cabem no plano da Hostinger: o custo é
   estimativa e não foi medido.

## Próximo passo

Nan revisa `pesquisa-hermes.md` e marca o ticket como done. Depois, `motor-hermes/02` (ligar o Hermes no contrato do
banco) começa pelos testes de vazamento entre perfis e pela chave `platform_toolsets.api_server`. A escolha do modelo
(Groq para teste, Claude em produção) segue em aberto na spec.

# O motor provisório dos Agentes roda numa Edge Function; o definitivo será o Hermes Agent

As Conversas e a Coordenação (CRM-14) precisam de um motor que chame um modelo, use ferramentas e guarde cada passo. Decidimos que o motor é código nosso, numa Edge Function do Supabase (`agent-conversation`), chamando a Messages API da Anthropic com a chave que só a função tem, e não o Hermes Agent com uma instância por Workspace ([proposta do CRM-25](../../.scratch/crm-real-e-stack/propostas/hermes-multi-tenant-architecture.md)).

O motivo é o que os ADRs de Agentes já fixaram. A Althius tem um catálogo fechado de Especialidades ([ADR-0005](./0005-agentes-criados-a-partir-de-especialidades.md)), a Coordenação não é um quinto Agente ([ADR-0004](./0004-coordenacao-sem-quinto-agente.md)) e toda ação externa passa pela Permissão Ler, Propor ou Executar ([ADR-0002](./0002-permissoes-ler-propor-executar.md)). Um motor genérico e pessoal precisaria ser dobrado para respeitar isso, e um container por Workspace ao lado do Supabase auto-hospedado ([ADR-0013](./0013-supabase-auto-hospedado-em-vps.md)) é custo fixo antes de haver cliente. Com o motor na Edge Function, o banco continua dono das regras: o pedido é guardado antes de rodar, reservado uma vez só, cada passo é gravado antes do seguinte e a Execução só termina com sucesso depois da resposta gravada. A tela acompanha pelo banco, então recarregar a página não roda o pedido de novo.

O modelo padrão é o `claude-opus-5-5`, trocável pelo segredo `ANTHROPIC_MODEL` sem publicar código. Sem a chave `ANTHROPIC_API_KEY`, as Conversas aparecem indisponíveis, sem resposta roteirizada.

**2026-09-29, emenda: Groq para teste.** Enquanto o produto é testado sem cliente, o modelo pode vir do Groq, com um modelo aberto e o plano gratuito dele: `AGENT_PROVIDER=groq`, `GROQ_API_KEY` e `GROQ_MODEL`, sem publicar código. Um adaptador traduz o pedido e a resposta para o formato de chat do Groq, compatível com o da OpenAI, e o resto do motor não muda. A saída estruturada da Coordenação vira modo JSON, sem schema garantido, e o fallback de recusa não existe lá. É para validar o fluxo, não a qualidade: a produção volta para a Anthropic.

Neste corte, a única ferramenta dos Agentes é a consulta às Contas-alvo ativas do Workspace, e nenhuma Integração está conectada: nenhum Agente age fora da Althius. Quando as Integrações chegarem ([ADR-0017](./0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md)), elas entram como ferramentas deste mesmo motor, sob a Permissão de cada Agente.

## Considered Options

- Hermes Agent com uma instância por Workspace, um gateway e um proxy de modelo: fica para quando houver clientes pagando e uma necessidade que o motor próprio não atenda. Rever então este ADR.
- Chamar o modelo pelo navegador: descartado, porque expõe a chave e deixa o estado da Conversa no cliente.

**2026-09-29, decisão do Nan: o motor definitivo é o Hermes Agent.** O Hermes será o orquestrador e o motor de tudo:
recebe o pedido e chama o Scopus, o Ethos, o Rhetor e o Oraculum conforme o trabalho. A Edge Function
`agent-conversation` passa a ser uma ponte provisória, para testar a tela e o banco até o Hermes entrar. O que fica
valendo para o Hermes é o contrato com o banco, não o código da função: o pedido guardado antes de rodar
(`start_agent_run`), a reserva única (`claim_agent_run`), os passos gravados um a um (`append_agent_run_event`), o
fechamento com resposta ou falha (`finish_agent_run`) e a tela lendo os passos do banco. As instruções (prompts) da
função são de teste e não são o desenho do Hermes. Em aberto, no CRM-25: se o Hermes aparece para o usuário como
orquestrador com nome, o que muda o [ADR-0004](./0004-coordenacao-sem-quinto-agente.md) (Coordenação sem nome e sem
ser Agente), e onde ele roda ([ADR-0013](./0013-supabase-auto-hospedado-em-vps.md)).

**2026-09-29, ambientes (Nan).** Até a primeira venda, o app roda na Vercel com o banco no Supabase, e a ponte `agent-conversation` é o motor que os fundadores usam para prospectar. Com a primeira venda, contrata-se uma VPS e o Hermes roda nela, um perfil por Workspace, pelo mesmo contrato com o banco. Spec em `.scratch/motor-hermes/`.

**2026-09-29, revisão dos ambientes (Nan).** Não haverá fase na Vercel: o app e o Hermes vão para uma VPS da Hostinger. Antes disso, o Hermes roda no computador do Nan para ver o fluxo de ponta a ponta. Com `AGENT_PROVIDER=hermes`, a `agent-conversation` só guarda o pedido, e o worker `supabase/functions/_hermes-worker`, rodando ao lado do Hermes, busca a fila (`list_queued_agent_runs`), reserva, chama a API de runs do Hermes (`POST /v1/runs` com `Idempotency-Key`, `GET /v1/runs/{id}`) e grava a resposta. Os endpoints, a chave `API_SERVER_KEY` e os toolsets desligáveis foram conferidos na documentação oficial do Hermes (repositório NousResearch/hermes-agent).


**2026-10-14, decisão do Renan: toda IA da Althius passa pela OpenAI.** O Hermes usa o login `openai-codex`, com `gpt-6-sol` como padrão; o plano B é a chave de API da OpenAI. Nos Sinais (os passos que classificam notícia e diário oficial), isso já vale: `SIGNALS_LLM_PROVIDER` escolhe `hermes` (o passo enfileira a classificação e o worker do Hermes a responde), `openai` (API direta, `OPENAI_API_KEY` e `OPENAI_MODEL`) ou `regra` (palavra-chave, o padrão), e a Anthropic não é opção. Pendente, fora dos Sinais: a ponte `agent-conversation` e o `reply-proposal-runner` ainda usam `anthropic` como padrão quando `AGENT_PROVIDER` e `REPLY_PROPOSAL_PROVIDER` não estão definidos, e o texto acima sobre o `claude-opus-5-5` e a Messages API da Anthropic descreve o motor provisório, não a decisão atual.

**2026-10-14, decisão do Nan: Sinais pelo Hermes, enquanto só os fundadores usam.** Nos passos de IA dos Sinais, `SIGNALS_LLM_PROVIDER=hermes`, com o Hermes logado por OAuth do Codex (`openai-codex`) no modelo `luna`. O modelo é configuração do Hermes, não do código: nenhuma Edge Function nomeia modelo nem guarda chave nesse caminho, e o preço por token dos passos (`SIGNALS_LLM_PRICE_*`) continua sendo o que liquida o custo real. Vale só enquanto os fundadores são os únicos usuários: a fila (`private.signal_llm_requests`) é por Workspace, mas o login do Hermes é um só, então, com cliente de fora, rever o isolamento por Workspace antes de manter essa escolha. A API direta (`openai`) segue como plano B. A `ANTHROPIC_API_KEY` fica até a `agent-conversation` e o `reply-proposal-runner` saírem da Anthropic.

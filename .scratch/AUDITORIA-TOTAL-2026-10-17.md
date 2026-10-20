# Auditoria total — Althius (origin/main)

**Data:** 2026-10-17  
**Escopo:** somente leitura de `origin/main`  
**HEAD auditado:** `1aff4ce` — *Merge pull request #226 from Kauedz/renan/conector-clay*  
**Worktree:** `/Users/opah-001017/Documents/althius-audit-main`  
**Remoto:** Kauedz/Althius  

Regras desta auditoria: zero alteração de código; zero commit/push/merge/deploy/migration; nenhum segredo lido ou impresso. FATO = arquivo:linha, commit, teste ou ticket. INFERÊNCIA = hipótese explicitamente marcada.

Produto: Revenue OS B2B (Sinais, enriquecimento, Sequências). Não é CRM.

PRs abertos relevantes (não em main): #227 (descadastro/variáveis/lote + Propostas Hermes), #228 (rótulo status público), #229 (scratch status), #230 (UI criação em lote, base #227), #223, #48.

---

## Tabela resumo

| Vertical | Funcional? | Bloqueador principal | Esforço |
|---|---|---|---|
| A. Onboarding e entrada | parcial | Default = Demonstração (`althius:modo_demo`); Google some sem `VITE_GOOGLE_CLIENT_ID`; onboarding operacional ainda indisponível | M |
| B. Agentes e Conversa | parcial | Card “Disponível” ≠ módulo Conversas; capability depende de `AGENT_PROVIDER` + modelo; worker Hermes só na máquina do Nan | M–G |
| C. Cadência e Sequências | parcial | Criar à mão + runner Unipile em main; Rhetor/lote/descadastro/variáveis ainda em PRs (#227/#230), não em main | M |
| D. Sinais | parcial / não E2E | Actors nascem `testing`; módulo só liga com algum `available`; Apify + deploy + promoção | G |
| E. Enriquecimento e revelação | parcial | Cascata = só Apify; Apollo stub existe mas **fora** da cascata; comitê/revelar no código + testes Deno | M |
| F. Conexões | parcial | HubSpot/Notion/Clay caminhos parciais; “Você ainda não conectou” + “1 participante conectou” é **por design**; catálogo amplo incompleto | G |
| G. Config / Workspace / Plano / Contas | parcial | Contas/Contatos/import CSV e Playbook fortes; Plano/contrato e parte de Config ainda demo ou ready-for-human | M |
| H. Testes | parcial | Vitest 1387 pass / 1 fail / 4 skip; Deno 1635 pass / 0 fail; falha conhecida `conversas-reais` | P (flaky) + lacunas G |

---

## A. Onboarding e entrada no app

### (1) O que a spec promete

- **onboarding-pos-login:** Day0 + checklist; gate da Casca; quem concluiu não reentra no wizard (`precisaDoOnboarding` só se `!concluido && !day0Concluido`).
- **autenticacao-google-email:** cadastro/login Google (botão oficial + One Tap), senha, código; Workspace no primeiro acesso; convite.
- **acesso-e-planos / CONTEXT:** Workspace operacional só com sessão + participação; Demonstração isolada; visitante vê demo, não dados reais.
- Ticket **10-configurar-ambiente-e-verificar** (ready-for-human): Google Cloud Client ID, SMTP, Turnstile, checklist manual de prod.

### (2) O que o código em main faz

**FATO — default Demonstração**

```30:38:projeto-althius-frontend/src/raiz.tsx
  const [ambiente, setAmbiente] = useState<ModoDoAmbiente>(() => {
    ...
    const salvo = localStorage.getItem(CHAVE_DO_AMBIENTE) // 'althius:modo_demo'
    if (salvo !== null) return salvo === 'true' ? 'demonstracao' : 'real'
    // No protótipo, a Demonstração é o padrão.
    return 'demonstracao'
  })
```

**FATO — banner “Modo Protótipo (Completo)”** só no ramo Demonstração:

```67:71:projeto-althius-frontend/src/raiz.tsx
        ...
            <span className="font-medium text-al-ink">Modo Protótipo (Completo)</span>
```

**FATO — saída da demo:** `?auth=true`, `?demo=false`, path de acesso (`/entrar` etc.), ou botão “Acessar tela de login Supabase” → `escolherAmbiente('real')` + `localStorage althius:modo_demo=false`.

**FATO — Google some sem Client ID**

- `ContinuarComGoogle`: se `!iniciarGoogle` → `return null` (`botao-do-google.tsx:20`).
- `iniciarGoogle` só existe com `servicos.google` (`contexto.tsx:305`).
- README + `.env.example`: `VITE_GOOGLE_CLIENT_ID` obrigatório; sem ele, e-mail/senha/código seguem.
- Texto da tela **ainda cita Google** mesmo sem botão:

```91:93:projeto-althius-frontend/src/auth/tela-de-entrada.tsx
          ... com o Google, você vê a demonstração.
```

**FATO — onboarding no operacional**

- `criarAmbienteDoWorkspace` sempre coloca `'onboarding'` em `indisponiveis` e usa `criarFonteDeOnboardingIndisponivel()` (`composicao.ts:90-91,136`).
- Fonte: `ler` / todas as ações → `ErroDeModuloIndisponivel('onboarding')` (`indisponivel.ts:102-127`).
- `EntradaNaCasca` só redireciona se `estado && precisaDoOnboarding(estado)` (`entrada-na-casca.tsx:13`). Se `ler` falha, `estado` fica indefinido → **não** manda para `/onboarding` no operacional.

**INFERÊNCIA:** app.althius.com.br “abre em Modo Protótipo e manda para /onboarding” casa com (a) first visit / localStorage ausente ou `true` → Demonstração + banner; (b) na Demonstração a fonte de onboarding **é** simulada e o gate **funciona**, então quem não concluiu o Day0 da demo cai em `/onboarding` a cada visita limpa ou sem progresso salvo.

### (3) E2E Workspace operacional?

| Caminho | Operacional |
|---|---|
| Login e-mail/senha/código | Código presente; depende de Supabase Auth + SMTP/Turnstile em prod (ticket 10) |
| Login Google | Código presente; **botão some** sem `VITE_GOOGLE_CLIENT_ID` no build |
| Onboarding pós-login real | **Não** — fonte indisponível; ticket `crm-real-e-stack/24` needs-info |
| Default cliente = login real | **Não** — default código = Demonstração |

### (4) Tickets (status + caixas vazias)

| Ticket | Status | Caixas vazias / cobertura |
|---|---|---|
| onboarding-pos-login 01–05 | closed | cheias |
| autenticacao-google-email 01–08 | closed | cheias (código) |
| 09-entrar-por-convite | ready-for-human | cheias |
| **10-configurar-ambiente-e-verificar** | ready-for-human | **6 vazias** (Google Cloud, verificação marca, SMTP, Turnstile, Confirm email, checklist manual) — **código não cobre; é ops/prod** |
| 11-reaceite-termos | needs-triage | — |
| acesso-e-planos 01–08 | ready-for-human | maioria filled no papel; validação humana |
| crm-real 24 onboarding operacional | needs-info | **7 vazias** — **código não cobre** (fonte indisponível) |

### (5) Bugs e lacunas

1. **Default Demonstração em prod-like builds** — FATO `raiz.tsx:37-38`. Cliente real precisa `localStorage` ou query/`/entrar`.
2. **Copy Google sem botão** — FATO `tela-de-entrada.tsx:93` + `botao-do-google.tsx:20`.
3. **Onboarding operacional inexistente** — FATO `composicao.ts` + `indisponivel.ts`.
4. **Ticket 10** aberto: env Google/SMTP/CAPTCHA de produção.

### (6) Esforço restante: **M**

(P = só copy/env; M = onboarding backend + default real + ticket 10; G se redesenhar visitante/contrato ADR-0025.)

---

## B. Agentes e Conversa

### (1) Spec

- **agentes-em-conversa / motor-hermes / ADR-0018:** Conversas reais via `agent-conversation`; com `AGENT_PROVIDER=hermes` a edge só enfileira e o worker processa; coordenação multi-agente; Aprovações.
- Página Agentes lista agentes com estado de trabalho.

### (2) Código em main

**FATO — dois “disponível” diferentes**

1. **Card do Agente:** `ROTULO_DO_ESTADO.ocioso = 'Disponível'` (`marca.tsx:90-91`) — estado de **runtime do Agente** (ocioso/trabalhando/detectou), lido do banco.
2. **Módulo Conversas:** entra em `indisponiveis` por default; só sai se `conversasDisponiveis === true` (`composicao.ts:90-93`).

**FATO — capability**

```142:148:projeto-althius-frontend/src/fonte/supabase-conversas.ts
export async function conversasDisponiveis(cliente: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await cliente.functions.invoke('agent-conversation', { body: { action: 'capability' } })
    return !error && (data as { available?: unknown } | null)?.available === true
```

**FATO — edge `agent-conversation/index.ts`**

- `AGENT_PROVIDER` default `anthropic`; `hermes` ou `groq` também.
- `comHermes = AGENT_PROVIDER === 'hermes'`.
- `executar: comHermes ? () => Promise.resolve() : modelo ? createRunner(...) : null`
- Capability: `available: Boolean(executar)` (e motivos se false).
- Comentário no arquivo: com Hermes, **worker** (`_hermes-worker`) busca e roda; a função só guarda o pedido.

**FATO — UI Agentes:** `SeloDeEstado` / “Disponível” no card **não** consulta capability de Conversas. Banner `AvisoDeModuloIndisponivel` / texto “INDISPONÍVEL: Conversas…” vem de `disponivel('conversas')` / set `indisponiveis`.

**Contexto user (não verificável no repo):** prod `AGENT_PROVIDER=hermes`; worker só na máquina do Nan.

**INFERÊNCIA:** se o card diz Disponível e o módulo diz INDISPONÍVEL, capability retornou false (função ausente, erro de invoke, ou provider sem modelo e sem hermes na edge deployada). Se capability true com hermes mas worker offline, UI pode mostrar Conversas “ligadas” e runs enfileiram até timeout (~10 min).

### (3) E2E operacional?

| Peça | Main | E2E real |
|---|---|---|
| Lista/config Agentes | supabase-agentes | sim (persistência) |
| Conversar / coordenar | edge + runner ou hermes worker | **só se** capability true **e** motor/worker vivo |
| Aprovações ligadas a conversas | sim no código | acoplado a conversas |

### (4) Tickets

Muitos em agentes-em-conversa / motor-hermes / mencoes / orquestracao: mistura closed e ready-for-*.  
`crm-real-e-stack/14-executar-conversas` ready-for-human (filled).  
`crm-real-e-stack/25-avaliar-hermes` needs-info.  
Slack-canal 06 ready-for-agent (7 vazias) — conversa Slack na Althius.

### (5) Bugs / lacunas

1. **Contradicao UX card vs módulo** — FATO dois eixos; não é bug de string única, é produto confuso.
2. **Hermes worker não é deploy de produção no repo** — FATO `_hermes-worker/` existe; user: só máquina Nan → **INFERÊNCIA** prod sem worker = Conversas mortas ou timeout mesmo com capability true.
3. **Teste flaky/fail** `conversas-reais.test.tsx` (ver H).

### (6) Esforço: **M–G**

(M = alinhar UX + garantir env/capability; G = worker Hermes em VPS 24/7 + orquestração multi-agente completa da spec.)

---

## C. Cadência e Sequências

### (1) Spec

Criar Sequência (mão e via Rhetor na Conversa), passos, canais Unipile, sequence-runner, pausa por resposta, variáveis, descadastro, criação em lote, resposta sugerida (Rhetor).

### (2) Código em main

**FATO em main (`1aff4ce`):**

- `criarSequencia` em `supabase-sequencias.ts:480`.
- UI manual: `nova-sequencia.tsx`, `sequencias.tsx`, `detalhe-conta.tsx`.
- Nascimento via Conversa: `nascimento-sequencia-na-conversa.tsx` (exige `fonteDeSequencias` + conversas).
- Empty state cita Rhetor só se `disponivel('conversas')` (`sequencias.tsx:123`).
- **sequence-runner** + Unipile: functions `sequence-runner`, `sequence-step-sends`, `unipile-account-status`; pg_cron `kick_sequence_runner`; README de deploy.
- Pausa / `motivoPause` em detalhe-conta e sequências (parcial; rótulo público PT em PR #228, não main).
- Resposta sugerida: `resposta-sugerida.tsx` + tetos automação.

**FATO NÃO em main (PRs abertos):**

- #227 `cadencia/descadastro-e-variaveis` — descadastro, variáveis, lote backend, Propostas Hermes.
- #230 UI lote (base #227).
- #228 rótulo `Pausada` / `motivoPause` na UI pública.

### (3) E2E operacional?

| Capacidade | Main | E2E |
|---|---|---|
| Criar à mão | sim | sim se backend sequências ok |
| Via Rhetor (IA) | UI depende de Conversas + fluxo nascimento | **trava se Conversas INDISPONÍVEL (B)** |
| Envio Unipile + runner | código + cron | **deploy:** configure_sequence_runner URL, UNIPILE_API_KEY, JWT flags |
| Descadastro / variáveis / lote UI | **não main** | PRs |
| Pausa por resposta | lógica canais + webhooks | parcial; testes Deno unipile |

### (4) Tickets

- prospeccao C1/C3 closed (chat sequência).
- playbook 05 cadência→modelo closed.
- Filas sequencias / canais-cadencia: vários ready-for-human e agent (detalhar no scratch ao implementar).
- Caixas vazias críticas em PRs abertos, não main.

### (5) Lacunas

1. Rhetor E2E bloqueado por B.
2. #227/#230/#228 fora de main.
3. Runner depende de ops (URL + token + Unipile).

### (6) Esforço: **M** (merge PRs + B + ops runner) ou **G** se Unipile/prod nunca configurado.

---

## D. Sinais

### (1) Spec

Catálogo, coletores Apify, cascatas, auditoria, cron `althius-internal-signals`, estados available/testing/out.

### (2) Código

**FATO — gate do módulo**

```105:110:projeto-althius-frontend/src/fonte/supabase-sinais.ts
export async function sinaisDisponiveis(...): Promise<boolean> {
  return [...(await estadosDosSinaisReais(cliente)).values()].includes('available')
}
```

**FATO — seed:** actors nascem `testing` (`20260930130000_registro_de_actors.sql`); pgTAP espera 12 em testing (`supabase/tests/registro_de_actors.sql`).

**FATO — functions:** `signal-scan`, `signal-runner`, `signal-cascade`, `signal-request-notify`, `account-discovery`.

**FATO — monitoramento** só processa actor `state = 'available'` (migrations monitoramento).

**FATO — ticket A3** `prospeccao-funcional/A3-actors-validados-disponiveis` ready-for-agent, **4 caixas vazias** (migration promove available).

### (3) E2E?

Sem actor `available` no banco de prod → módulo Sinais **indisponível** no operacional. Geração real depende Apify token + scan/runner deploy + promoção. Cron interno de sinais: migrations referem `althius-internal-signals` (ex. proposta recusada).

**INFERÊNCIA:** em prod “o que gera Sinal hoje” = no máximo sinais internos / interações se migrados; externos Apify provavelmente ainda testing.

### (4) Tickets

- A3 ready-for-agent (vazias).
- cascatas-confiabilidade 01–05 ready-for-human.
- crm-real 11 coletar Apify ready-for-agent (6 vazias).
- auditoria-de-sinais e specs de coletores: ver `.scratch/modulo-de-sinais` etc.

### (5) Lacunas

1. Nenhum available no seed.
2. Dependência Apify + deploy.
3. FE testes de sinal poucos (~2 arquivos).

### (6) Esforço: **G**

---

## E. Enriquecimento e revelação

### (1) Spec

Cascata de contatos, comitê (B2), revelar e-mail (B3), créditos, Apollo/Apify/Clay.

### (2) Código

**FATO — cascata só Apify**

```400:405:supabase/functions/_shared/provedor-de-contatos.ts
 * Só os actors do Apify: Apollo, Lusha e Clay são do cliente e entram pelas Conexões, nunca aqui
export function fornecedoresDaCascata(deps: { apify?: Apify }): ProvedorDeContatos[] {
  return deps.apify ? [new ApifyProvedorDeContatos({ apify: deps.apify })] : []
}
```

**FATO — `ApolloProvedorStub` existe** (linha ~343) mas **não** entra em `fornecedoresDaCascata`.

**FATO — account-enrichment:** actions `comite-compra`, `revelar-contato`; testes Deno debitam créditos (1 comitê/contato, 2 e-mail se achou, 0 se não).

Tickets B1/B2/B3 ready-for-human (checkboxes filled no papel).

### (3) E2E?

Código + testes unitários Deno fortes. E2E prod = Apify + créditos + sessão. Apollo “só Agentes/Conexões”, não cascata Althius — alinhado ao comentário Nan 01/10/2026.

### (4–5) Lacunas

- Apollo na cascata: **propositalmente ausente** (não bug se decisão vale).
- Sem Apify → cascata vazia.
- Créditos moeda única: tickets 01–09 ready-for-human.

### (6) Esforço: **M**

---

## F. Conexões

### (1) Spec

Catálogo, habilitar por Admin, Acesso por participante (HubSpot, Notion, Apollo, Clay, Pipedrive, Slack, …).

### (2) Código + incoerência Notion

**FATO — não é bug de estado cruzado; são duas frases**

```557:568:projeto-althius-frontend/src/paginas/conexoes.tsx
    acesso.conectados === 1 ? '1 participante conectou' : `${acesso.conectados} participantes conectaram`
...
        <span className="text-sm text-al-muted">Você ainda não conectou</span>
```

- “Você ainda não conectou” = **seu** Acesso.
- “1 participante conectou” = contagem no Workspace.

**FATO:** fonte supabase-conexoes; PR #226 Clay merged em main (`1aff4ce`). PR #48 catálogo ainda open. HubSpot/Notion tickets ready-for-human com filled; sync HubSpot wontfix; Apollo/Lusha/Meta ready-for-agent (vazias).

### (3) E2E

Parcial: conectar Acesso Notion/HubSpot/Clay conforme o que está deployed; sync profundo HubSpot wontfix.

### (4) Caixas vazias notáveis

- 02 catálogo: 8 vazias ready-for-human (+ PR #48).
- 07 retirar integração: 7 vazias ready-for-agent.
- 10 Apollo, 12 Lusha, 13 Meta: 6 vazias each.
- 15–28 needs-triage (2 vazias cada, pesquisa MCP).

### (6) Esforço: **G** (catálogo completo); **P** se só explicar copy Notion.

---

## G. Configurações, Workspace, Plano, Aprovações, Contas/Import

### (1–2)

**FATO fortes em main:** Contas/Contatos, import CSV (`importar-contas.tsx` + testes), Playbook seções/import xlsx, participantes/convites, perfil, Agentes config, Aprovações (com conversas), contas remetentes Unipile (UI + tests).

**FATO fracos / demo / humano:**

- `indisponiveis` inclui `configuracoes` no operacional — parte das telas usa fontes reais sobrepostas; comentário composicao: “o resto de Configurações, ainda não”.
- Plano/contrato: `lerResumoDoContrato`, tickets acesso-e-planos ready-for-human.
- Onboarding operacional: indisponível (A).

### (3) E2E: Contas/import **sim** (código); Plano comercial e onboarding empresa **não** completos.

### (4) Tickets G: configuracoes 01–09 closed (muitos demo); contas-e-contatos closed; acesso-e-planos ready-for-human; playbook 04 needs-info (2 vazias).

### (6) Esforço: **M**

---

## H. Testes

### (1) Pedido

Rodar `npx vitest run --maxWorkers=2` e Deno `supabase/functions`.

### (2) Resultados (FATO, 2026-10-17, worktree audit-main)

**Vitest** (`projeto-althius-frontend`, isolate workers):

| Métrica | Valor |
|---|---|
| Test Files | **1 failed \| 162 passed (163)** |
| Tests | **1 failed \| 1387 passed \| 4 skipped (1392)** |
| Duration | ~207.5 s |
| EXIT | 1 |

**Única falha:**

```
FAIL src/paginas/conversas-reais.test.tsx
  > Conversas no Workspace operacional, com o modelo configurado
  > depois de recarregar, a Conversa coordenada volta como estava, sem reenviar o pedido
Error: expect(element).toBeInTheDocument()
  conversas-reais.test.tsx:131 — 'Temos a Alfa Incorporadora.'
```

**Deno** (`deno test --allow-all supabase/functions`, Deno 2.9.7):

| Métrica | Valor |
|---|---|
| Resultado | **ok \| 1635 passed \| 0 failed (~14 s)** |

Logs: `~/.hermes/cache/scratch/althius-vitest-audit.txt`, `althius-deno-audit.txt`.

### (3) Cobertura por vertical (aproximação por nome de arquivo FE)

| Área | ~arquivos *test* FE |
|---|---|
| onboarding | 2 |
| auth | 3 |
| agentes | 6 |
| conversa | 12 |
| sequência | 12 |
| sinal | 2 |
| enriquec | 3 |
| conexões | 7 |
| config | 19 |
| conta | 21 |
| import | 4 |
| aprovação | 9 |
| plano | 1 |
| **Deno functions** | **177** arquivos de teste |

### (4) Lacunas de teste

- Sinais E2E / actors available: fraco no FE.
- Onboarding operacional: quase só demo.
- Google real / ticket 10: manual.
- conversas-reais flaky/fail em main.
- pgTAP existe (actors etc.) — não reexecutado nesta auditoria (só Vitest + Deno functions).

### (6) Esforço fail conhecida: **P**; cobertura vertical D/E prod: **G**.

---

## Fila priorizada

| # | O que fazer | Por que | Quem | Esforço |
|---|---|---|---|---|
| 1 | Confirmar em prod: `VITE_GOOGLE_CLIENT_ID` no build; se ausente, configurar + redesploy FE | Botão Google some; copy mente | **Nan/ops** + Renan | P |
| 2 | Confirmar edge `AGENT_PROVIDER`, deploy `agent-conversation`, e **worker Hermes 24/7** (não só laptop Nan) | Conversas INDISPONÍVEL ou runs mortos | **Nan** | M |
| 3 | Decidir default de `raiz.tsx`: prod build → `real` (ou forçar `/entrar`) em vez de Demonstração | app.althius “sempre protótipo” | **agente código** + Renan | P–M |
| 4 | Alinhar UX Agentes: card não dizer “Disponível” genérico se módulo Conversas off; ou unificar copy | Contradição reportada | **agente código** | P |
| 5 | Ticket auth 10: Google Cloud, SMTP, Turnstile, checklist manual | Login real cliente | **Nan/Renan** ops | M |
| 6 | Merge path #227 → #230 → main (descadastro, variáveis, lote) + #228 rótulo pausa | Cadência incompleta em main | **Renan** review + merge Kauedz | M |
| 7 | Ligar Conversas (2) → testar nascimento Sequência via Rhetor E2E | Spec C | Renan + Nan | M |
| 8 | sequence-runner: `configure_sequence_runner`, Unipile, cron vivo em prod | Envio real | **Nan** | M |
| 9 | A3: promover actors validados a `available` + Apify | Sinais módulo off | **Nan** validação + **agente** migration | G |
| 10 | Onboarding operacional (crm-real 24) ou remover gate/docs | Spec A incompleta no real | produto + agente | G |
| 11 | Corrigir `conversas-reais.test.tsx` (reload conversa) | Suíte main vermelha 1 | **agente código** | P |
| 12 | Copy Conexões: opcional tooltip “você” vs “workspace” | Notion “incoerência” | agente | P |
| 13 | Apollo na cascata: **não** fazer se decisão Nan vale; documentar | Expectativa vs código | Renan docs | P |
| 14 | Catálogo conexões (#48, tickets 10/12/13…) | Integrações longas | agente + humano | G |
| 15 | Créditos moeda única + planos ready-for-human | Comercial | produto | G |

---

## Método e limites

- Leitura: CONTEXT.md (parcial), composicao, raiz, auth, conversas, agent-conversation, sinais, provedor-de-contatos, conexoes, sequencias, enrich handler, tickets `.scratch` (scan status/checkboxes), `gh pr list`.
- ADRs: referenciados pelas specs (0012 auth, 0018 hermes, 0022 aprovações, 0025 visitante); não relidos linha a linha todos.
- **Não** acessou produção app.althius nem secrets.
- **Não** rodou pgTAP nesta rodada.
- PRs #227–#230 **fora** do HEAD auditado; mencionados só como delta.

---

## Conclusão em uma linha

**origin/main** entrega Demonstração rica + pedaços sólidos de operacional (Contas, parte de Sequências/Unipile, enrich Apify, Conexões parciais, suíte grande), mas **cliente “de verdade” ainda tropeça no default demo, Google env, Conversas/Hermes worker, Sinais em testing e cadência avançada só em PRs.**

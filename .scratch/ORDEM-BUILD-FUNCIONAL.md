# Ordem de build funcional (CRM × Canais)

Guia curto para executar o primeiro envio real sem duplicar Unipile no CRM.

## Ownership (uma linha)

**Unipile + ciclos E-mail/WA/LI** → `.scratch/canais-cadencia-backend/` (canais-03/04/06/07). **CRM** → Contas/Contatos/tenant/Seq↔UUID; CRM-16/19/20/21 são **ponteiros**, não implementação.

## Marco atual: primeiro envio real

Decidido em 2026-09-25. O próximo marco é o tracer de envio: um e-mail real sai pela Conta remetente de um vendedor da equipe, e a resposta real pausa a Sequência. Ele roda na pré-produção ([ADR-0013](../docs/adr/0013-supabase-auto-hospedado-em-vps.md), revisão), no Workspace pessoal e com o app local, sem depender de publicar o frontend.

| Passo | Estado em 2026-09-26 |
| --- | --- |
| CRM-01, Auth-01 a Auth-08, CRM-04, CRM-05 e canais-01 | na `main` |
| CRM-17 | Não bloqueia o tracer: a Sequência grava o UUID da Conta-alvo como texto, e os Contatos já exigem uma Conta-alvo real. |
| canais-02 | Fechado em 2026-09-26, com a conferência na tela e a correção da perda de passos. |
| canais-03 | Unipile v2 configurada (teste grátis) e uma caixa Gmail real conectada de ponta a ponta, em `ready`. Faltam os estados na interface (o módulo Conexões está indisponível no modo operacional), que não bloqueiam o envio. |
| canais-04 | Fechado em 2026-09-26: um e-mail real saiu pela Conta remetente, e a resposta real pausou a Sequência com o anexo guardado. O teste grátis da Unipile acaba por volta de 2026-10-03. |
| canais-05 | Em andamento: a Sequência roda com o navegador fechado (banco, executor e tela, em três PRs). |

Pendências humanas do tracer:

- um destinatário real que responda ao teste.

A conta Unipile, os segredos no Supabase e a caixa de e-mail conectada ficaram prontos em 2026-09-26.

## Pré-requisitos de ambiente (responsável pelo produto)

Antes do cadastro e login (tickets em `.scratch/autenticacao-google-email/issues/`) funcionarem fora do ambiente local (detalhes em `.scratch/autenticacao-google-email/spec.md`):

- Google Cloud: cliente OAuth, tela de consentimento, domínio verificado, página inicial e política de privacidade; pedir verificação de marca cedo (pode levar 2–3 dias úteis).
- SMTP de produção (ex.: Resend) configurado no Supabase Auth; necessário também para os convites do CRM-03.
- Redirect URLs do app registradas no Supabase Auth por ambiente.
- Cloudflare Turnstile (CAPTCHA) com chave secreta no Supabase Auth.

## Ordem — early send (tracer de envio)

1. **CRM-01** — separar modo real e Demonstração  
2. **Auth-02 a Auth-08** (`.scratch/autenticacao-google-email/issues/`) — cadastro e login (Google, senha e código) e Workspace pessoal; substituem o CRM-02 (não fazer o CRM-02). Auth-01 já está fechado; Auth-09 (convite, exige CRM-03) e Auth-10 (ambiente, humano) ficam fora deste corte  
3. **CRM-04** — Contas-alvo reais  
4. **CRM-05** — Contatos e vínculos reais  
5. **CRM-17** (se FK textual Seq↔Conta bloquear) — vincular Sequências às Contas reais  
6. **canais-01** — acesso real e responsabilidade exclusiva  
7. **canais-02** — documento com destinatários reais  
8. **canais-03** — conectar canais pessoais Unipile  
9. **canais-04** — primeiro ciclo real E-mail ← primeiro send tracer  

Depois do tracer: **canais-05** (background) → **canais-06** (WhatsApp) → **canais-07** (LinkedIn) → propostas/aprovação (08–09) conforme dependências.

## Ordem — foundation-first (fases CRM)

Fases 0–1 CRM (01→02→04→05, +17 se necessário) → canais-01…04 para tracer → Fases 2–3 (Sinais/Agentes) podem esperar se o objetivo for envio cedo → Fase 4 CRM só consome canais (não reimplementa Unipile).

## Ponteiros CRM (não implementar)

| Ticket CRM | Implementar em |
| --- | --- |
| CRM-16 | canais-03 |
| CRM-19 | canais-04 |
| CRM-21 | canais-06 |
| CRM-20 | canais-07 |

## Workspace da empresa e onboarding

Fora do tracer, que roda no Workspace pessoal. Depois do CRM-03: **CRM-22** (criar Workspace da empresa) → **CRM-24** (onboarding operacional, após triagem) → **CRM-23** (sugestão por domínio, após decidir a validação do domínio).

## Fora do primeiro corte

- canais-13 (LGPD / `needs-info` quando existir na branch)  
- Fases 2–3 completas (Sinais/Agentes) se early send for prioridade  
- Billing, conectores demo (HubSpot etc.), enriquecimento amplo (Fase 5)  
- Reimplementar Unipile/ciclos dentro de `.scratch/crm-real-e-stack/`

## Frentes em paralelo

Desde 2026-09-26 duas frentes andam ao mesmo tempo, em sessões separadas. O HubSpot deixou de ficar fora do corte e ganhou uma spec própria, que corre em paralelo sem mexer no marco do envio.

| Frente | Quem | É dona de |
| --- | --- | --- |
| Envio (canais-03 e canais-04) | Kauê | Contas remetentes, Sequências, Interações e as Edge Functions `sender-accounts` e `unipile-account-status` |
| Conexões funcionais (spec própria) | Renan | a tela `/conexoes` (Canais e Integrações) e a sincronização do HubSpot com Contas-alvo e Contatos |

Combinados:

- `/conexoes` é da frente de Conexões. A tela das Contas remetentes, quando vier, fica fora dela.
- A Unipile é uma só: uma única conta ativa por vez, a conexão ativa ([ADR-0024](../docs/adr/0024-contratos-v1-e-v2-da-unipile-e-troca-de-conta-sem-perder-historico.md)), com a chave e o segredo do webhook no Vault. As variáveis `UNIPILE_*` ficam só de reserva da conexão padrão. Nenhuma frente altera as Edge Functions, os segredos `UNIPILE_*` ou o Webhook Endpoint da outra, nem roda o `scripts/wizard-unipile.sh` sem combinar. Se um Canal usar a Unipile, ele ganha funções e um Webhook Endpoint próprios, e cada handler ignora eventos de contas que não são dele.
- As funções que escrevem em Contas-alvo e Contatos (`save_target_account`, `create_contact`, `update_contact`, `link_contact`, `end_contact_link`) são da frente de Conexões. A frente de envio só lê. Sequências (`create_sequence`, `update_owned_sequence`, `upsert_target_contact`), Interações (`register_account_interaction`) e Contas remetentes são da frente de envio.
- Uma mudança de e-mail vinda do HubSpot atualiza o Contato, mas não o Destino de um passo confirmado. Esse passo espera a reconfirmação do Vendedor responsável ([ADR-0014](../docs/adr/0014-passo-confirmado-guarda-o-destino.md)).
- No glossário, o Canal pode se chamar Gmail. A Conta remetente de E-mail continua E-mail, porque aceita Google, Outlook e IMAP.
- Migrations seguem `docs/agents/migrations.md`, com o timestamp UTC do momento. Antes de aplicar uma no remoto, confira a última versão já aplicada.

### Conexões funcionais: andamento

- Decisões: [ADR-0016](../docs/adr/0016-sincronizacao-do-hubspot-so-le-e-respeita-o-responsavel.md) (a Sincronização do HubSpot só lê e respeita o Vendedor responsável) e [ADR-0017](../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md) (Integrações pelo servidor MCP oficial, com um Acesso por participante).
- O Canal continua "E-mail" no glossário: decidido no grill das Conexões em 2026-09-26, porque o provedor pode ser qualquer um. Nada muda para a Conta remetente.
- Meta: o catálogo inteiro da tela Conexões funcionando. Começa pelo HubSpot, depois o Notion, e segue uma Integração por vez (Apollo, Clay, Lusha e Meta Ads já têm ticket). Os Canais vêm quando os Agentes tiverem backend.
- Tickets em `.scratch/conexoes-funcionais/issues/`. Em 2026-09-26: 01 (pesquisa dos servidores MCP) fechado; 02 é o próximo.
- Depois desta spec: uma spec própria para a Althius como servidor MCP, para o Claude ou o ChatGPT se conectarem a ela.

## Specs

- CRM: `.scratch/crm-real-e-stack/spec.md`  
- Canais (SoT Unipile): `.scratch/canais-cadencia-backend/spec.md`
- Conexões funcionais: `.scratch/conexoes-funcionais/spec.md`

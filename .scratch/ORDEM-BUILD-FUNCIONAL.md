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
| canais-02 | Código e pgTAP prontos. Falta a conferência na tela com dados reais. |
| canais-03 | Faltam os estados na interface (o módulo Conexões está indisponível no modo operacional), o bloqueio de envio na reconexão, publicar as Edge Functions e as credenciais da Unipile. |
| canais-04 | Depois do 02 e do 03. Inclui o Destino confirmado ([ADR-0014](../docs/adr/0014-passo-confirmado-guarda-o-destino.md)). |

Pendências humanas do tracer:

- uma conta Unipile v1, com DSN e chave de API;
- os segredos da Unipile no Supabase;
- uma caixa de e-mail real de um vendedor para conectar;
- um destinatário real que responda ao teste.

## Pré-requisitos de ambiente (responsável pelo produto)

Antes do cadastro e login (tickets em `.scratch/autenticacao-google-email/issues/`) funcionarem fora do ambiente local (detalhes em `.scratch/autenticacao-google-email/spec.md`):

- Google Cloud: cliente OAuth, tela de consentimento, domínio verificado, página inicial e política de privacidade; pedir verificação de marca cedo (pode levar 2–3 dias úteis).
- SMTP de produção (ex.: Resend) configurado no Supabase Auth; necessário também para os convites do CRM-03.
- Redirect URLs do app registradas no Supabase Auth por ambiente.
- Cloudflare Turnstile (CAPTCHA) com chave secreta no Supabase Auth.

## Ordem — early send (tracer de envio)

1. **CRM-01** — separar modo real e Demonstração  
2. **Auth-01 a Auth-08** (`.scratch/autenticacao-google-email/issues/`) — cadastro e login (Google, senha e código) e Workspace pessoal; substituem o CRM-02  
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

## Specs

- CRM: `.scratch/crm-real-e-stack/spec.md`  
- Canais (SoT Unipile): `.scratch/canais-cadencia-backend/spec.md`

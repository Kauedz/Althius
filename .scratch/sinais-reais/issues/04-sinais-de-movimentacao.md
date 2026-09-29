# 04: Sinais de movimentação de pessoas (LinkedIn)

**What to build:** os tipos de Sinal do catálogo de lançamento: Contato mudou de emprego ou foi promovido (harvestapi/linkedin-profile-scraper, comparando com a leitura anterior), nova liderança (harvestapi/linkedin-profile-search), entradas e saídas (harvestapi/linkedin-company-employees) e anúncio público de movimentação (harvestapi/linkedin-post-search), com cargos brasileiros classificados. Cada tipo ganha o formulário de Monitoramento que já existe na Demonstração e passa a rodar de verdade.

**Blocked by:** 02: Monitoramento real.

**Status:** ready-for-agent

## Pode mexer

- A transformação do resultado do actor em Sinal, num módulo por tipo, com teste sem rede.
- O cadastro do tipo no registro de actors.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Cada tipo testado com um resultado de exemplo do actor, sem dado pessoal real.
- [ ] Validar numa execução real (a IA prepara; roda com o `APIFY_TOKEN` do Supabase) e registrar o custo observado.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar `signal-scan` e conferir no app um Monitoramento de teste com uma Conta real.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

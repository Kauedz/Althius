# 01: Fornecedores da cascata

**What to build:** a lista ordenada de fornecedores de dados da Althius (actors do Apify de LinkedIn e da Receita Federal primeiro; fornecedores pagos depois), cada um com o que devolve e o custo, e o contrato único que a cascata chama.

**Blocked by:** None.

**Status:** ready-for-agent (decidido: a base é o Apify; falta validar os actors numa execução real)

## Pode mexer

- Um módulo de cascata em `supabase/functions/_shared/`, com cada fornecedor por injeção de dependência.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] A cascata para no primeiro que acha; cada tentativa tem custo registrado.
- [ ] Dado vindo de fornecedor grava a Origem do campo (CONTEXT) e não sobrescreve correção manual.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Escolher e contratar os fornecedores pagos de e-mail e telefone; as chaves vão só nos segredos do Supabase.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- **Decisão do Nan (2026-10-01):** a base do enriquecimento (e dos Sinais) é o **Apify**, com os actors que a Althius instala: dados da Receita Federal, LinkedIn e scraping da internet. Apollo, Lusha e similares muitas vezes não trazem dados de empresa brasileira.
- Os fornecedores pagos (Apollo, Lusha, Snov.io, Hunter.io...) **não entram na cascata da Althius**: o cliente os conecta nos Agentes dele, pelas Conexões, e os Agentes buscam lá com a conta do cliente. A cascata própria começa só com os actors do Apify.
- Para construir: escolher os actors (Receita Federal por CNPJ, perfil do LinkedIn) e validar cada um numa execução real, como os Sinais 03 e 04 fizeram; precisa de uma sessão com o Network access do Apify liberado.

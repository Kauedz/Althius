# Spec: Conector Clay funcional

**Status:** ready-for-agent

**Frente:** Conexões funcionais, leva 1 da força-tarefa "todos os conectores do catálogo funcionais". Segue a spec geral [`conexoes-funcionais/spec.md`](../conexoes-funcionais/spec.md) e a [ADR-0017](../../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md), a [ADR-0022](../../docs/adr/0022-permissao-por-ferramenta-do-conector.md) e a [ADR-0002](../../docs/adr/0002-permissoes-ler-propor-executar.md). Parte do ticket [`conexoes-funcionais/11`](../conexoes-funcionais/issues/11-conectar-o-acesso-ao-clay.md), que fez o perfil e a migration do Clay (PR #226). Esta spec cobre o que faltou para o Clay ser **funcional**, e não só aparecer no catálogo.

## Problem Statement

O Clay já está no catálogo e tem perfil de conexão, mas não está pronto para virar "disponível":

- As ferramentas do servidor MCP do Clay gastam os **créditos do workspace Clay do Cliente**, no mesmo valor de quando o trabalho é feito dentro do Clay. O catálogo marca o Clay como `writes = false`, e a Permissão padrão dos Agentes nele é Ler. Uma ferramenta de "encontrar e enriquecer" que o Clay marque `readOnlyHint` rodaria sem Aprovação e gastaria crédito do Cliente.
- Desconectar só apaga o Acesso na Althius. O token continua válido no Clay até vencer, e a autorização fica listada no Clay.
- Os testes do app não cobrem o cartão do Clay nos seus estados, e não há prints.
- Ninguém conectou uma conta real do Clay.

## Solution

O Clay passa a valer como Integração que **gasta**: toda ferramenta do Clay é tratada como escrita ou gasto, mesmo com `readOnlyHint`, então pede Aprovação até o Administrador decidir outra regra (ADR-0022). A Permissão padrão dos Agentes nele (Propor, decisão do usuário) espera confirmação, porque muda testes antigos; até lá fica em Ler (ticket 01). Desconectar o próprio Acesso passa a revogar o token no app (RFC 7009) sempre que o servidor de autorização anunciar `revocation_endpoint`. Isso vale para qualquer conector por OAuth, não só para o Clay, e acontece pela arquitetura compartilhada. O cartão do Clay ganha cobertura de teste e prints. O Clay só passa a "disponível" depois do teste com conta real.

## Fluxo visível ao usuário

1. **Administrador**: Conexões > Clay > **Habilitar**. O Membro vê "Não habilitada" e que só um Administrador habilita.
2. **Participante**: **Conectar no Clay** abre `app.clay.com/oauth/authorize`. O Clay pede login, a escolha do workspace do Clay (a pessoa precisa ser membro dele) e o consentimento, que mostra a Althius como "Unverified application", com o endereço de retorno.
3. A volta cai em `integration-callback` e leva a Conexões com "Conectado". A conta do Clay não é identificada no cartão (não há endpoint documentado), então ele mostra só "Conectado".
4. **Ver ferramentas** lista o que o servidor do Clay oferece (`tools/list`), cada uma marcada como escreve ou gasta.
5. **Desconectar**: o Acesso some do cartão e o token é revogado no Clay. Se a revogação falhar (rede, Clay fora do ar ou recusa), a pessoa continua desconectada na Althius e vê um aviso: a Althius não conseguiu avisar o Clay, e a pessoa pode remover a autorização nas configurações do Clay.

## Erros e reconexão

| Situação | O que a pessoa vê |
| --- | --- |
| Consentimento recusado no Clay | "Autorização recusada", sem conectar |
| Tentativa vencida (mais de 10 min) | "A autorização venceu; tente de novo" |
| Clay fora do ar na descoberta ou na troca | "Não foi possível falar com o Clay agora" |
| Admin do Clay desligou o toggle **Unknown** em *Allowed MCP clients* | Na conexão: recusa do Clay, "Autorização recusada". Com Acesso: a renovação é recusada (o Clay reconfere a política a cada emissão) e o cartão vai para "Precisa reconectar" |
| Token revogado no Clay ou vencido sem renovação | "Precisa reconectar", com o mesmo botão |
| Participação desativada | O Acesso deixa de ser usado (regra geral) |

## Permissões Ler, Propor, Executar

- `private.integration_catalog.writes = true` para o Clay. O usuário decidiu (19/10/2026) que o padrão das Especialidades no Clay é Propor, mas essa troca muda o que três pgTAP antigos fixam. Por isso esta leva deixa o padrão em Ler, o lado mais restritivo, e a troca para Propor espera a confirmação do usuário (ticket 01). Os Agentes já criados mantêm a Permissão que têm.
- O perfil do Clay declara `ferramentasGastam: true`: `escreve` é sempre verdadeiro para as ferramentas do Clay, com ou sem `readOnlyHint`. Pela ADR-0022, sem regra decidida, toda chamada pede Aprovação. Com Ler, o Agente não chama nenhuma ferramenta do Clay. Com Executar e regra "sempre", decidida pelo Administrador, executa.
- O teto de créditos do Clay por usuário em plataformas externas é configurado pelo admin no próprio Clay, fora da Althius. Os créditos da Althius ([ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md)) não são debitados por chamadas ao Clay do Cliente.

## Isolamento e credenciais

- A revogação só manda o token ao emissor que o emitiu (`issuer` guardado no Acesso), com o cliente que o recebeu, e só a um `revocation_endpoint` https na mesma origem do `token_endpoint`.
- O Acesso é por participante, Workspace e Integração. Só quem conectou usa o próprio Acesso; desconectar e revogar mexem só no Acesso de quem pediu, identificado pelo JWT.
- O token fica no Vault (`private.integration_accesses`) e só a Edge Function o lê. A revogação acontece na Edge Function, e nenhum token aparece em resposta, log ou mensagem de erro.
- O cliente OAuth do Clay é registrado dinamicamente uma vez por ambiente e reaproveitado. O Clay limita o registro público a uma rajada de 4 e a 10 por hora por IP.

## Fora do escopo

- Revogar no app os tokens apagados quando um Administrador **retira a Integração** ou quando uma Participação é desativada. Fica como follow-up da frente de Conexões.
- Identificar a conta e o workspace do Clay no cartão.
- Os Agentes chamarem o Clay numa Conversa: o caminho já existe (`usar_conector`); esta leva só garante que gastar pede Aprovação.

## Testes

- **Deno**: revogação RFC 7009 (`oauth.ts`): corpo, autenticação do cliente, 200, 4xx e 5xx; `desconectarAcesso` (`integration-access.ts`): revoga o refresh e o access token e apaga o Acesso, apaga mesmo quando a revogação falha, não revoga Acesso por chave de API e não toca no Acesso de outra pessoa; o handler `integration-connect` com `action: 'desconectar'`; e o perfil do Clay marcando toda ferramenta como gasto.
- **pgTAP**: `writes` do Clay, o padrão das Especialidades (Ler, até a decisão do ticket 01) e a nova RPC de serviço de desconectar (só `service_role`, só o Acesso do próprio participante, Participação ativa).
- **App (vitest)**: o cartão do Clay em todos os estados, a desconexão pela Edge Function e o aviso quando a revogação falha.
- **Conferência visual**: prints em `issues/prints/`.
- **Real**: ticket humano (04).

## Critérios de aceite para "disponível"

1. CI verde e PR mergeado.
2. Migrations aplicadas no remoto e funções publicadas, conferidas pelas consultas do ticket 04.
3. Teste real com uma conta Clay: habilitar, autorizar, listar ferramentas, uma chamada de leitura que não gaste ou gaste o mínimo, sob Aprovação, desconectar (com o token revogado conferido no Clay), reconectar, e o toggle Unknown desligado levando a "Precisa reconectar".
4. Só então `available = true` para o Clay.

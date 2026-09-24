# 13: Trazer e-mail e telefone do Contato quando a conexão do LinkedIn é aceita

**What to build:** quando uma conexão do LinkedIn pessoal do vendedor é aceita, detectar o aceite pelo webhook `new_relation` da Unipile e consultar uma única vez o perfil da nova conexão pela Conta remetente do titular. Com relação `FIRST_DEGREE`, gravar no Contato os e-mails e telefones de `contact_info`, com origem, titular e data. Campos vazios ficam “não disponível no LinkedIn”. O uso em remarketing e o fallback pela Treg ficam fora deste ticket. Ver a seção “Enriquecer o Contato quando a conexão do LinkedIn é aceita” da spec.

**Blocked by:** 02: Documento da Sequência com destinatários reais; 03: Conectar canais pessoais pela Unipile.

**Status:** needs-info (regra de captura confirmada pelo Renan em 2026-09-24; a regra de correspondência com Contato e Conta-alvo é proposta, e as decisões pendentes (a) base legal na LGPD e (b) visibilidade Workspace × vendedor aguardam o Renan)

- [ ] O webhook de usuários (`source: "users"`, evento `new_relation`) é recebido com autenticação própria do contrato v1, persistido antes do HTTP 200 e deduplicado. Ele não conta como resposta comercial nem pausa a Sequência.
- [ ] O produto trata o evento como não imediato (até 8 horas após o aceite, segundo a Unipile) e não promete o dado logo após o aceite.
- [ ] A reconciliação opcional lê só a primeira página de relações, poucas vezes ao dia, em intervalos aleatórios, com a mesma chave de idempotência do webhook.
- [ ] Cada Conta remetente + pessoa gera no máximo uma chamada a `GET /api/v1/users/{identifier}?account_id=...`, feita com a Conta remetente do próprio titular e sem notificar a visita.
- [ ] As consultas respeitam a cota recomendada de cerca de 100 perfis por conta por dia, com fila, espaçamento e continuação no dia seguinte, sem retentativa cega.
- [ ] Só com `network_distance = FIRST_DEGREE` os e-mails e telefones de `contact_info` são gravados, cada um com origem “Informações de contato do LinkedIn, via Conta remetente”, Conta remetente e titular que capturaram, e `capturado_em`.
- [ ] Campo vazio fica registrado como “não disponível no LinkedIn” e aparece como canal indisponível, sem valor inventado. Dados de outra origem não são sobrescritos.
- [ ] A captura não cria Interação nem Sinal, não altera o Último contato e não mexe no estado da Sequência.
- [ ] Correspondência (proposta): pela identidade LinkedIn do Contato. Uma nova conexão que não é Contato só vira Contato se a empresa atual corresponder a uma Conta-alvo do Workspace. Casos ambíguos ficam para revisão do titular, e conexões pessoais não são gravadas.
- [ ] Até a decisão (b), os dados capturados ficam acessíveis só ao titular e não são expostos a outros participantes nem a Integrações de mídia. Nenhum dado é enviado a Meta Ads ou Google Ads.
- [ ] Testes cobrem: aceite com e-mail e telefone, e-mail “Only visible to me” sem telefone, relação que não é de 1º grau, evento repetido e cota diária atingida.

## Dependências externas

- LinkedIn do titular conectado pela Unipile v1 com o webhook de usuários configurado.
- Conexões reais de teste indicadas pelo usuário: uma com e-mail visível e outra com e-mail restrito e sem telefone.
- Decisões pendentes do Renan: (a) base legal na LGPD para uso em públicos de anúncio; (b) dado do Workspace × dado privado do vendedor, considerando os ADRs 0008 e 0009.

## Próximo passo (fora deste ticket)

- Fallback pela Treg (treg.to) quando o LinkedIn não entregar: busca de e-mail em cascata `treg.people.email.find` por `linkedin_url` e provedores de telefone como Lusha e ContactOut.
- Uso dos dados em públicos personalizados de Meta Ads e Google Ads, depois da decisão (a) e da integração real.

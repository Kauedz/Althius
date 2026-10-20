---
status: proposed
---

# Webhooks de saída assinados

O catálogo promete "Webhooks, Zapier e Make". Zapier e Make conectam pelo servidor MCP de cada um (ADR-0017). "Webhooks" não é um conector, porque nenhum fornecedor oferece isso como servidor MCP: é um recurso da própria Althius. A Althius **avisa** uma URL do Cliente quando algo acontece no Workspace, e qualquer ferramenta (o Webhooks by Zapier, o Make, um sistema próprio) recebe.

Um Administrador cadastra no Workspace um **destino de webhook**:
- uma URL `https`;
- os eventos que quer receber;
- o segredo de assinatura, que a Althius gera e mostra **uma vez** e depois fica no Vault.

A Althius entrega cada evento por `POST` com JSON, assinado com HMAC-SHA256 do corpo mais um carimbo de tempo (cabeçalhos `Althius-Assinatura` e `Althius-Carimbo`). O recebedor recusa assinatura errada ou carimbo com mais de 5 minutos.

## Eventos da primeira versão

- Sinal disparado numa Conta-alvo (a Conta fica quente, ADR-0007).
- Resposta recebida numa Sequência.
- Reunião marcada.
- Conta enviada ao CRM (ADR-0020).

O corpo leva o tipo, o Workspace, o momento, os ids e o link para a Conta-alvo na Althius. **Nenhum dado pessoal sai por padrão** (LGPD): nada de nome, e-mail ou telefone de Contato. Incluí-los é uma opção do destino, marcada pelo Administrador com o aviso de que o dado sai da Althius.

## Regras

- Só Administrador cadastra, edita, pausa e apaga destinos. Todo Participante vê os destinos e o estado das entregas, nunca o segredo.
- A URL precisa ser `https`, e nunca de rede privada, loopback ou de metadados de nuvem (proteção contra SSRF), conferido também na hora da entrega.
- **Entrega:** até 8 tentativas com espera crescente, por até 24 horas. O registro de entregas (estado, código HTTP e duração, sem o corpo da resposta) fica 30 dias. Um destino que falha por 24 horas seguidas é pausado e o Administrador é avisado.
- Cada destino pertence a um Workspace, e nenhum evento de outro Workspace chega a ele.
- Um evento repetido leva o mesmo id, para o recebedor descartar duplicatas.

## Consequences

- A Althius passa a ter uma fila de entregas e um Executor para ela (como o das Sequências), com o segredo de cada destino no Vault.
- A entrada de dados por webhook (uma URL da Althius que recebe) fica fora daqui e, se vier, é outro ADR, com autenticação própria.
- Os eventos viram contrato público: mudar o formato depois pede versão (`"versao": 1` no corpo).

## Considered Options

- **Só Zapier e Make pelo MCP.** Não serve a quem usa outras ferramentas ou sistemas próprios, e o MCP deles é chamado pelos Agentes, não avisa nada.
- **Webhook sem assinatura.** Descartado: qualquer um que descubra a URL forjaria eventos.

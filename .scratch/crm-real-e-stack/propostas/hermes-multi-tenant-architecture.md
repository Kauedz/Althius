# Arquitetura multi-tenant do Hermes Agent na Althius

**Status:** proposta, rascunho de arquitetura. Nada disto está implementado.

A ideia é usar o [Hermes Agent](https://github.com/NousResearch/hermes-agent), da Nous Research, como o motor operacional autônomo da Althius, atendendo vários Clientes pagantes. Como o Hermes é um agente pessoal e single-tenant, a proposta é rodar uma instância isolada por Workspace, atrás de um Gateway próprio e de um proxy de LLM central que guarda a única chave da conta de modelos. Neste documento, "tenant" é o Workspace de um Cliente, no sentido do `CONTEXT.md`.

## Visão geral

```mermaid
flowchart TB
    subgraph BORDA["Borda"]
        APP["App Althius<br/>frontend do Cliente"]
    end

    subgraph GWL["Camada de Gateway: um único serviço"]
        GW["Gateway Althius"]
        AUTH["Autenticação do usuário"]
        ROUTE["Roteamento no servidor<br/>usuário → Workspace → container<br/>nunca confia em id vindo do cliente"]
        METER["Medição por Cliente<br/>requisições, jobs e tokens"]
        GW --> AUTH --> ROUTE
        GW --> METER
    end

    subgraph ISO["Isolamento por Workspace: sem processo compartilhado"]
        subgraph TA["Workspace do Cliente A: container ou microVM"]
            HA["Hermes Agent A<br/>perfil próprio em HERMES_HOME<br/>API_SERVER_KEY própria"]
            JA["Rotinas cron · plays de ABM<br/>lista de contas Quentes · prospecção"]
            VA[("Volume persistente A<br/>memória, skills, sessões, .env")]
            HA --- JA
            HA --- VA
        end
        subgraph TB2["Workspace do Cliente B: container ou microVM"]
            HB["Hermes Agent B<br/>perfil e API_SERVER_KEY próprios"]
            VB[("Volume persistente B")]
            HB --- VB
        end
        subgraph TN["Workspace do Cliente N: container ou microVM"]
            HN["Hermes Agent N<br/>perfil e API_SERVER_KEY próprios"]
            VN[("Volume persistente N")]
            HN --- VN
        end
    end

    subgraph MOD["Camada de modelos"]
        PROXY["Proxy de LLM central<br/>valida token do Workspace<br/>cotas, orçamento e limite de taxa"]
        SEC[("Gerenciador de segredos<br/>chave única da conta")]
        LLM["OpenAI ou Anthropic<br/>conta fixa de US$ 500 a 1.000 por mês"]
        SEC -->|"chave carregada só no proxy"| PROXY
        PROXY -->|"chave real da conta"| LLM
    end

    subgraph BILL["Uso e cobrança"]
        USAGE[("Base de uso por Workspace")]
        COB["Cobrança por Cliente"]
        USAGE --> COB
    end

    EXT["Fontes externas<br/>APIs de enriquecimento e ferramentas"]

    APP -->|"HTTPS com sessão do usuário"| GW
    ROUTE -->|"API_SERVER_KEY de A"| HA
    ROUTE -->|"API_SERVER_KEY de B"| HB
    ROUTE -->|"API_SERVER_KEY de N"| HN
    HA -->|"token de proxy de A"| PROXY
    HB -->|"token de proxy de B"| PROXY
    HN -->|"token de proxy de N"| PROXY
    PROXY -->|"tokens de entrada e saída por Workspace"| USAGE
    METER -->|"requisições e jobs por Workspace"| USAGE
    HA -.->|"saída opcional"| EXT
    HB -.->|"saída opcional"| EXT
    HN -.->|"saída opcional"| EXT
```

## Fluxo de um pedido

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário do Cliente A
    participant APP as App Althius
    participant GW as Gateway
    participant H as Hermes do Workspace A
    participant P as Proxy de LLM
    participant M as OpenAI ou Anthropic
    participant US as Base de uso

    U->>APP: "prospectar 50 contas esta semana"
    APP->>GW: Pedido com a sessão do usuário
    GW->>GW: Autentica e resolve usuário → Workspace A → container A
    GW->>H: Encaminha com a API_SERVER_KEY de A
    H-->>GW: Aceito, devolve job_id
    GW->>US: Registra o job do Workspace A
    GW-->>APP: job_id
    APP-->>U: Pedido em andamento
    Note over H: Planeja: seleciona Contas-alvo, prioriza as Quentes e pode agendar uma Rotina cron
    loop Cada etapa do plano
        H->>P: Chamada de modelo com o token de proxy de A
        P->>P: Valida token, cota e limite de taxa
        P->>M: Requisição com a chave real da conta
        M-->>P: Resposta e tokens consumidos
        P->>US: Registra tokens e modelo do Workspace A
        P-->>H: Resposta
    end
    H-->>GW: Progresso e resultado do job_id
    GW-->>APP: Notifica progresso e entrega o resultado
    APP-->>U: 50 Contas-alvo e próximas ações
```

Jobs longos são assíncronos: a resposta imediata é um `job_id`, e o progresso e o resultado chegam ao app quando ficam prontos, por notificação ou consulta ao `job_id`.

## Por que um container por Cliente, e não um processo compartilhado

- Os usuários são externos e não confiáveis. O `SECURITY.md` do Hermes o define como agente pessoal single-tenant, cuja única fronteira de segurança é o sistema operacional.
- Parte do estado é global no processo, como o registro de servidores MCP e as ferramentas de terminal. Dois Workspaces no mesmo processo poderiam ver ferramentas, arquivos ou credenciais um do outro.
- Cada Workspace tem o seu perfil Hermes, com `HERMES_HOME` próprio (`config`, `.env`, memória, sessões, `skills`, `cron`) num volume persistente só dele.
- Limita o raio de impacto: prompt injection, bug ou vazamento de credencial fica restrito a um Cliente.
- Permite limites de CPU, memória e rede por Workspace, e egress controlado para fontes externas.
- O custo fica sob controle com um pool de instâncias pré-aquecidas e com suspender e retomar containers ociosos, mantendo o volume. É o padrão do agent-sandbox do Kubernetes e do hermes-as-service.

## Onde fica a chave da conta GPT

- Só no proxy de LLM, carregada de um gerenciador de segredos. Nunca entra em imagem, volume ou `.env` de container.
- Cada container recebe apenas a URL base do proxy e um token de proxy do seu Workspace, revogável a qualquer momento.
- A chave real pode ser rotacionada no proxy sem tocar nos containers dos Clientes.
- O proxy aplica cota, orçamento e limite de taxa por Workspace, para que um Cliente não esgote a conta mensal compartilhada.
- A `API_SERVER_KEY` de cada Hermes é interna: só o Gateway a conhece, e o app nunca fala direto com um container.

## Como funciona a medição e a cobrança

- O proxy registra, a cada requisição, Workspace, modelo e tokens de entrada e saída.
- O Gateway registra requisições e jobs por Workspace.
- Os dois alimentam uma base de uso, agregada por Cliente e período.
- A cobrança pode ser preço do plano mais excedente, ou custo mais margem.
- Alertas de orçamento avisam quando um Workspace se aproxima da cota, antes de o proxy bloquear.

## Referências

- Hermes Agent, `SECURITY.md` (single-tenant, o sistema operacional como única fronteira): https://github.com/NousResearch/hermes-agent/blob/main/SECURITY.md
- Hermes Agent, discussão sobre multi-tenant: https://github.com/NousResearch/hermes-agent/issues/34352
- Hermes Agent, repositório (perfis com `HERMES_HOME` próprio e servidor de API compatível com OpenAI com `API_SERVER_KEY` por perfil): https://github.com/NousResearch/hermes-agent
- Kubernetes agent-sandbox, "Hermes Agents as a Service" (sandbox e PVC por usuário, pool pré-aquecido, suspender e retomar): https://agent-sandbox.sigs.k8s.io/docs/use-cases/examples/hermes-agents-as-a-service/
- masumi-network, hermes-as-service (uma microVM Firecracker por usuário, chave do OpenRouter só no proxy de LLM do orquestrador): https://github.com/masumi-network/hermes-as-service

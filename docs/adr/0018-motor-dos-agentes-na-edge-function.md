# O motor dos Agentes roda numa Edge Function, com o modelo da Anthropic, e o Hermes fica para depois

As Conversas e a Coordenação (CRM-14) precisam de um motor que chame um modelo, use ferramentas e guarde cada passo. Decidimos que o motor é código nosso, numa Edge Function do Supabase (`agent-conversation`), chamando a Messages API da Anthropic com a chave que só a função tem, e não o Hermes Agent com uma instância por Workspace ([proposta do CRM-25](../../.scratch/crm-real-e-stack/propostas/hermes-multi-tenant-architecture.md)).

O motivo é o que os ADRs de Agentes já fixaram. A Althius tem um catálogo fechado de Especialidades ([ADR-0005](./0005-agentes-criados-a-partir-de-especialidades.md)), a Coordenação não é um quinto Agente ([ADR-0004](./0004-coordenacao-sem-quinto-agente.md)) e toda ação externa passa pela Permissão Ler, Propor ou Executar ([ADR-0002](./0002-permissoes-ler-propor-executar.md)). Um motor genérico e pessoal precisaria ser dobrado para respeitar isso, e um container por Workspace ao lado do Supabase auto-hospedado ([ADR-0013](./0013-supabase-auto-hospedado-em-vps.md)) é custo fixo antes de haver cliente. Com o motor na Edge Function, o banco continua dono das regras: o pedido é guardado antes de rodar, reservado uma vez só, cada passo é gravado antes do seguinte e a Execução só termina com sucesso depois da resposta gravada. A tela acompanha pelo banco, então recarregar a página não roda o pedido de novo.

O modelo padrão é o `claude-opus-5-5`, trocável pelo segredo `ANTHROPIC_MODEL` sem publicar código. Sem a chave `ANTHROPIC_API_KEY`, as Conversas aparecem indisponíveis, sem resposta roteirizada.

Neste corte, a única ferramenta dos Agentes é a consulta às Contas-alvo ativas do Workspace, e nenhuma Integração está conectada: nenhum Agente age fora da Althius. Quando as Integrações chegarem ([ADR-0017](./0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md)), elas entram como ferramentas deste mesmo motor, sob a Permissão de cada Agente.

## Considered Options

- Hermes Agent com uma instância por Workspace, um gateway e um proxy de modelo: fica para quando houver clientes pagando e uma necessidade que o motor próprio não atenda. Rever então este ADR.
- Chamar o modelo pelo navegador: descartado, porque expõe a chave e deixa o estado da Conversa no cliente.

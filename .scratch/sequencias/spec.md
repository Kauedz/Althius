# Spec: módulo Sequências da Althius

Status: ready-for-agent

## Problem Statement

Na Althius, o time de receita do Cliente já consegue ver Contas-alvo com Sinal, Contatos do Comitê de compra e pedir ao Rhetor uma sequência na Conversa. O que ainda falta é o elo account-first entre essa inteligência e a execução de outbound: um lugar onde a **sequência da Conta-alvo** exista como objeto do produto — com vários Contatos, vários canais, delays, regra de pause e status da *conta* — sem virar um ESP nem uma sequence lead-first.

Hoje a sequência some na Conversa, não aparece na Conta-alvo de forma estruturada, não tem lista no Workspace e não carrega a regra de negócio já decidida: qualquer resposta (positiva ou negativa) pausa a sequência inteira da Conta para análise humana. O mercado de sales engagement é híbrido (enrollment contact-centric + company-stop); a Althius precisa demonstrar o gap inverso — **Conta-alvo como objeto primário** de sucesso — num protótipo navegável com dados simulados.

## Solution

Um módulo **Sequências** no protótipo navegável (só front-end, dados simulados, ADR 0003), com três superfícies que mostram o **mesmo** documento:

1. **Item "Sequências" na sidebar** (seção Workspace): lista global das sequências do Workspace.
2. **Bloco no detalhe da Conta-alvo**: a sequência daquela Conta (no máximo uma), com status e cobertura.
3. **Documento vivo na Conversa** (Rhetor / Coordenação): onde a sequência nasce e pode ser editada.

A sequência é account-first: o objeto é a **Conta-alvo**. O Comitê entra quando houver Contatos; Conta com **um único Contato** é válida. Cada Conta-alvo tem **no máximo uma** sequência.

Fluxo de nascimento: Sinal quente → mapear Comitê → Coordenação oferece → humano confirma → Rhetor escreve o documento sugerindo Personas/Contatos → humano confirma participantes (não inclui o comitê inteiro no automático).

O documento traz obrigatoriamente: Contatos participantes, canais (todos os canais citados no research de mercado, mesmo sem envio real), mensagens/steps ordenados, delays + janela (dias úteis e horários) e a regra explícita de pause na Conta-alvo. Depois do documento, o fluxo propõe uma **Aprovação** simulada no padrão já existente — sem fingir envio real. Envio via Unipile fica fora deste effort.

A demo continua no Workspace Databricks, com Contas-alvo reais, pessoas fictícias e o selo "Demonstração". Interface em pt-BR. Vocabulário: **sequência** (como no `CONTEXT.md`); "cadência" é sinônimo informal, não rótulo de UI neste protótipo.

## User Stories

Os atores são: **usuário** (alguém de receita no Cliente: SDR, AE, marketing, RevOps), **gestor** (líder de receita do Cliente) e **apresentador** (o fundador conduzindo a demo).

### Navegação e casca

1. Como usuário, quero um item "Sequências" na seção Workspace da sidebar, para achar as sequências do Workspace sem adivinhar.
2. Como usuário, quero que o item da sidebar fique ativo na lista de sequências e no detalhe de uma sequência, para saber em que módulo estou.
3. Como usuário, quero que a sequência da Conta-alvo também apareça no detalhe da Conta (bloco/resumo), para ver o plano sem sair do contexto da empresa.
4. Como usuário, quero abrir a mesma sequência a partir da lista, do detalhe da Conta ou da Conversa, e ver o mesmo conteúdo, para não haver duas verdades.
5. Como usuário, quero que a página inicial continue sendo a grade de Agentes, para não perder o ponto de partida atual.

### Lista global de Sequências

6. Como usuário, quero ver o título "Sequências" e uma descrição curta (ex.: "Planos de abordagem por Conta-alvo"), para entender a página sem explicação.
7. Como usuário, quero ver quantas sequências estão sendo exibidas, para saber o tamanho do que estou olhando.
8. Como usuário, quero uma linha por sequência com Conta-alvo, status (Ativa, Pausada, Reunião, Esgotada), cobertura de Contatos e um resumo do próximo step, para escanear o Workspace.
9. Como usuário, quero buscar por nome da Conta-alvo, para achar rápido.
10. Como usuário, quero filtrar por status, para focar no que está pausado ou ativo.
11. Como usuário, quero clicar numa linha e abrir o detalhe da sequência, para trabalhar nela.
12. Como usuário, quero um caminho "Nova sequência" que pede Conta-alvo (e depois participantes), para criar sem passar pela Conversa.
13. Como usuário, quero ver "Nenhuma sequência ainda" com orientação para criar pela lista ou pela Coordenação, quando a lista estiver vazia.
14. Como usuário, quero ver erro de carregamento com "Tentar de novo", no mesmo padrão de Contas.

### Detalhe da sequência

15. Como usuário, quero ver no detalhe a Conta-alvo (com link), o status account-level, a cobertura (# Contatos participantes) e a regra de pause, para entender o estado da conta.
16. Como usuário, quero ver a lista ordenada de steps: Contato/Persona, canal, delay/janela, copy ou nota do toque e objetivo, para ler o plano completo.
17. Como usuário, quero que canais do research (e-mail, LinkedIn, telefone, WhatsApp, SMS e outros listados no documento) possam aparecer como canal do step, mesmo sem envio real neste protótipo.
18. Como usuário, quero ver delays em dias úteis e janela de horários em cada step (ou herdados da sequência), para o ritmo ficar explícito.
19. Como usuário, quero ver sempre a regra "qualquer resposta na Conta-alvo (positiva ou negativa) pausa toda a sequência", para o time não continuar automatizando no automático.
20. Como usuário, quero editar o documento no detalhe e ver a mesma alteração refletida na Conversa, para os dois lados espelharem.
21. Como usuário, quero métricas de step inventadas só na demo (enviados, replies etc.) claramente como demonstração, para apoiar a narrativa sem virar métrica de produto real.
22. Como apresentador, quero status simulados Ativa / Pausada / Reunião / Esgotada coerentes com os roteiros, para demonstrar o ciclo account-first.

### Bloco no detalhe da Conta-alvo

23. Como usuário, quero uma seção "Sequência" no detalhe da Conta-alvo (além de Sinais, Contatos e Interações), para ver se há plano ativo naquela empresa.
24. Como usuário, quero ver status, cobertura e atalho para o detalhe completo da sequência, quando existir uma.
25. Como usuário, quero ver estado vazio ("Nenhuma sequência nesta Conta-alvo") com ação para criar, quando não houver.
26. Como usuário, quero que Conta com um único Contato possa ter sequência válida, para não excluir contas ainda pouco mapeadas.
27. Como usuário, quero que uma Conta-alvo tenha no máximo uma sequência, para o pause na conta permanecer simples.

### Nascimento na Conversa / Coordenação

28. Como usuário, quero que a Coordenação, num fluxo roteirizado a partir de Conta Quente com Sinal, ofereça montar a sequência, para o fluxo Sinal → Comitê → sequência ficar visível.
29. Como usuário, quero confirmar antes do Rhetor gravar a sequência, para o humano permanecer no loop.
30. Como usuário, quero que o Rhetor sugira Personas/Contatos participantes e eu confirme (incluir, tirar, trocar), para não meter o comitê inteiro no automático.
31. Como usuário, quero ver o documento da sequência na Conversa com a mesma estrutura do detalhe, para editar ali também.
32. Como usuário, quero que editar na Conversa atualize lista e detalhe da Conta na mesma sessão, para o espelho valer.
33. Como apresentador, quero um roteiro coordenado (Scopus → Ethos → Rhetor) que termina numa sequência da Conta-alvo demo (ex. OpenAI), coerente com Contas e Contatos.

### Participantes e estrutura mínima

34. Como usuário, quero que toda sequência tenha pelo menos: um ou mais Contatos, canais por step e mensagens/notas dos toques coordenados.
35. Como usuário, quero steps tipados de forma compreensível na UI (e-mail automático, e-mail manual, tarefa de ligação, tarefa genérica / LinkedIn / WhatsApp etc. como conteúdo do documento), sem exigir envio real.
36. Como usuário, quero variáveis de Conta e Persona nos textos de exemplo da demo, para a personalização ficar legível.

### Aprovação

37. Como usuário, quero que, após a sequência existir, o fluxo proponha uma Aprovação simulada no padrão já existente (fila / Canal), para reforçar orquestração sem fingir disparo.
38. Como gestor, quero ver na Aprovação qual Conta-alvo e sequência estão em jogo, para decidir com contexto.
39. Como usuário, quero aprovar ou rejeitar sem que isso dispare envio real a provedor externo neste protótipo.

### Status, pause e Interações

40. Como usuário, quero que o status Pausada possa ser demonstrado quando a demo registra uma resposta (Interação) na Conta-alvo, alinhado à regra de pause.
41. Como usuário, quero entender que pause é da sequência da Conta inteira, não só de um Contato, para o account-first ficar explícito.
42. Como usuário, quero que uma sequência só criada, sem envio, continue **não** sendo Interação (regra do CONTEXT.md).

### Demo e honestidade

43. Como apresentador, quero o selo "Demonstração" visível, para ninguém confundir com uso real.
44. Como apresentador, quero Contas-alvo reais e Contatos com nomes fictícios, no mesmo espírito de Contas e Contatos.
45. Como usuário, quero que métricas de performance da demo não sejam apresentadas como dados reais do Cliente.
46. Como usuário, quero interface e conteúdo em pt-BR, com os termos do glossário.

### Aparência

47. Como usuário, quero que Sequências pareça nativa ao app (tokens do Manual da Marca, Oswald, raio 0 em campos, temas escuro/claro), para o produto ser um só.
48. Como usuário, **não** quero um builder visual tipo workflow GHL neste protótipo, para a tela continuar ferramenta de leitura e edição do documento.

## Implementation Decisions

### Vocabulário e domínio

- Termo de UI e glossário: **sequência** (`CONTEXT.md`: Rhetor produz sequências; sequência só criada não é Interação).
- "Cadência" pode aparecer em conversa informal como sinônimo; não é rótulo de menu neste effort.
- Objeto primário: **Conta-alvo**. Participantes: **Contatos** (com Persona quando houver). Meta de sucesso da conta na demo: resposta ou reunião → status Reunião / Pausada conforme o roteiro.
- Uma Conta-alvo ↔ no máximo uma sequência.
- Conta com 1 Contato é válida.

### Fronteira de dados: `FonteDeSequencias`

- Nasce uma interface **`FonteDeSequencias`**, no mesmo estilo de `FonteDeContas` / `FonteDeAgentes`: operações assíncronas e `observar` para mudanças. É a única costura nova entre as telas de Sequências e os dados.
- Operações mínimas:
  - listar sequências do Workspace;
  - obter a sequência de uma Conta-alvo (zero ou uma);
  - obter sequência por identificador;
  - criar sequência para uma Conta-alvo;
  - atualizar o documento (participantes, steps, delays/janela, regra de pause);
  - confirmar/ajustar participantes sugeridos;
  - ler status account-level, cobertura e métricas de demo;
  - observar mudanças (espelho lista ↔ detalhe Conta ↔ Conversa).
- Entidade **Sequência** (mínimo): identificador; Conta-alvo; status (`ativa` | `pausada` | `reuniao` | `esgotada`); participantes (Contatos + Persona opcional); steps ordenados; regra de pause (texto/flag sempre presente); janela padrão (dias úteis + horários); timestamps de demo.
- Entidade **Step** (mínimo): ordem; Contato alvo (ou papel/Persona); canal; tipo de toque; delay desde o anterior; janela se diferente da padrão; conteúdo (assunto/corpo ou nota de tarefa); objetivo curto; métricas de demo opcionais.
- Implementação simulada na sessão (como as outras fontes); opções de teste: atraso, falha, lista vazia, data de "hoje" fixa.

### O que fica nas seams existentes

- **`FonteDeAgentes`**: roteiros de Conversa/Coordenação em que Rhetor/Coordenação produzem ou atualizam a sequência (chamando a `FonteDeSequencias` por baixo na implementação simulada, ou entregando o documento que a fonte persiste na sessão) e a **Aprovação** simulada pós-documento.
- **`FonteDeContas`**: Conta-alvo, Contatos, Personas, Sinais; Interação quando a demo simular resposta que justifica status Pausada.

### App, rotas e casca

- O App recebe `FonteDeSequencias` como dependência adicional, com provedor de contexto.
- Sidebar Workspace: item **Sequências** (além de Contas e Contatos e Agentes).
- Rotas: lista de sequências; detalhe de sequência; âncora/seção no detalhe da Conta-alvo já existente.
- Espelho: qualquer update via fonte notifica observadores; UI de Conversa e detalhe leem a mesma sequência.

### Documento e canais

- Canais representáveis no documento neste protótipo: e-mail, LinkedIn, telefone, WhatsApp, SMS e "outro"/tarefa genérica — alinhados ao research de mercado; **sem** envio real.
- Delays: dias úteis + janela de horários (obrigatório no documento).
- Regra de pause: sempre persistida e visível.

### Aprovação

- Após criar/confirmar a sequência, o roteiro pode abrir Aprovação pendente no padrão ADR 0002 (Propor), sem Integração Unipile e sem side-effect de envio.

### Demo

- Workspace Databricks; pelo menos uma sequência completa numa Conta Quente com Sinal (coerente com roteiros existentes, ex. OpenAI).
- Métricas de step são dados de demonstração, não analytics reais.
- Selo "Demonstração" permanece.

## Testing Decisions

- Um bom teste verifica comportamento visível: o que aparece depois de uma ação. Não testa estado interno nem nomes de componentes.
- Camada única: app inteiro sobre fontes simuladas (`FonteDeAgentes`, `FonteDeContas`, `FonteDeSequencias`), dirigido como usuário (Vitest + Testing Library), no padrão de Contas e Agentes.
- Costura nova: só `FonteDeSequencias` simulada injetada no App / utilitário de render.
- Cobertura mínima:
  - item "Sequências" na sidebar abre a lista;
  - lista mostra Conta-alvo, status e cobertura;
  - Conta sem sequência mostra vazio no bloco do detalhe; Conta com sequência mostra status e link;
  - no máximo uma sequência por Conta-alvo (criar segunda é rejeitado ou atualiza a existente — comportamento único e testado);
  - Conta com 1 Contato consegue ter sequência;
  - documento inclui participantes, canais, steps, delay/janela e regra de pause;
  - editar no detalhe reflete na leitura usada pela Conversa (e vice-versa) na mesma sessão;
  - fluxo roteirizado Coordenação → confirmação → Rhetor grava sequência;
  - Rhetor sugere participantes e a confirmação humana altera a lista antes de gravar;
  - Aprovação simulada aparece sem envio externo;
  - status Pausada pode ser demonstrado com Interação de resposta na demo;
  - lista vazia e erro com "Tentar de novo";
  - métricas de demo não quebram a UI quando ausentes.

## Out of Scope

- Unipile e qualquer envio real de e-mail, LinkedIn, WhatsApp, SMS ou ligação.
- CSV / import em massa e auto-enroll por Sinal sem confirmação humana.
- Branching rico (open/click/accept) e workflow builder tipo GHL.
- Dialer próprio; WhatsApp cold nativo (WABA); automação LinkedIn real (API/extensão).
- Enrichment / database tipo Apollo; warmup / rotação de inboxes; ads como step nativo.
- Integração Hamper; conversation intelligence; intent marketplace.
- Clone de ESP; motor de execução em background; persistência entre sessões.
- Múltiplas sequências ativas por Conta-alvo.
- Item de glossário novo "Cadência" (fica sequência).
- Mobile; outros idiomas; back-end real; autenticação.

## Further Notes

- Glossário: `CONTEXT.md`. Decisões relacionadas: ADR 0002 (Permissões/Aprovação), ADR 0003 (protótipo simulado), ADR 0004 (Coordenação), ADR 0005 (Especialidades), ADR 0006 (Aderência).
- Research de mercado (account-first / híbrido, jobs, fora de MVP, modelo mínimo): briefing do Althius Cadência Research (`althius-cadencia-briefing.md`); mercado documentado é híbrido contact-centric + company-stop — o diferencial desta spec é Conta-alvo como objeto primário de estado/sucesso no protótipo.
- Decisões de produto vieram do grill-me (Matt Pocock) com o fundador: documento vivo; sidebar Sequências; espelho Conversa ↔ Conta; 1 por Conta; pause em qualquer resposta; Unipile depois; Rhetor sugere e humano confirma.
- Critérios de qualidade na revisão final:
  - fica óbvio que a unidade é a Conta-alvo, não um lead;
  - as três superfícies não divergem;
  - a regra de pause está visível;
  - nada finge envio real;
  - Conta com 1 Contato funciona;
  - o módulo conversa com Contas e Agentes sem quebrar o que já existe.

## Decisões da aprovação do mock (ticket 01)

O fundador aprovou o mock em `.scratch/sequencias/mock/` com estes ajustes:

- **Documento como timeline no estilo Monaco/Apollo:**
  - À esquerda, steps numerados, intercalados com "Aguardar N dias úteis" e com a data prevista de cada step.
  - À direita, o composer do step selecionado, com rótulos inline (Para, Assunto, Mensagem).
- **Pré-visualizar mostra a mensagem com a cara de cada canal**, como referência e sem copiar a marca:
  - **WhatsApp:** tela de conversa.
  - **LinkedIn:** cartão de convite ou conversa.
  - **SMS:** tela de celular.
  - **E-mail:** leitura de caixa de entrada.
  - **Ligação e tarefa:** cartão de tarefa.
- **Linhas de divisão mais marcadas** que no módulo Contas, para separar bem cada bloco.

Os pontos em aberto listados no ticket 01 continuam valendo para os próximos tickets, até decisão explícita:

- rótulos próximos da referência;
- alvo por Persona;
- extras de demonstração;
- termos "step" e "pause".

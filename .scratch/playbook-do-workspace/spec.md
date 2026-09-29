# Spec: Playbook do Workspace

**Status:** ready-for-agent

**Frente:** Agentes e Memória do Workspace. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
Decisões: sabatina de 29/09/2026 (Q5, Q36, Q37, Q41, Q44), [ADR-0010](../../docs/adr/0010-revisao-da-memoria-como-aprovacao-de-administrador.md).
Modelo de referência: o playbook que o setup da Althius entrega (a planilha de 18 abas do setup).

## Problem Statement

O setup da Althius entrega um playbook completo de prospecção: ICP, TAM/SAM/SOM, matriz de complexidade, Personas do
comitê de compra, processo de compra, matriz de dores, pipeline, SLA, cadência, scripts, templates, objeções, frameworks
e a base de pesquisa. Hoje isso fica numa planilha fora da plataforma, e a Memória do Workspace guarda só o ICP e as
Personas como documentos da Demonstração. Os Agentes não sabem nada da empresa e respondem de forma genérica: no teste
de 29/09, perguntados sobre o ICP da Althius, disseram que não sabiam o que a empresa vende.

## Solution

O playbook vira o **Playbook do Workspace**: a Memória do Workspace estruturada nas seções do modelo de planilha, cada
uma editável, versionada e lida pelos Agentes. O setup importa a planilha de uma vez; depois o Administrador edita na
tela, e um Agente pode propor mudança, que só vale com Aprovação de Administrador (ADR-0010). Cada Especialidade lê as
seções dela: o Scopus o ICP, o TAM/SAM/SOM e a complexidade; o Ethos as Personas, as dores, o processo de compra e as
objeções; o Rhetor a cadência, os scripts, os templates e os frameworks. A seção **Empresa** (o que vende, para quem,
os melhores clientes) vale para todos e é preenchida no onboarding. A cadência do playbook vira o modelo de Sequência
do Workspace, e a aba de Base de Pesquisa entra como Contas-alvo (o TAM), em Descoberta.

## User Stories

1. Como Administrador, quero importar a planilha do playbook do setup, para não redigitar 18 abas.
2. Como Administrador, quero ver e editar cada seção do Playbook, para manter o playbook vivo.
3. Como Membro, quero ler o Playbook, para seguir o processo da empresa.
4. Como participante, quero que os Agentes usem o Playbook da minha empresa, para receber respostas específicas.
5. Como Administrador, quero aprovar ou recusar a mudança que um Agente propõe numa seção, para que nada mude sem mim.
6. Como participante, quero ver quem mudou uma seção e quando, e voltar a uma versão anterior.
7. Como Administrador, quero preencher a seção Empresa no onboarding, para os Agentes já começarem sabendo o que vendo.
8. Como participante, quero que a Sequência nasça da cadência do Playbook, personalizada por Sinal e Persona.
9. Como Administrador, quero que a Base de Pesquisa do playbook entre como Contas-alvo em Descoberta.
10. Como participante da Demonstração, quero ver um Playbook de exemplo, sem dado real.

## Implementation Decisions

- **Seções fixas**, na ordem do modelo: Empresa, ICP, Mercado (TAM/SAM/SOM e matriz de complexidade), Personas (comitê
  de compra, 3 perfis por Conta), Processo de compra, Dor e percepção (matriz: dor, urgência, consciência, gravidade,
  frequência, pergunta), Pipeline, SLA e metas (definições Lead/SAL/SQL/Oportunidade/Cliente e critérios de passagem),
  Rotina, Cadência, Scripts, Templates, Objeções, Frameworks, Apresentação, Negociação e follow-up. A Base de Pesquisa
  não é seção: vira Contas-alvo.
- **Conteúdo:** cada seção guarda campos estruturados quando o modelo tem tabela (ex.: linhas da matriz de dores, os 3
  perfis de Persona, os toques da cadência) e texto livre nos demais. Tudo em `jsonb` validado por função, numa tabela
  privada com RLS, versão por seção e autor.
- **ICP e Personas** da Memória do Workspace passam a ser as seções ICP e Personas do Playbook. O fluxo de Revisão com
  Aprovação (CRM-09, ADR-0010) opera sobre qualquer seção do Playbook.
- **Leitura pelos Agentes:** uma função de serviço devolve as seções de uma Especialidade para a Execução, com a seção
  Empresa sempre inclusa. O ticket de contexto em `agentes-em-conversa` consome essa função.
- **Importação:** a planilha `.xlsx` no modelo do setup; o mapeamento aba → seção é fixo e versionado. Aba desconhecida
  é listada como "não importada", nunca descartada em silêncio.
- **Demonstração** continua com o Playbook de exemplo local.

## Testing Decisions

- pgTAP: só Administrador ativo edita e aprova; todo participante ativo lê; outro Workspace nunca lê; versão e autor
  gravados; voltar a uma versão cria uma nova versão.
- Importação: teste com uma planilha de exemplo sem dado pessoal (fixture criada no teste), abas conhecidas e
  desconhecidas.
- Frontend: tela de leitura e edição, Membro sem botão de editar, Demonstração sem backend.

## Out of Scope

- Gerar o playbook automaticamente do zero (é o serviço do setup; um Agente só propõe mudanças).
- A inteligência coletiva entre Workspaces (`motor-hermes` 04-05).
- Vendas (Closer) além de guardar as seções do playbook: fase 2.

## Further Notes

- Tickets em `issues/`. A ordem é a numeração; os "Blocked by" dizem o que precisa estar na `main`.
- O CRM-09 (`crm-real-e-stack`) fica com o fluxo de Revisão e Aprovação, sobre as seções deste Playbook.

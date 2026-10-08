# Tickets abertos — levantamento de 07/10/2026

Fonte: arquivos locais de tickets. Status aberto não significa código ausente. A auditoria de 01/10 e o GO-LIVE registram entregas sem atualização de status; a main local também contém correções posteriores. Não foi validado o ambiente remoto.

## Contagem

Total: 195 tickets; 105 sem encerramento formal.

- done: 4
- needs-info: 10
- needs-triage: 31
- ready-for-agent: 41
- ready-for-human: 19

## Ordem recomendada

1. Reconciliar tickets com código e evidências já entregues; fechar apenas após verificar critérios e passos pendentes.
2. Resolver acesso e ambiente (Auth-03/05–10), créditos e assinatura (Créditos-01–06), fila de Aprovações (CRM-15).
3. Validar o ciclo real: ICP → Conta → Sinal → comitê → Sequência → envio/resposta → CRM.
4. Completar roleta, vínculos, onboarding operacional, personalização pelo Rhetor e pendências de Playbook/Agentes.
5. Ampliar conectores conforme clientes; fase 2 e jurimetria depois do núcleo operacional.

Referências: [GO-LIVE](GO-LIVE.md), [auditoria de 01/10](AUDITORIA-2026-10-01.md), [guia da plataforma](../docs/visao-geral-da-plataforma.md). A auditoria é histórica: seus achados precisam ser reconferidos antes de abrir trabalho.

## Inventário completo

### agentes-em-conversa

| Ticket | Status registrado |
| --- | --- |
| [01: Orquestração compartilhada entre a ponte e o Hermes](agentes-em-conversa/issues/01-orquestracao-compartilhada.md) | ready-for-agent |
| [02: Cada Agente com a própria vez, em rodadas](agentes-em-conversa/issues/02-cada-agente-com-a-propria-vez.md) | ready-for-agent |
| [03: Contexto do Playbook nos Agentes](agentes-em-conversa/issues/03-contexto-do-playbook-nos-agentes.md) | ready-for-agent |
| [04: Conversas nomeadas com vários Agentes](agentes-em-conversa/issues/04-conversas-nomeadas.md) | ready-for-agent |
| [05: O Agente propõe mudar o Playbook](agentes-em-conversa/issues/05-agente-propoe-mudar-o-playbook.md) | needs-info (depende do CRM-15) |

### autenticacao-google-email

| Ticket | Status registrado |
| --- | --- |
| [03: Cadastro com nome, e-mail e senha, e verificação por código](autenticacao-google-email/issues/03-cadastro-com-senha-e-verificacao-por-codigo.md) | ready-for-human (código pronto na branch `ralph/auth-03-cadastro-com-senha`; falta a parte do e-mail para conta existente, abaixo) |
| [05: Esqueci a senha](autenticacao-google-email/issues/05-esqueci-a-senha.md) | done (código e testes; 1 item pending-human de configuração do e-mail) |
| [06: Bloqueio de senhas vazadas](autenticacao-google-email/issues/06-bloqueio-de-senhas-vazadas.md) | done (branch `ralph/auth-06-senhas-vazadas`) |
| [07: Continuar com Google](autenticacao-google-email/issues/07-continuar-com-google.md) | done (código e testes); Google real pending-human (Auth-10) |
| [08: CAPTCHA invisível (Turnstile)](autenticacao-google-email/issues/08-captcha-invisivel.md) | done (branch `ralph/auth-08-captcha-invisivel`; configuração real pending-human, ver ticket 10) |
| [09: Entrar por convite](autenticacao-google-email/issues/09-entrar-por-convite.md) | ready-for-agent |
| [10: Configurar o ambiente e verificar antes de liberar](autenticacao-google-email/issues/10-configurar-ambiente-e-verificar.md) | ready-for-human |
| [11: Reaceite dos Termos atualizados](autenticacao-google-email/issues/11-reaceite-dos-termos-atualizados.md) | needs-triage |

### canais-cadencia-backend

| Ticket | Status registrado |
| --- | --- |
| [06: Executar passos e receber respostas pelo WhatsApp](canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md) | ready-for-agent |
| [07: Executar passos e receber respostas pelo LinkedIn](canais-cadencia-backend/issues/07-ciclo-real-linkedin.md) | ready-for-agent |
| [08: Gerar Propostas de resposta privadas](canais-cadencia-backend/issues/08-propostas-de-resposta-privadas.md) | ready-for-agent |
| [09: Aprovar e enviar respostas nos três canais](canais-cadencia-backend/issues/09-aprovar-e-enviar-respostas.md) | ready-for-agent |
| [10: Enviar anexos persistentes e privados](canais-cadencia-backend/issues/10-anexos-persistentes-e-privados.md) | ready-for-human (código pronto e testado com dublês; falta o envio real de um anexo por canal, nos Passos do Nan) |
| [11: Recuperar conexões e interromper acesso revogado](canais-cadencia-backend/issues/11-reconexao-e-acesso-revogado.md) | ready-for-human (código pronto e testado; falta a conferência real de uma queda e reconexão, nos Passos do Nan) |
| [12: Validar a operação completa com contas reais](canais-cadencia-backend/issues/12-validacao-completa-contas-reais.md) | ready-for-agent |

### conexoes-funcionais

| Ticket | Status registrado |
| --- | --- |
| [02: Catálogo real e habilitação pelo Administrador](conexoes-funcionais/issues/02-catalogo-real-e-habilitacao.md) | ready-for-human (código e testes prontos; falta a conferência visual com prints) |
| [03: Conectar e desconectar o próprio Acesso ao HubSpot](conexoes-funcionais/issues/03-conectar-o-proprio-acesso-ao-hubspot.md) | ready-for-agent |
| [07: Retirar a Integração do Workspace](conexoes-funcionais/issues/07-retirar-a-integracao-do-workspace.md) | ready-for-agent |
| [08: Conectar o Acesso ao Notion](conexoes-funcionais/issues/08-conectar-o-acesso-ao-notion.md) | ready-for-agent |
| [09: Wizard e validação real com portal HubSpot](conexoes-funcionais/issues/09-wizard-e-validacao-real-com-hubspot.md) | ready-for-human |
| [10: Conectar o Acesso ao Apollo](conexoes-funcionais/issues/10-conectar-o-acesso-ao-apollo.md) | ready-for-agent |
| [11: Conectar o Acesso ao Clay](conexoes-funcionais/issues/11-conectar-o-acesso-ao-clay.md) | ready-for-agent |
| [12: Conectar o Acesso ao Lusha](conexoes-funcionais/issues/12-conectar-o-acesso-ao-lusha.md) | ready-for-agent |
| [13: Conectar o Acesso ao Meta Ads](conexoes-funcionais/issues/13-conectar-o-acesso-ao-meta-ads.md) | ready-for-agent |
| [14: Conectar o Acesso ao Pipedrive](conexoes-funcionais/issues/14-conectar-o-acesso-ao-pipedrive.md) | ready-for-human (código pronto: o Pipedrive conecta pelo servidor MCP oficial e pela chave de API; falta aplicar a migration, publicar as funções e a conferência real) |
| [15: Conectar o Acesso ao Salesforce](conexoes-funcionais/issues/15-conectar-o-acesso-ao-salesforce.md) | needs-triage |
| [16: Conectar o Acesso ao Zoho CRM](conexoes-funcionais/issues/16-conectar-o-acesso-ao-zoho-crm.md) | needs-triage |
| [17: Conectar o Acesso ao RD Station CRM](conexoes-funcionais/issues/17-conectar-o-acesso-ao-rd-station.md) | needs-triage |
| [18: Conectar o Acesso ao Bitrix24](conexoes-funcionais/issues/18-conectar-o-acesso-ao-bitrix24.md) | needs-triage |
| [19: Conectar o Acesso ao Kommo](conexoes-funcionais/issues/19-conectar-o-acesso-ao-kommo.md) | needs-triage |
| [20: Conectar o Acesso ao Google Calendar](conexoes-funcionais/issues/20-conectar-o-acesso-ao-google-calendar.md) | needs-triage |
| [21: Conectar o Acesso ao Calendly](conexoes-funcionais/issues/21-conectar-o-acesso-ao-calendly.md) | needs-triage |
| [22: Conectar o Acesso ao Slack](conexoes-funcionais/issues/22-conectar-o-acesso-ao-slack.md) | needs-triage |
| [23: Conectar o Acesso ao Microsoft Teams](conexoes-funcionais/issues/23-conectar-o-acesso-ao-microsoft-teams.md) | needs-triage |
| [24: Conectar o Acesso ao Google Ads](conexoes-funcionais/issues/24-conectar-o-acesso-ao-google-ads.md) | needs-triage |
| [25: Conectar o Acesso ao LinkedIn Ads](conexoes-funcionais/issues/25-conectar-o-acesso-ao-linkedin-ads.md) | needs-triage |
| [26: Conectar o Acesso ao TikTok Ads](conexoes-funcionais/issues/26-conectar-o-acesso-ao-tiktok-ads.md) | needs-triage |
| [27: Conectar o Acesso ao Google Sheets](conexoes-funcionais/issues/27-conectar-o-acesso-ao-google-sheets.md) | needs-triage |
| [28: Conectar o Acesso ao Webhooks, Zapier e Make](conexoes-funcionais/issues/28-conectar-o-acesso-ao-webhooks-zapier-make.md) | needs-triage |
| [29: Search Console, Analytics e Semrush (fase 2)](conexoes-funcionais/issues/29-seo-e-geo-fase-2.md) | needs-triage |
| [30: Conectores genéricos, como os do Claude, com permissão por ferramenta](conexoes-funcionais/issues/30-conectores-genericos-e-permissao-por-ferramenta.md) | ready-for-human (fatias 1 a 6 prontas; o catálogo ampliado e o Pipedrive pelo MCP aplicados; falta o Nan publicar e conferir, ver Passos do Nan) |

### creditos-e-planos

| Ticket | Status registrado |
| --- | --- |
| [01: Medir o custo real de cada ação](creditos-e-planos/issues/01-medir-o-custo-real.md) | ready-for-agent |
| [02: Saldo e lançamentos de crédito do Workspace](creditos-e-planos/issues/02-saldo-e-lancamentos-de-credito.md) | ready-for-agent |
| [03: Interruptores "confirmar ou automático" e tetos](creditos-e-planos/issues/03-interruptores-e-tetos.md) | ready-for-agent |
| [04: Debitar as Execuções de Agentes](creditos-e-planos/issues/04-debitar-as-execucoes-de-agentes.md) | ready-for-agent |
| [05: Planos, assentos por usuário e o Observador](creditos-e-planos/issues/05-planos-assentos-e-observador.md) | ready-for-human (plano por assento e cota prontos com o ticket 06; o Observador fica para depois de combinar com a frente de Conexões) |
| [06: O Workspace real só é liberado ao assinar](creditos-e-planos/issues/06-workspace-liberado-ao-assinar.md) | ready-for-human (código pronto; falta o Nan configurar o Stripe e publicar as funções) |
| [08: Chave de IA do cliente no Workspace](creditos-e-planos/issues/08-chave-de-ia-do-cliente.md) | ready-for-agent |

### crm-real-e-stack

| Ticket | Status registrado |
| --- | --- |
| [06: Atribuir responsabilidade e distribuir recomendações pela roleta](crm-real-e-stack/issues/06-responsabilidade-e-roleta-de-contas.md) | ready-for-agent |
| [07: Importar Contas e Contatos por CSV](crm-real-e-stack/issues/07-importar-contas-e-contatos-por-csv.md) | ready-for-human |
| [08: Persistir perfil e preferências](crm-real-e-stack/issues/08-perfil-e-preferencias-persistentes.md) | ready-for-human |
| [09: Revisar e propagar ICP e Personas do Workspace](crm-real-e-stack/issues/09-icp-e-personas-aprovados.md) | ready-for-agent |
| [10: Registrar Sinais internos a partir de Interações reais](crm-real-e-stack/issues/10-interacoes-e-sinais-internos.md) | ready-for-agent |
| [11: Coletar o primeiro Sinal externo com Apify](crm-real-e-stack/issues/11-coletar-sinais-externos-com-apify.md) | ready-for-agent |
| [12: Consultar foto pública do Contato via Apify](crm-real-e-stack/issues/12-consultar-foto-de-contato-via-apify.md) | ready-for-human |
| [13: Persistir Agentes e permissões por integração](crm-real-e-stack/issues/13-persistir-agentes-e-permissoes.md) | ready-for-human |
| [14: Executar Conversas e Coordenação com estado recuperável](crm-real-e-stack/issues/14-executar-conversas-e-coordenacao.md) | ready-for-human (código e testes prontos; falta o Nan aplicar a migration, publicar a função, cadastrar a chave do modelo e conferir na tela) |
| [15: Aplicar Aprovações antes de ações externas](crm-real-e-stack/issues/15-validar-e-executar-aprovacoes.md) | ready-for-human (executor do Enviar ao CRM pronto; falta o Nan aplicar a migration 20261001210000 e publicar as funções. A fila real segue desligada: ver Comments, Etapa 5b) |
| [17: Vincular Sequências e responsabilidades às Contas reais](crm-real-e-stack/issues/17-vincular-sequencias-as-contas-reais.md) | ready-for-agent |
| [18: Arquivar e apagar Contas e Contatos com privacidade](crm-real-e-stack/issues/18-arquivar-e-apagar-dados-comerciais.md) | ready-for-agent (falta a verificação visual no navegador e os passos remotos listados nos Comments) |
| [23: Sugerir Workspace da empresa pelo domínio do e-mail](crm-real-e-stack/issues/23-sugestao-de-workspace-por-dominio.md) | needs-info |
| [24: Onboarding no Workspace operacional](crm-real-e-stack/issues/24-onboarding-no-workspace-operacional.md) | needs-triage |
| [25: Avaliar o Hermes Agent como motor dos Agentes](crm-real-e-stack/issues/25-avaliar-hermes-como-motor-dos-agentes.md) | needs-info |

### enriquecimento-em-cascata

| Ticket | Status registrado |
| --- | --- |
| [01: Fornecedores da cascata](enriquecimento-em-cascata/issues/01-fornecedores-da-cascata.md) | ready-for-agent (decidido: a base é o Apify; falta validar os actors numa execução real) |
| [02: Coleta do comitê de compra](enriquecimento-em-cascata/issues/02-coleta-do-comite-de-compra.md) | ready-for-agent |
| [03: Revelar e-mail e telefone em cascata](enriquecimento-em-cascata/issues/03-revelar-email-e-telefone.md) | ready-for-agent |
| [04: Importar o que o cliente já tem (Apollo, Lusha, Clay)](enriquecimento-em-cascata/issues/04-importar-o-que-o-cliente-ja-tem.md) | needs-info (depende das Conexões) |
| [05: LGPD do dado coletado](enriquecimento-em-cascata/issues/05-lgpd-do-dado-coletado.md) | needs-info (texto a validar por profissional de privacidade) |

### fase-2-revenue

| Ticket | Status registrado |
| --- | --- |
| [01: Oportunidades espelhadas do CRM](fase-2-revenue/issues/01-oportunidades-espelho-do-crm.md) | needs-triage |
| [02: Kanban de vendas para quem não tem CRM](fase-2-revenue/issues/02-kanban-de-vendas-sem-crm.md) | needs-triage |
| [03: Transcrição por upload ou texto colado](fase-2-revenue/issues/03-transcricao-por-upload.md) | needs-triage |
| [04: Transcrições nativas do Google Meet, Zoom e Teams](fase-2-revenue/issues/04-transcricoes-nativas.md) | needs-triage |
| [05: Conectores Granola e Fireflies](fase-2-revenue/issues/05-granola-e-fireflies.md) | needs-triage |
| [06: Inteligência da transcrição](fase-2-revenue/issues/06-inteligencia-da-transcricao.md) | needs-triage |
| [07: GEO e SEO para leads (Oraculum)](fase-2-revenue/issues/07-geo-e-seo.md) | needs-triage |
| [08: Inbound](fase-2-revenue/issues/08-inbound.md) | needs-triage |
| [09: PLG](fase-2-revenue/issues/09-plg.md) | needs-triage |
| [10: Públicos de anúncio](fase-2-revenue/issues/10-publicos-de-anuncio.md) | needs-triage |

### kanban-de-prospeccao

| Ticket | Status registrado |
| --- | --- |
| [01: Estágio de prospecção no banco](kanban-de-prospeccao/issues/01-estagio-de-prospeccao-no-banco.md) | ready-for-agent |
| [02: Movimentos automáticos por eventos](kanban-de-prospeccao/issues/02-movimentos-por-eventos.md) | ready-for-agent |
| [03: Tela do kanban em Contas](kanban-de-prospeccao/issues/03-tela-do-kanban.md) | ready-for-agent |
| [04: Critérios de passagem do Playbook no cartão](kanban-de-prospeccao/issues/04-criterios-de-passagem.md) | ready-for-agent (aviso e pendência no cartão prontos; falta só a oferta de completar, que depende do Ethos) |
| [05: Enviar ao CRM](kanban-de-prospeccao/issues/05-enviar-ao-crm.md) | ready-for-human (falta o teste real com uma conta de CRM; o envio por um Agente ficou pronto na Etapa 5b, mas com Propor o Administrador ainda não tem a fila para decidir, ver CRM-15; o botão no cartão do Kanban ficou pronto em 2026-10-02) |
| [06: Ler o estágio do negócio no CRM](kanban-de-prospeccao/issues/06-ler-o-estagio-do-negocio.md) | needs-info (depende do HubSpot) |

### motor-hermes

| Ticket | Status registrado |
| --- | --- |
| [01: Pesquisar a documentação oficial do Hermes Agent](motor-hermes/issues/01-pesquisar-a-documentacao-do-hermes.md) | ready-for-agent |
| [02: Ligar o Hermes no contrato do banco do CRM-14](motor-hermes/issues/02-ligar-o-hermes-no-contrato-do-banco.md) | ready-for-human (worker local pronto; falta o Nan rodar o Hermes e conferir na tela) |
| [04: Permissão do Workspace para contribuir com a inteligência coletiva](motor-hermes/issues/04-permissao-para-contribuir.md) | needs-info |
| [05: Biblioteca de padrões coletivos aprovados](motor-hermes/issues/05-biblioteca-de-padroes-coletivos.md) | needs-info |
| [06: Skills versionadas do Hermes](motor-hermes/issues/06-skills-versionadas.md) | needs-info |

### playbook-do-workspace

| Ticket | Status registrado |
| --- | --- |
| [01: Seções do Playbook no banco](playbook-do-workspace/issues/01-secoes-do-playbook-no-banco.md) | ready-for-agent |
| [02: Tela do Playbook nas Configurações](playbook-do-workspace/issues/02-tela-do-playbook.md) | ready-for-agent |
| [03: Importar a planilha do playbook do setup](playbook-do-workspace/issues/03-importar-a-planilha-do-setup.md) | ready-for-agent |
| [04: Seção Empresa preenchida no onboarding](playbook-do-workspace/issues/04-secao-empresa-no-onboarding.md) | needs-info (depende do CRM-24) |
| [05: A Cadência do Playbook vira o modelo de Sequência](playbook-do-workspace/issues/05-cadencia-vira-modelo-de-sequencia.md) | ready-for-agent (modelo pronto; falta só o Rhetor personalizar cada toque, que fica para uma Execução própria) |

### sinais-juridicos

| Ticket | Status registrado |
| --- | --- |
| [01: Pesquisa das fontes de dados de jurimetria](sinais-juridicos/issues/01-pesquisa-de-fontes.md) | ready-for-agent |
| [02: Política de uso dos Sinais de jurimetria e limites da OAB](sinais-juridicos/issues/02-politica-de-uso-e-oab.md) | ready-for-human |
| [03: Sinal "Tese nova no setor da Conta" (J)](sinais-juridicos/issues/03-sinal-tese-nova-no-setor.md) | needs-triage |
| [04: Sinal "Volume de ações novas contra a Conta" (R)](sinais-juridicos/issues/04-sinal-volume-de-acoes.md) | needs-triage |

### sinais-reais

| Ticket | Status registrado |
| --- | --- |
| [09: Sinais próprios da Althius](sinais-reais/issues/09-sinais-proprios.md) | needs-triage |
| [10: Sinal personalizado](sinais-reais/issues/10-sinal-personalizado.md) | needs-triage |

## Reconciliação contra a `main` 59e53a6 (07/10/2026)

Cada ticket abaixo foi conferido critério a critério no código da `main` 59e53a6, com os testes citados rodados nesta máquina (vitest e Deno) e o pgTAP lido do CI da própria `main` ([run 37707955273](https://github.com/Kauedz/Althius/actions/runs/37707955273): 57 arquivos e 2536 testes pgTAP, 107 arquivos vitest, 710 testes Deno, tudo verde). A evidência completa (arquivo:linha e nome dos testes) está nos Comments de cada ticket, com data de 2026-10-07. O Supabase remoto não foi conferido: o conector não estava ligado nesta sessão, e nada foi aplicado nem publicado.

- Rótulo: fechado é `closed`, o do vocabulário (`docs/agents/triage-labels.md`). Os `done` dos tickets 05 a 08 da autenticação e do 00 viraram `closed` ou voltaram a abrir.
- Branches: `ralph/auth-02` a `ralph/auth-08`, `ralph/auth-integracao`, `ralph/crm-04`, `ralph/crm-05` e `ralph/revisao-correcoes` estão na `main`. `ralph/A1-criar-monitoramento-no-modo-real` não está (1 commit fora), mas o código dela entrou revisado pelo PR #150. `ralph/00-saude-do-build-da-main` só tinha a pasta `.scratch/prospeccao-funcional/`, trazida para esta branch.
- Duplicados: nenhum ticket é duplicado inteiro. Os pares sobrepõem só em parte, e a parte duplicada está marcada nos Comments: o B2 cobre o critério 1 do enriquecimento 02 (falha e lista vazia); o B3 cobre os critérios 1 e 2 do enriquecimento 03; B1, B2 e B3 cobrem o custo do Apify do `creditos-e-planos` 01 e do enriquecimento 01. O C1 e o C3 não duplicam os canais 06 e 07: lá é o ciclo real pela Unipile, aqui é a tela. O C1 absorveu a tela de chat que faltava aos dois.
- Conferência visual feita nesta rodada, com o app local sobre o dublê do Supabase (1400×900, e 360px nas telas de acesso): playbook 02, crm-real-e-stack 17, kanban 05 e as telas de acesso do Auth-10. Os prints estão em `prints/` de cada pasta.

| Ticket | Novo status | Evidência | Próximo passo |
| --- | --- | --- | --- |
| autenticacao-google-email 03 | ready-for-agent | 33 testes da autenticação verdes; achado (a) em `raiz.tsx:25-35`, com [print](autenticacao-google-email/issues/prints/03-cadastro-sem-escolha-salva-abre-a-demonstracao.jpg); `/termos` sem rota (`termos.ts:8,11`) | Agente: correções A, B e C dos Comments; depois o Nan publica a função nova |
| autenticacao-google-email 05 | ready-for-agent | 6 testes "Esqueci a senha" verdes; sem escolha salva, o link de redefinir entra sem trocar a senha (`contexto.tsx:167`) | Agente: a correção A do 03, com 2 testes de raiz |
| autenticacao-google-email 06 | closed | `servicos-do-navegador.ts:156-159`; 5 testes "Bloqueio de senhas vazadas" e 10 de serviços verdes | — |
| autenticacao-google-email 07 | closed | `botao-do-google.tsx:10-42`; 7 testes "Continuar com Google" verdes | O Google real fica no 10 |
| autenticacao-google-email 08 | closed | `contexto.tsx:109-122`; 5 testes "CAPTCHA invisível" verdes | O Turnstile real fica no 10 |
| autenticacao-google-email 09 | ready-for-agent | `aceite-do-convite.test.tsx` 25 verdes; a volta do Google sem teste | Agente: 2 testes de raiz com o Google falso e "Entrar com outra conta" |
| autenticacao-google-email 10 | ready-for-human | Layout no desktop e a 360px fotografado (10 prints) | Depois do 03: Nan faz Cloudflare, Google Cloud, `.env.local` e Supabase Auth (passos 1 a 5 dos Comments) |
| creditos-e-planos 01 | ready-for-agent | `get_cost_report` (`20260930120000:117-156`), pgTAP `custos_por_acao.sql` ok; Receita, comitê e revelar sem custo | Agente: tokens das propostas de resposta e testes de quem grava; o resto fica em B1 a B3 |
| creditos-e-planos 02 | closed | `20260930160000:147-279`; pgTAP `saldo_e_lancamentos_de_credito.sql` ok | Ticket novo: tela de saldo, extrato e limite por pessoa |
| creditos-e-planos 03 | ready-for-agent | Só `acao:varredura` é consultado (`20260930180000:698`); as propostas de resposta reservam sem teto (`20261001180000:912-960`) | Nan decide os escopos sem executor; agente: teto nas propostas e teste das Permissões |
| creditos-e-planos 04 | closed | `orquestracao.ts:498-518`; pgTAP `creditos_das_execucoes_de_agentes.sql` ok; 37 testes Deno verdes | — |
| creditos-e-planos 05 | ready-for-agent | Sem papel `observer` (`20260927115135:13`); `credits_per_seat` = 0 | Nan: cota por assento, ajuste de assentos e o combinado com Conexões; depois, agente: Observador |
| creditos-e-planos 06 | ready-for-human | `workspace_access` e `TelaDeAssinatura`; 138 vitest e 12 Deno verdes | Nan: Stripe e deploy (passos 1 a 7); agente depois: ligar `set_credits_enforced` e o texto do Plano, com o sim do Nan |
| crm-real-e-stack 15 | ready-for-agent | 10 de 11 critérios; 230 vitest e os Deno verdes; fila desligada (`aplicativo.tsx:359-370`); Membro com Propor fica sem quem decida | Agente: ligar a fila, trocando só `raiz.test.tsx:110` (autorizado pelo Renan); Nan: conferir e aplicar as migrations e publicar |
| crm-real-e-stack 06 | needs-info | 6 de 7 critérios; ninguém chama `recommend_target_account`; o aceite grava evento `manual` | Fora do núcleo, por decisão do Renan; não trava a fila |
| crm-real-e-stack 17 | ready-for-human | pgTAP `sequencias_nas_contas_reais.sql` ok; arquivar e apagar já ligados pelo 18; 6 prints | Nan: `limpar-sequencias-orfas.sql` e `VALIDATE CONSTRAINT` no SQL Editor; agente: o rótulo cru em `detalhe-sequencia.tsx:2674` |
| crm-real-e-stack 24 | needs-info | Nada começou (`App.tsx:58`, `composicao.ts:89,123`) | Nan: as 4 perguntas dos Comments |
| enriquecimento-em-cascata 01 | ready-for-agent | Cascata sem teste (`provedor-de-contatos.ts:290-321`), com stubs pagos; o custo é duplicado de B1 a B3 | Agente, depois de B2 e B3: teste, stubs, Origem, script de validação e promoção em `discovery_actors`; Nan: rodar no Apify |
| enriquecimento-em-cascata 02 | ready-for-agent | O clique cobra 1 por pessoa (Deno verde); nada dispara ao virar Fit; o interruptor não é lido | Agente, depois do B2 e do 01: o automático pelas Personas do Playbook |
| enriquecimento-em-cascata 03 | ready-for-agent | Critérios 1 e 2 duplicados do B3; sem ação em lote (`tabela-de-contatos.tsx:145`) | Agente, depois do B3: o lote; Nan: telefone vira `wontfix`? |
| canais-cadencia-backend 06 | ready-for-human | 7 critérios no código; Deno 32 + 11 + 9 + 15 verdes; pgTAP `canais_whatsapp_linkedin.sql` ok | Nan: `message.new` no webhook, deploy, ligar o WhatsApp, envio e resposta reais |
| canais-cadencia-backend 07 | ready-for-human | InMail fora (decisão do Renan); convite e mensagem cumpridos no código (`send-chat-step.ts:184-190,340-357`) e nos testes | Nan: envio real de um convite e de uma mensagem; risco: a tela ainda oferece InMail |
| canais-cadencia-backend 08 | ready-for-agent | E-mail cumprido; o chat não tem gatilho (`20261001180000:305`) | Agente, depois do envio real do 06 e do 07 |
| canais-cadencia-backend 09 | ready-for-agent | E-mail cumprido; `reply-proposal-send/index.ts:79` só envia e-mail | Agente, depois do 08 de chat |
| canais-cadencia-backend 10 | ready-for-human | Deno 14 + 10, vitest 6, pgTAP `anexos_dos_passos.sql` ok | Nan: migration, deploy, ligar e um anexo real por canal |
| canais-cadencia-backend 11 | ready-for-human | Deno 3 + 5, vitest 4, pgTAP `reconexao_e_acesso_revogado.sql` ok | Nan: migration, deploy, queda e reconexão reais |
| canais-cadencia-backend 12 | ready-for-human | Nenhum critério feito; todos pedem duas identidades reais | Depois de 06 a 11, C1 e C3 |
| kanban-de-prospeccao 05 | ready-for-human | 10 de 12 critérios cumpridos, 1 parcial; 4 prints do cartão | Nan: teste real com HubSpot, Pipedrive e RD Station; a decisão pelo Administrador de um pedido de Membro depende do crm-real-e-stack 15 |
| playbook-do-workspace 01 | closed | pgTAP `playbook_do_workspace.sql` ok; 5 vitest | — |
| playbook-do-workspace 02 | closed | 13 vitest verdes; 6 prints (Administrador, Membro e Demonstração) | — |
| playbook-do-workspace 03 | closed | 4 critérios com teste; a importação grava só texto (`playbook-planilha.ts:68-73`) | Ticket novo: importação estruturada |
| playbook-do-workspace 05 | closed | 5 + 20 vitest verdes | Ticket novo: o Rhetor personaliza os toques, depois do B2 |
| agentes-em-conversa 01 | closed | 99 Deno verdes; `orquestracao.ts` sem `import` | — |
| agentes-em-conversa 02 | ready-for-agent | Sem tokens no worker (`worker.ts:294-306`) e no Groq (`model-groq.ts:142-147`) | Agente: tokens e testes; ticket novo: remover `HERMES_UMA_CHAMADA` |
| agentes-em-conversa 03 | closed | `orquestracao.ts:393-447`; 9 Deno e pgTAP ok | — |
| agentes-em-conversa 04 | closed | `20260930113000`; 15 vitest e pgTAP ok | — |
| prospeccao-funcional 00 | closed | CI 37707955273 verde na 59e53a6 | — |
| prospeccao-funcional A1 | closed | `supabase-sinais.ts:197-203`; 7 testes em `monitoramento-real.test.tsx` | — |
| prospeccao-funcional A2 | closed | `supabase-contas.ts:891`; 7 testes em `monitoramento-real.test.tsx` | — |
| prospeccao-funcional A3 | ready-for-agent | 5 dos 9 actors têm execução real com id do run e dado devolvido; os 4 sem id seguem `testing`; só `registro_de_actors.sql:18` muda | Agente: migration e pgTAP dos 5; Nan: aplicar a migration |
| prospeccao-funcional B1 | ready-for-agent | `account-enrichment/handler.ts:365-406` sem sessão nem crédito; preço decidido (1 crédito, só quando acha) | Agente; Nan: migration e deploy |
| prospeccao-funcional B2 | ready-for-agent | Entrada e saída do actor erradas (`provedor-de-contatos.ts:108-155`); Persona descartada no aceite | Agente, depois do B1 |
| prospeccao-funcional B3 | ready-for-agent | `coalesce` em `20261001190000:605,610`; telefone a 5 créditos na tela | Agente, depois do B2 |
| prospeccao-funcional B4 | ready-for-agent | `receita_data` e propostas sobrevivem ao apagamento (`20260929160000:1077-1080`) | Agente; Nan: migration |
| prospeccao-funcional C1 | ready-for-agent | Painel só com e-mail (`detalhe-sequencia.tsx:909`); a ativação pula o chat em silêncio (`20261002120000:600-601`) | Agente, com a ampliação dos Comments |
| prospeccao-funcional C3 | ready-for-agent | `respostasRecebidas` só lê e-mail (`supabase-sequencias.ts:647-653`) | Agente, depois do C1 |

### Decisões

Decididas pelo Renan em 07/10/2026 (gravadas também nos Comments de cada ticket):

1. B1: a consulta de CNPJ custa 1 crédito, cobrado só quando a Receita devolve dado; falha não cobra. Preço errado se corrige depois numa migration e não trava o ticket.
2. crm-real-e-stack 15: autorizado trocar só a asserção de `raiz.test.tsx:110` (a linha `/aprovacoes` do `it.each` de módulos indisponíveis), dentro deste ticket, para ligar a fila de Aprovações.
3. A3: só vale o actor cuja execução real está registrada nos comentários de sinais-reais 03 a 06 com o id do run e o dado devolvido; só as asserções desses actors mudam, e os outros seguem `testing`. Caso conferido: as 9 validações foram reais (nenhuma por leitura ou simulação), mas só 5 trazem o id do run (`mudanca_de_emprego`, `nova_lideranca`, `anuncio_de_movimentacao`, `anuncio_linkedin`, `avaliacoes_google_maps`). O A3 entra na fila com esses 5; `vaga_linkedin`, `vaga_indeed`, `entradas_e_saidas` e `anuncio_meta` seguem `testing`. A única asserção que muda é `registro_de_actors.sql:18`.
4. canais 07: o InMail fica fora; o ticket fecha com convite e mensagem no LinkedIn, depois do envio real. Fica como risco que a tela ainda oferece "InMail" (`detalhe-sequencia.tsx:2199`) e o núcleo o manda como mensagem comum. Em 08/10/2026 o Renan deu o sim ao ajuste: tirar a opção da tela e o envio recusar o passo de InMail com um motivo próprio virou o [canais-cadencia-backend 13](canais-cadencia-backend/issues/13-tirar-inmail-da-tela-e-recusar-no-envio.md), bloqueado pelo C1 (mesmo arquivo).
5. crm-real-e-stack 06: fica fora do núcleo, como `needs-info`, e não trava a fila.

Ainda abertas:

6. creditos 03: o que a tela faz com os escopos que ninguém executa.
7. creditos 05 e 06: a cota por assento, o ajuste de assentos, unir as duas chaves de cobrança e o texto do Plano.
8. crm-real-e-stack 24: as quatro perguntas do onboarding operacional.
9. Enriquecimento: tirar os stubs de Apollo, Lusha e Clay; a Origem do Contato aceito do comitê; recobrar quem já foi proposto; telefone `wontfix`.
10. canais 08 e 09: o Seam de Canal, antes da proposta de resposta por chat.

### Tickets novos sugeridos (não criados nesta rodada)

- Tela de saldo, extrato e limite por pessoa (`creditos-e-planos` 02).
- Importação estruturada da planilha, com tabelas e Mercado (`playbook-do-workspace` 03).
- O Rhetor personaliza os toques da Cadência (`playbook-do-workspace` 05), depois do B2.
- Remover o modo `HERMES_UMA_CHAMADA` e corrigir a síntese "Nenhuma Integração externa está conectada" (`agentes-em-conversa` 02).

### Fila do `/implement`, em ordem de dependência

Só tickets `ready-for-agent`. "Antes" é o que precisa acontecer para o agente começar.

| # | Ticket | Antes | Divide arquivo com |
| --- | --- | --- | --- |
| 1 | autenticacao-google-email 03 (correções A, B e C; leva junto o 05) | — | `raiz.tsx` e `raiz.test.tsx` com o 05 e o crm-real-e-stack 15 |
| 2 | autenticacao-google-email 09 | 1 | `aceite-do-convite.test.tsx` |
| 3 | prospeccao-funcional B4 | — | — |
| 4 | prospeccao-funcional A3 (só os 5 actors com id do run) | — | `supabase/tests/registro_de_actors.sql` |
| 5 | prospeccao-funcional B1 (1 crédito, só quando acha) | — | `account-enrichment/handler.ts` com B2 e B3 |
| 6 | prospeccao-funcional B2 | 5 | `provedor-de-contatos.ts`, handler e `comite-e-enriquecimento.tsx` |
| 7 | prospeccao-funcional B3 | 6 | os mesmos do 6 |
| 8 | prospeccao-funcional C1 (ampliado) | — | `detalhe-sequencia.tsx` com o 9 e o C3; `motivos-do-envio.ts` com o 9 |
| 9 | [canais-cadencia-backend 13](canais-cadencia-backend/issues/13-tirar-inmail-da-tela-e-recusar-no-envio.md) (tirar o InMail da tela e recusá-lo no envio) | 8 | `detalhe-sequencia.tsx`, `motivos-do-envio.ts`, `_shared/send-chat-step.ts` |
| 10 | prospeccao-funcional C3 | 8 | `detalhe-sequencia.tsx`, `supabase-sequencias.ts` |
| 11 | crm-real-e-stack 15 (ligar a fila; troca só `raiz.test.tsx:110`) | 1, pelo `raiz.test.tsx` | `aplicativo.tsx`, `raiz.test.tsx` |
| 12 | agentes-em-conversa 02 (tokens) | — | `_hermes-worker/worker.ts`, `model-groq.ts` |
| 13 | creditos-e-planos 01 (tokens das propostas) | — | `reply-proposal-runner` com o 14 |
| 14 | creditos-e-planos 03 (teto nas propostas) | 13 e a decisão 6 | `20261001180000` (redefinir a reserva das propostas) |
| 15 | enriquecimento-em-cascata 01 (reduzido) | 6 e 7; decisão 9 | `provedor-de-contatos.ts` |
| 16 | enriquecimento-em-cascata 03 (lote) | 7 | `comite-e-enriquecimento.tsx`, `tabela-de-contatos.tsx` |
| 17 | enriquecimento-em-cascata 02 (automático) | 6, 15 e a promoção em `discovery_actors` | `account-enrichment/handler.ts` |
| 18 | creditos-e-planos 05 (Observador) | Decisão 7 e o combinado com Conexões | Funções que comparam papel |
| 19 | canais-cadencia-backend 08 (chat) | Envio real do 06 e do 07; decisão 10 | `20261001180000` |
| 20 | canais-cadencia-backend 09 (chat) | 19 | `reply-proposal-send` |

O canais 07 saiu da fila: sem o InMail, ele só espera o envio real (`ready-for-human`). Tirar a opção "InMail" da tela e recusá-lo no envio virou o canais 13, na posição 9 (sim do Renan em 08/10/2026). Fora da fila: crm-real-e-stack 06 (fora do núcleo, por decisão) e crm-real-e-stack 24 (`needs-info`). Espera o sim do Renan, sem entrar na fila: o rótulo cru do crm-real-e-stack 17 (`detalhe-sequencia.tsx:2674`), que cabe no C1.

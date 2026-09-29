# 18: Arquivar e apagar Contas e Contatos com privacidade

**What to build:** participantes arquivam registros reversivelmente e usuários autorizados podem apagar definitivamente dados pessoais sem perder eventos comerciais desidentificados.

**Blocked by:** 05: Manter Contatos e Vínculos do Contato; 17: Vincular Sequências e responsabilidades às Contas reais.

**Status:** ready-for-agent (falta a verificação visual no navegador e os passos remotos listados nos Comments)

- [x] Arquivar Conta/Contato remove da operação e busca padrão, preservando histórico e permitindo restauração autorizada. — Conta: `archived_at`; as listas padrão e a busca deixam de trazê-la (e os Contatos dela), o detalhe e a lista "Arquivadas" a mostram; sem Interação manual, Contato, Vínculo nem Sequência nova. Contato: os Vínculos ativos são encerrados (marcados `ended_reason = 'contact_archived'`) e voltam, como Vínculos novos, na restauração. pgTAP e Vitest. Aberto: verificação no navegador.
- [x] Arquivar Conta com Sequência ativa aplica pausa/cancelamento definidos no ticket de Sequências e mostra confirmação. — `archive_target_account` chama `private.pause_sequences_of_archived_account` (pausa com trava, revoga a autorização, cancela os passos pendentes); restaurar só destrava. O diálogo de arquivar avisa da pausa quando a Conta tem Sequência em andamento e o resultado diz quantas foram pausadas.
- [x] Apagamento permanente remove PII de Conta/Contato, vínculos e dados privados relacionados; passos pendentes já são cancelados pelo domínio de Sequências. — `erase_target_account` e `erase_contact` (só Administrador). Tabela por tabela nos Comments.
- [x] Eventos comerciais preservados ficam desidentificados, sem nome, e-mail, telefone, URL social ou payload que permita reidentificação. — Interações (tipo, data, origem), Sequência encerrada com o resumo só de contagens, Envios sem Contato, Destino, conteúdo nem ids do provedor. Um teste varre toda tabela de `public` e `private` atrás dos dados apagados e não acha nada, inclusive depois de respostas e resultados que chegam atrasados.
- [x] Operação exige permissão/confirmacão adequadas e audita ator, escopo e resultado sem copiar PII para o log. — Só o Administrador apaga, digitando o nome do registro; a auditoria (`private.data_lifecycle_events`) guarda ator, registro, ação, resultado e números, nunca texto.
- [x] Tentativas concorrentes, retries e solicitações repetidas não restauram PII nem duplicam efeitos. — Trava consultiva por Conta e por Contato; a repetição responde `already_erased`/`already_archived`/`not_archived` sem efeito nem auditoria nova; o Envio desidentificado e a Conta apagada recusam dado pessoal de volta por gatilho. Testado por repetição no pgTAP e por duas sessões reais contra um banco de teste (sem deadlock).


## Comments

- 2026-09-29: implementação (CRM-18). Migration `20260929160000_arquivar_e_apagar_dados_comerciais.sql`, pgTAP `arquivar_e_apagar_dados_comerciais.sql` (180 asserções), Edge Function `storage-purge` (7 testes Deno), telas e adaptador (`arquivar-e-apagar.tsx`, `supabase-contas.ts`, 23 testes novos).

- **Decisões de produto (a confirmar com o Nan):**
  1. Quem pode: arquivar e restaurar Conta = o Vendedor responsável ou um Administrador; Contato = Administrador ou o Vendedor responsável por todas as Contas em que ele atua (a regra de editar o Contato); apagar definitivamente = só o Administrador, com o nome do registro digitado como confirmação (Conta ou Contato).
  2. A Conta apagada **fica como marcador** (`deleted_at`): sem nome, URL, domínio, identificador legal, LinkedIn nem segmento, escondida pelo RLS e imutável, para as Interações e a Sequência encerrada continuarem ligadas a algo. A URL real fica livre: cadastrar a mesma empresa de novo cria outra Conta. O Contato é apagado de vez (a linha some).
  3. Apagar a Conta apaga os Contatos que só existiam nela (nenhum Vínculo, ativo ou encerrado, com outra Conta); os que também atuam em outra perdem só o Vínculo com esta. A tela avisa.
  4. Apagar não exige arquivar antes.
  5. Arquivar o Contato encerra os Vínculos ativos, em vez de só marcá-lo: assim os passos dele nas Sequências já param pelas travas existentes (`contact_unlinked`).
  6. Editar uma Conta arquivada continua possível (a recomendação da Althius e o cadastro pela mesma URL a atualizam); o que o arquivo barra é Interação manual, Contato, Vínculo e Sequência novos. Cadastrar pela URL de uma Conta arquivada não a cria de novo nem a restaura: a tela avisa que ela está arquivada.
  7. Uma repetição não grava auditoria: a auditoria conta efeitos. "Já apagado" sai desse histórico, só para Administradores do mesmo Workspace.
  8. Fato da Memória de um Agente (texto livre, sem ligação com o registro) que cita e-mail, telefone, LinkedIn ou nome (cinco letras ou mais) do Contato, ou nome, URL, domínio ou LinkedIn da Conta, é apagado com o registro. Pode apagar um fato que só menciona a empresa de passagem; foi a escolha conservadora.
  9. Arquivo do CSV: o lote que teve uma linha apagada perde o arquivo inteiro no Storage e o nome do arquivo (o arquivo tem outras pessoas, e nada lê o arquivo depois da leitura das linhas), mas as demais linhas do lote ficam.

- **Dado pessoal, tabela por tabela** (apagamento de Conta = A, de Contato = C):
  - `public.target_accounts` (A): marcador sem dado da empresa, `deleted_at`, imutável (gatilho); RLS esconde.
  - `public.contacts` (C, e os exclusivos da Conta): linha apagada. Cascata: `contact_account_links`, `contact_photos` (URL da foto), `private.contact_photo_lookups`.
  - `public.contact_account_links` (A): os da Conta apagados; os dos Contatos que ficam perdem só o Vínculo com ela.
  - `public.account_interactions`: **ficam** (tipo, data, origem, quem registrou), com `contact_id` nulo.
  - `private.received_emails` (A: todas as da Sequência; C: as dele por id ou e-mail): linhas apagadas (remetente, assunto, corpo, trecho, anexos); a pasta dos anexos vai para a fila do Storage.
  - `private.sequence_step_sends` (A: todos os da Sequência; C: os dele): desidentificados no lugar (`anonymized_at`): Contato, Destino, assunto, corpo, ids do provedor e erro viram nulos; pendentes viram `cancelled`; estado, tentativas e datas ficam. Um gatilho impede qualquer escrita de trazê-los de volta (resultado do provedor, eco, reconfirmação).
  - `private.sequence_documents` e `private.sequence_authorizations` (A: documento vira `{}`; C: os passos dele e o id dele saem do documento e da cópia autorizada, e as contagens públicas seguem). O documento de uma Sequência de Conta apagada recusa escrita (55006).
  - `public.sequences` (A): encerrada (`account_deleted`), resumo público só com contagens. Fica.
  - `private.unipile_email_events`: `send_id` e `provider_email_id` dos eventos ligados aos Envios e respostas apagados viram nulos (eram alça para o e-mail na Unipile).
  - `private.target_contacts_canais02` (cópia antiga de canais-02): apagadas as linhas da Conta (A) e as do Contato por id ou por e-mail, telefone ou LinkedIn igual (C).
  - `private.import_rows` (CRM-07): `cells` (CSV cru), `parsed` e `preview` limpos nas linhas ligadas ao registro (pelo id ou pelos valores lidos: URL da empresa, e-mail, telefone, LinkedIn); número, estado e contagem do resultado ficam. `import_batches.file_name` trocado, e o arquivo do lote (`csv-imports`) na fila do Storage.
  - `private.account_field_sources` e `contact_field_sources` (CRM-07): apagadas (só nomes de campo e origem). Na Conta, a limpeza vem depois do marcador, porque o gatilho de origem por campo escreveria uma origem nova para o nome "Conta apagada".
  - `private.agent_memory_facts` (CRM-13): ver a decisão 8.
  - Storage: `email-attachments` (`recebidos/<interação>/`) e `csv-imports` (`<workspace>/<lote>/`) por `private.storage_purge_queue`, duas passadas (agora e uma hora depois, para um download ainda em andamento) e a Edge Function `storage-purge`.
  - `private.data_lifecycle_events` (auditoria): ator, Workspace, ação, registro, resultado e números. Nunca texto.
  - **Ficam** por serem ids ou metadados sem pessoa: `sales_responsibilities`, `account_assignment_events` (o motivo da Transferência é texto livre do Administrador sobre a saída de um usuário, não da Conta), `target_account_enrichments` (só nomes de campo), `account_roulette_cursors`, `contact_photo_lookups` de outros Contatos.

- **Fora de escopo, por não existir nesta base:** Sinais (CRM-10 e CRM-11), Conversas e Execuções dos Agentes (CRM-14): quando existirem, redefinem `private.erase_account_extensions` e `private.erase_contact_extensions` (a importação e a Memória já estão lá) e usam a fila do Storage. Não cobertos por decisão ou limite: dado que já saiu para fora do banco (o e-mail já enviado e a cópia na caixa do titular e na Unipile; a foto no LinkedIn; o Apify), cópia em backup do banco, logs da plataforma, e um Contato que só aparece por nome em texto livre (assunto e corpo de um passo escrito pelo titular em outra Sequência). Um novo cadastro do mesmo e-mail depois do apagamento cria um Contato novo: não há lista de supressão (guardar o e-mail, mesmo em hash, seria guardar dado pessoal).

- **Concorrência:** as travas consultivas seguem a ordem Conta, depois Contatos; quem só grava algo novo (Sequência, Vínculo, Interação manual) toma a trava compartilhada sem esperar e desiste com 55P03; as travas de linha seguem a ordem de sempre (Sequência, Envios, Conta). Verificado, além do pgTAP, com sessões reais: dois apagamentos simultâneos (o segundo devolve `already_erased`), resultado de envio em voo chegando durante o apagamento, cadastro de Contato e arquivamento durante o apagamento; nenhum impasse.

- **Passos remotos (nada foi feito em `ycbdilsmydvzezhlymty`):** aplicar a migration `20260929160000` (conforme `docs/agents/migrations.md`, depois da 150000); publicar a função: `npx supabase functions deploy storage-purge --no-verify-jwt --project-ref <ref>`; no SQL Editor, uma vez: `select private.configure_storage_purge('https://<ref>.supabase.co');`. Sem isso o apagamento no banco funciona, mas os arquivos do Storage ficam na fila.

- **Aberto:** verificação visual no navegador (arquivar, restaurar, apagar; listas Arquivadas); os pontos de extensão para Sinais e Conversas; a lista dos dados que o Nan confirmar nas decisões acima.

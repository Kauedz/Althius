# Sinais fora da tela

Em 14/10/2026 o catálogo passou a mostrar só os cards com coleta prevista para os nichos (cerca de 26) e o pedido à equipe Althius. O que saiu **não foi apagado**.

A lista vive em `projeto-althius-frontend/src/paginas/sinais/arquivados.ts` (`ARCHIVED_SIGNALS`). Cada item tem `archived: true`, o motivo e como reativar. A tela não lê essa lista para admin nenhum: some para todo mundo.

Dois grupos:

- **Tipos da tela antiga** (`catalogo.ts`): GTM e RevOps, rodadas, as cinco de tecnologia, as cinco de notícias, as três de eventos, G2, comunidades, site, verificações e os outros da lista "Remover" do plano de 13/10/2026. Continuam no arquivo, com o formulário, para o dia em que houver coletor.
- **Cascatas sem fonte útil** (`habilitacao_radar`, `novo_importador`, `processos_jusbrasil_datajud`, `vencimento_contrato_energia`, `importacao_de_maquinas`, `licenca_instalacao`, `crescimento_comex_embarcador`, `caged_por_empresa`, `frota_crescendo`, `renovacao_de_apolice`, `area_no_car`, `cpr_registrada`). Continuam em `private.signal_cascades`. A licença que fica no catálogo é a do diário oficial (`licenca_instalacao_dou`), dentro do card "Mudança regulatória e licença de instalação".

Volume por porto, setor afetado pela CBS/IBS e impacto da reforma por CNAE não estão arquivados: são painéis de contexto em Mercado, não cards.

## Como reativar

1. Tire o id de `ARCHIVED_SIGNALS`.
2. Inclua um card em `CATALOGO_VISIVEL` (`catalogo-visivel.ts`), com nome, frase, nichos, fonte em linguagem de usuário e coletor.
3. Grave uma migração nova que insere a mesma linha em `public.signal_catalog` e os nichos em `public.signal_catalog_niches`. Não edite a migração que já foi aplicada.
4. Não apague o coletor antigo e não rode `delete` no banco.

O card só volta para a tela quando os passos 1 e 2 estão no código. O passo 3 faz o Workspace operacional enxergar o mesmo card, inclusive um Sinal feito sob pedido (com `workspace_id` preenchido).

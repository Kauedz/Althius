-- Fase 4 (o ICP pelo agente): salvar o ICP grava uma nova versão do Workspace, então o passo `salvar_icp` sempre para e
-- pede confirmação. O motivo novo `alteracao` diz isso sem confundir com mensagem a prospect (`prospect`) nem com o teto.
alter table private.agente_passos drop constraint agente_passos_motivo_confirmacao_check;
alter table private.agente_passos add constraint agente_passos_motivo_confirmacao_check
  check (motivo_confirmacao in ('teto', 'prospect', 'alteracao'));

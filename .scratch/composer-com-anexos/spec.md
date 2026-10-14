# PR-10 — Composer com anexos

## GATE
- Migração `20261024100000_anexos_das_conversas.sql`: aditiva e idempotente, sem SQL destrutivo, RLS ligada e acesso revogado na tabela nova.
- Bucket privado `agent-attachments`, sem política em storage.objects; só a Edge Function grava e assina.
- Limites: 5 arquivos por pedido, 10 MB cada; png, jpg, webp, pdf, csv, txt, docx, xlsx. O tipo é lido pelos bytes.
- Sem mudar `AGENT_PROVIDER`. Imagens entram como imagem só no modelo que as aceita; no Hermes, só o nome (o worker da VPS não é publicado por aqui).
- Limpeza pelo storage-purge (bucket incluído na lista). Parar: `cancel_agent_run`, só de quem pediu.
- Sem mudar rotas nem layout; ícones lucide-react; pt-BR.

## Fluxo
1. O composer sobe cada arquivo para `agent-attachments`, que registra com o JWT (`register_agent_attachment`), grava e marca como guardado.
2. No envio, `agent-conversation` reserva os anexos para o client_request_id (`reserve_agent_attachments`) antes de `start_agent_run`; um gatilho em `agent_runs` liga os anexos à Execução e à Conversa.
3. O motor lê `agent_run_attachments` (texto extraído e imagens).
4. A tela mostra os anexos de cada pedido (`list_agent_conversation_attachments`) e os abre por URL assinada.

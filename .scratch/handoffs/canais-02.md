# Handoff: canais-althius 02 — adaptador WhatsApp com simulador

Branch: `ralph/canais-02-adaptador-do-whatsapp-com-simulador`. O ticket `.scratch/canais-althius/issues/02-adaptador-do-whatsapp-com-simulador.md` está implementado e marcado `ready-for-human`; veja o diff e os comentários do ticket para os critérios e testes.

O módulo novo está em `supabase/functions/_shared/canal/`. A seleção de runtime usa simulador por padrão; o modo Cloud só é ligado explicitamente por `CANAL_WHATSAPP_MODE=cloud` e exige credenciais no ambiente de execução. Nenhuma chamada externa, migration ou alteração fora do escopo foi feita.

O ADR-0027 segue `proposed` enquanto não houver resposta escrita da Meta sobre a cláusula 4.7; o adaptador real existe para ficar atrás desse gate e não foi exercitado contra uma conta real.

## Próxima sessão

Continue apenas quando receber um ticket específico. Não assuma que outros tickets da spec estão incluídos neste handoff.

## Skills sugeridas

- `implement` para executar o próximo ticket explicitamente designado.
- `tdd` para mudanças de comportamento, acordando a interface pública coberta antes dos testes.
- `code-review` para revisar o diff contra a base declarada pelo usuário.

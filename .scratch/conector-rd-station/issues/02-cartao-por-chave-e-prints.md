# 02: cartao por chave e prints

**What to build:** Conferir se o cartão do RD Station por chave de API tem testes do app e prints. Se faltar, criar `conexoes-rd-station.test.tsx` nos estados de sempre (chave aceita, recusada, portal diferente) e os prints.

**Blocked by:** nenhum

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**20/10/2026 (agente).** Não havia teste do cartão do RD Station. Agora há `src/paginas/conexoes-rd-station.test.tsx`, 8 casos:
- o Administrador habilita; o Membro vê que não pode;
- só a chave, sem autorização no app e sem Sincronização;
- a chave aceita, que não volta à tela;
- a chave recusada, com o motivo;
- as ferramentas REST, só a de escrita marcada;
- "Precisa reconectar" com a chave como saída;
- desconectar sem aviso.

O caso de portal diferente não se aplica, porque o RD Station não fixa portal (`pins_portal = false`). `tsc -b` limpo.

Prints (dublê; ferramentas ilustrativas): [não conectado](prints/02-nao-conectado.jpg), [diálogo da chave](prints/02-dialogo-chave.jpg), [conectado](prints/02-conectado.jpg) e [ferramentas](prints/02-ferramentas.jpg).

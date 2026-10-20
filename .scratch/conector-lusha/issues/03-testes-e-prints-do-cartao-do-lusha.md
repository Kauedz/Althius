# 03: Testes do app e prints do cartão do Lusha

**What to build:** `src/paginas/conexoes-lusha.test.tsx`, no formato de `conexoes-clay.test.tsx`, cobrindo:
- habilitar (Admin) e "Só um Administrador habilita." (Membro);
- os dois botões;
- a chave aceita, a recusada e a mal formada;
- OAuth: as voltas ok, recusada, expirada e indisponível;
- conectado, com as ferramentas todas "Escreve ou gasta";
- precisa reconectar;
- desconectar, com e sem o aviso de revogação.

Prints em `prints/03-*.jpg`, pelo mesmo dublê temporário do Clay.

**Blocked by:** 01, 02.

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Pode mexer
- `projeto-althius-frontend/src/paginas/conexoes-lusha.test.tsx`, `.scratch/conector-lusha/issues/prints/`

## Não mexa
- Os testes existentes de Conexões.

## Comments

**19/10/2026 (agente).**
- `src/paginas/conexoes-lusha.test.tsx`, 8 casos:
  - o Administrador habilita; o Membro vê que não pode;
  - só a chave, sem OAuth e sem Sincronização;
  - a chave aceita, que não volta à tela;
  - a chave recusada, com o motivo;
  - as ferramentas, todas "Escreve ou gasta";
  - "Precisa reconectar" com a chave como saída;
  - desconectar pela Edge Function, sem aviso.
- Passaram de primeira, porque o cartão genérico já atende o Lusha. Para provar que conseguem falhar, escondi o botão da chave na tela de propósito: 4 dos 8 falharam, e a tela foi restaurada em seguida.
- `tsc -b` limpo.
- Prints (dublê do Supabase, Chrome headless, 1400×1150): [não habilitada](prints/03-nao-habilitada.jpg), [Membro](prints/03-nao-habilitada-membro.jpg), [não conectado](prints/03-nao-conectado.jpg), [diálogo da chave](prints/03-dialogo-chave.jpg), [conectado](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg), [precisa reconectar](prints/03-precisa-reconectar.jpg) e [depois de desconectar](prints/03-depois-de-desconectar.jpg). Os nomes das ferramentas são ilustrativos.
- Fica para depois do 02: os casos do OAuth (botão "Conectar no Lusha" e as voltas).

**19/10/2026 (agente).** Entraram os casos do OAuth: os dois botões, o consentimento em `auth.lusha.com`, as voltas recusada, expirada e indisponível (com a chave continuando como saída) e "Reconectar no Lusha". O arquivo tem 11 casos, todos verdes.

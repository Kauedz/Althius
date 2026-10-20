# 03: testes e prints do cartao

**What to build:** `conexoes-calendly.test.tsx` nos estados de sempre, com a conta no cartão. Prints em `prints/`.

**Blocked by:** 01, 02

**Status:** ready-for-agent (feito; vira closed no merge)

## Comments

**19/10/2026 (agente).**
- `src/paginas/conexoes-calendly.test.tsx`, 11 casos: Admin e Membro, só OAuth, conta no cartão, ferramentas (só a de escrita marcada), desconectar com e sem aviso, reconectar e as voltas.
- **Defeito achado nos prints:** o cartão mostrava uma **imagem quebrada** no lugar do logo. O `LogoDaIntegracao` renderizava `<img>` sem `src` para toda Integração sem logo cadastrado (Calendly, Bitrix24, TikTok Ads, Slack, Google, Salesforce, Zoho e RD Station). Corrigi para as iniciais num quadrado discreto, como nas Contas-alvo. Teste novo em `src/components/logos.test.tsx`, vermelho antes e verde depois.
- Prints, refeitos depois da correção: [não conectado](prints/03-nao-conectado.jpg), [conectado com a conta](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg), [precisa reconectar](prints/03-precisa-reconectar.jpg), [volta ok](prints/03-volta-ok.jpg) e [aviso de revogação](prints/03-aviso-revogacao.jpg).

# 06: Composer de step por canal (variáveis e mídia)

**What to build:** ao editar um step, o usuário usa composers por canal (e-mail, LinkedIn, WhatsApp/SMS, ligação/tarefa) com variáveis de Conta e Persona, conteúdo persuasivo, anexo de imagem/print e vídeo na UI e pré-visualização estilizada com a cara de cada canal (WhatsApp tela de conversa, LinkedIn cartão/conversa, SMS celular, E-mail caixa de entrada, Ligação/tarefa cartão) — no espírito do mock aprovado. Nada dispara envio real (Unipile fora). Canais do research podem aparecer no documento mesmo sem provedor.

**Blocked by:** 05 (Detalhe da sequência — documento e timeline)

**Status:** closed

- [x] Cada canal do mock aprovado tem composer utilizável no detalhe
- [x] Pré-visualizar mostra a mensagem com a cara de cada canal (WhatsApp tela de conversa, LinkedIn cartão/conversa, SMS celular, E-mail caixa de entrada, Ligação/tarefa cartão)
- [x] Variáveis de Conta e Persona são inseríveis e ficam legíveis no texto
- [x] Imagem/print e vídeo aparecem como anexos na UI do step, sem upload a provedor externo obrigatório neste protótipo
- [x] Salvar o step persiste conteúdo, canal e anexos na fonte da sessão
- [x] Testes cobrem trocar canal, inserir variável e anexar mídia fictícia

# 03: Reentrada e progresso do checklist

**What to build:** Permitir reabrir o fluxo mantendo o progresso salvo: com o Day0 concluído, entrar novamente pula o Day0; os itens do checklist podem ser marcados como concluídos na Fonte; o item 3 é concluído ao visitar `/sinais`, sem exigir Monitoramento.

**Blocked by:** 01 (Protótipo completo do fluxo de onboarding)

**Status:** ready-for-agent

- [x] Ao reabrir o fluxo com Day0 concluído, o usuário começa no checklist.
- [x] O progresso dos itens do checklist permanece salvo na Fonte.
- [x] Cada item concluído aparece visualmente como concluído.
- [x] Visitar `/sinais` conclui o item 3.
- [x] Nenhuma etapa de Monitoramento é necessária para concluir o item 3.

## Comments

### 2026-09-24: implementação da reentrada e do progresso

- **Day0 concluído é uma marca guardada** (`day0Concluido`), ligada quando o wizard chega ao checklist pela primeira vez. Voltar a um passo do Day0 não a desfaz. Estados guardados sem a marca a recebem quando o passo guardado é o checklist.
- **Reabrir = entrar de novo em `/onboarding`.** A página chama `retomar()` na Fonte ao abrir: com o Day0 concluído, começa no checklist. Isso vale também para um refresh, então quem voltou para corrigir o "Como nos conheceu?" e recarrega a página cai no checklist, com tudo o que preencheu guardado. É a leitura de "entrar novamente pula o Day0".
- **Uma regra só para o checklist aberto:** o gate da Casca (`precisaDoOnboarding`), a visita a Sinais e todas as escritas do checklist na Fonte usam `day0Concluido`, não o passo atual. Visitar qualquer rota de `/sinais` conclui o item 3, inclusive depois de um item pulado, sem criar Monitoramento.
- **Progresso visível:** o checklist mostra "n de 3 concluídos" com um segmento por item, e o item concluído ganha selo preenchido com check. Um item pulado não conta como concluído.
- **Decisão além dos critérios:** enquanto o checklist está pendente (Day0 feito, onboarding não concluído), a barra lateral da Casca mostra "Primeiros passos → Checklist do Norte n/3", que leva a `/onboarding`. Fecha a lacuna anotada no ticket 02: fechado o aviso de retorno de Sinais, nada levava de volta ao checklist (histórias 41 e 72). Some depois de "Concluir onboarding".

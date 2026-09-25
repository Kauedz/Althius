# 19: Executar o primeiro ciclo real de Sequência por E-mail

> **Ponteiro — não implementar neste ticket.**
>
> **Implementado por canais-04 (Primeiro ciclo real por E-mail).**
> Fonte de verdade: [`../../canais-cadencia-backend/issues/04-primeiro-ciclo-real-email.md`](../../canais-cadencia-backend/issues/04-primeiro-ciclo-real-email.md).
> Unipile e ciclos de canal ficam em `.scratch/canais-cadencia-backend/`; o CRM não reimplementa.
>
> Conteúdo histórico abaixo mantido só como referência.

---

**What to build:** vendedor responsável envia um passo pelo seu remetente pessoal, recebe uma resposta real e vê a Sequência da Conta pausada, enquanto conteúdo privado permanece restrito.

**Blocked by:** 17: Vincular Sequências e responsabilidades às Contas reais; 16: Conectar e reconciliar Contas remetentes pela Unipile.

**Status:** superseded

- [ ] Passo confirmado envia ao e-mail real do Contato usando somente remetente pessoal do responsável.
- [ ] Envio, aceitação do provider e entrega/leitura não são confundidos; resultado é persistido e visível com precisão.
- [ ] Webhook autenticado é persistido rapidamente e processado de forma idempotente.
- [ ] Resposta do Contato cria Interação privada e pausa em uma operação atômica todos os passos da Conta, sem pausar outras Contas.
- [ ] Titular lê conteúdo; demais participantes veem somente evento/status permitido.
- [ ] Mensagem própria do titular não conta como resposta comercial.
- [ ] Timeout incerto passa por reconciliação antes de retry; nunca há reenvio cego.
- [ ] E-mail ausente bloqueia somente o passo que depende dele.


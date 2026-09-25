# 21: Executar mensagens de Sequência pelo WhatsApp

> **Ponteiro — não implementar neste ticket.**
>
> **Implementado por canais-06 (Ciclo real WhatsApp).**
> Fonte de verdade: [`../../canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md`](../../canais-cadencia-backend/issues/06-ciclo-real-whatsapp.md).
> Unipile e ciclos de canal ficam em `.scratch/canais-cadencia-backend/`; o CRM não reimplementa.
>
> Conteúdo histórico abaixo mantido só como referência.

---

**What to build:** vendedor responsável envia mensagens ao Contato pela sua conta pessoal de WhatsApp conectada; resposta comercial pausa a Sequência inteira sem expor conteúdo aos demais.

**Blocked by:** 17: Vincular Sequências e responsabilidades às Contas reais; 16: Conectar e reconciliar Contas remetentes pela Unipile.

**Status:** superseded

- [ ] Passo confirmado envia ao número real normalizado usando exclusivamente o remetente WhatsApp do responsável.
- [ ] Conversa existente só é reutilizada quando correlacionada com segurança; nova conversa só começa para o destinatário aprovado.
- [ ] Eventos distinguem resposta do Contato, mensagem própria do titular e envio feito pelo provider.
- [ ] Conversa não correlacionada não vira Interação compartilhada nem pausa Sequência.
- [ ] Resposta comercial pausa toda a Sequência da Conta uma vez e mantém conteúdo restrito ao responsável.
- [ ] Timeout/aceitação incerta não provoca reenvio cego; reconexão deduplica backlog relevante.
- [ ] Número ausente bloqueia somente o passo que depende de WhatsApp.


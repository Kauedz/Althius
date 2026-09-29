# 09: Revisar e propagar ICP e Personas do Workspace

**What to build:** participantes solicitam propostas de ICP e Personas e Administradores revisam, aprovam ou recusam; a última versão aprovada atualiza as referências compartilhadas.

**Blocked by:** 03: Convidar e gerenciar participantes; 08: Persistir perfil e preferências; 13: Persistir Agentes e permissões por integração; 14: Executar Conversas e Coordenação com estado recuperável.

**Status:** ready-for-agent

- [ ] ICP e Personas são persistidos como configuração compartilhada do Workspace, não como cópias por participante.
- [ ] Propostas, decisão administrativa e auditoria têm estado e autor persistidos.
- [ ] Somente Administrador aprova ou recusa.
- [ ] A aprovação substitui a versão atual e propaga às dependências existentes conforme a spec de Configurações.
- [ ] A interface atual mostra versão aprovada, proposta pendente, recusa e estado vazio sem roteiros apresentados como trabalho real.

## Comments

**2026-09-29, decisão do usuário: esperar os Agentes.** A spec de Configurações diz que a revisão do ICP é proposta pelo Scopus e a das Personas pelo Ethos, e que não há edição direta que dispense esses Agentes e a Aprovação. Uma primeira implementação deixava o próprio participante escrever a proposta, porque os Agentes ainda não rodam no Workspace operacional. O usuário escolheu não seguir com essa ponte: o ticket espera a 13 e a 14.

- Enquanto isso, a Memória do Workspace no Workspace operacional mostra um aviso ("O ICP e as Personas deste Workspace chegam junto com os Agentes."), no lugar do aviso genérico de seção indisponível. Sem documento de exemplo e sem edição direta.
- O rascunho da primeira implementação ficou em `.scratch/crm-real-e-stack/rascunhos/09-icp-e-personas-proposta-direta.patch`, só como referência. Ele traz a migration `memoria_do_workspace` (documentos, revisões e eventos por Workspace, aprovação só de Administrador), 49 testes pgTAP e a tela. Quando a 13 e a 14 existirem, a proposta deve vir do Agente, e não do texto livre do participante.

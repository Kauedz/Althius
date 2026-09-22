# 04: Criar Agente a partir de uma Especialidade

**What to build:** o usuário clica em "Novo agente" na barra de topo da página de Agentes e vê um formulário simulado. Nele, escolhe a Especialidade entre os 4 cartões, escreve o complemento do nome e, se quiser, instruções. O nome do Agente é sempre "Especialidade · complemento" (ex.: "Scopus · Enterprise LATAM"). Ao criar, o Agente começa com uma cópia da Personalização, das Permissões e das Habilidades do Agente padrão da mesma Especialidade, com Memória vazia e sem Rotinas (ADR 0005). Ele entra na grade (com "Sob demanda" e zero execuções) e a página dele abre. O Agente criado vale até recarregar a página.

**Blocked by:** 03 (Grade de Agentes e nova casca)

**Status:** ready-for-agent

- [ ] "Novo agente" abre o formulário com as 4 Especialidades, o complemento do nome e as instruções opcionais
- [ ] Não é possível criar sem escolher uma Especialidade e sem um complemento
- [ ] O Agente criado aparece na grade com o nome "Especialidade · complemento" e abre a página dele logo depois de criado
- [ ] A Configuração do Agente criado mostra a Personalização e as Permissões copiadas do Agente padrão, com as instruções do formulário
- [ ] As Habilidades são copiadas do padrão; a Memória está vazia; não há Rotinas
- [ ] Mudar a Personalização do Agente criado não muda a do Agente padrão, e vice-versa
- [ ] O formulário não oferece criar uma Especialidade nova

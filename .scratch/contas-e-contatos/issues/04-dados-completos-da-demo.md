# 04: Dados completos da demo

**What to build:** o apresentador abre o módulo e vê um mercado com cara de real. São cerca de 30 Contas-alvo reais, coerentes com os roteiros e a Memória dos Agentes (OpenAI, Stripe, Anthropic, Nubank, BBVA México, Banorte, entre outras), com Contatos, Sinais e Interações. Todos os dados são descritos como deslocamentos a partir da data de "hoje", para que "há 2 dias" continue verdadeiro no dia da demo.

**Blocked by:** 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** ready-for-agent

- [ ] 18 Quentes (todas com Sinal recente), 8 Fit, 3 Não fit e 1 não avaliada
- [ ] As 3 Não fit e a não avaliada têm origem "importada", pela usuária da demo; as demais, "recomendada pela Althius"
- [ ] O Sinal mais recente da OpenAI é a abertura de três vagas de engenharia de dados de avaliação, como no roteiro do Rhetor
- [ ] Os Sinais têm frase e fonte plausíveis, sem URL de evidência
- [ ] Os Contatos têm nomes fictícios e cargos reais, com e sem Persona e com disponibilidade de canais variada, sem nenhum valor de e-mail, telefone ou perfil
- [ ] Algumas empresas têm quatro ou mais Contatos, outras menos, e três não têm nenhum
- [ ] As Interações são coerentes com os roteiros e as Aprovações existentes, quando se referem às mesmas empresas
- [ ] Os dados ausentes seguem a spec: 4 sem logo, 3 sem Contatos, 3 sem Sinal, 5 com "Nunca" no Último contato, 2 sem segmento e 3 sem site nem LinkedIn
- [ ] Os sites e LinkedIn preenchidos são os endereços públicos reais
- [ ] Os logos são os SVGs oficiais do Simple Icons (CC0) das empresas que os têm, como nas Integrações
- [ ] Nenhum dado exposto ao módulo tem nota numérica de Aderência
- [ ] Os testes existentes continuam verdes; as expectativas que dependiam do conjunto inicial são ajustadas ao conjunto completo

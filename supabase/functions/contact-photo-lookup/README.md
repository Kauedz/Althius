# contact-photo-lookup (CRM-12)

Busca a foto pública do perfil LinkedIn de um Contato por um Actor do Apify e mostra a imagem onde o app já tem o
avatar. Sem foto, com erro ou com a URL vencida, o avatar continua com as iniciais.

## Como funciona

1. O navegador chama `POST /functions/v1/contact-photo-lookup` com `{ contactId }` só quando a pessoa aciona a busca no
   Contato. Nada roda ao abrir ou desenhar a tabela.
2. `begin_contact_photo_lookup` (sessão de quem pede) confere que o Contato é de um Workspace onde a pessoa participa,
   que o LinkedIn é um perfil `/in/`, que não há outra consulta em andamento e os limites, e grava a reserva.
3. O Actor roda com o token que só a função conhece. Da resposta só interessa a URL da imagem; nome, cargo e o resto
   do perfil não são lidos nem guardados.
4. `finish_contact_photo_lookup` (só `service_role`) grava o estado em `public.contact_photos`: origem (`apify`), Actor,
   execução, estado (`found`, `not_found`, `failed`), URL, validade da URL e data de observação.
5. A tela lê `public.contact_photo_status`, que só devolve a foto enquanto ela vale.

## Actor escolhido e o que NÃO foi verificado

Escolhido: **`harvestapi/linkedin-profile-scraper`** (id `harvestapi~linkedin-profile-scraper`). Motivos: parte de um
perfil público sem cookies nem login do LinkedIn, cobra por perfil (uns US$ 4 por mil perfis, segundo a página do
Actor no Apify) e devolve a foto do perfil no campo `photo`.

**Não consegui verificar o Actor contra a página dele no Apify**: o ambiente em que isto foi escrito não alcança
`apify.com` (nem o repositório do autor no GitHub), então o Actor, o preço, o nome do campo de entrada e o formato da
saída vêm só de resultados de busca, sem a documentação do Actor aberta. Por isso:

- o id do Actor é configurável (`APIFY_PHOTO_ACTOR_ID`);
- a entrada é um modelo JSON configurável (`APIFY_PHOTO_INPUT`), com `{{identifier}}` (o `<perfil>` de
  `linkedin.com/in/<perfil>`) e `{{url}}` (a URL inteira). Padrão: `{"publicIdentifiers":["{{identifier}}"]}`. Se o
  Actor pedir a URL, use por exemplo `{"urls":["{{url}}"]}`;
- a saída é lida com tolerância: o primeiro item, o primeiro campo entre `photo`, `profilePicture`,
  `profilePictureUrl`, `pictureUrl`, `avatar` e `imageUrl`, como texto ou como objeto com `url`. Item ausente, sem
  imagem ou com erro vira "sem foto", nunca erro da tela;
- os parâmetros `maxItems` e `maxTotalChargeUsd` da chamada (teto de cobrança por execução, padrão US$ 0,05, ajustável
  por `APIFY_PHOTO_MAX_CHARGE_USD`) seguem a API do Apify como eu a conheço e também não foram conferidos.

Antes de ligar em produção, abrir a página do Actor no Apify e conferir: campo de entrada, campo de saída da foto,
preço, condições de uso do dado e o que ele diz sobre retenção. Só o primeiro teste real prova o Actor: o teste com
`fetch` injetado prova o contrato desta função, não o do Apify.

## Segredos

- `APIFY_TOKEN` (obrigatório): token da API do Apify. Sem ele a função não sobe.
- `APP_ORIGIN` (obrigatório): o mesmo das outras funções.
- `APIFY_PHOTO_ACTOR_ID` (opcional): padrão `harvestapi~linkedin-profile-scraper`.
- `APIFY_PHOTO_INPUT` (opcional): modelo JSON da entrada. Um modelo que não é JSON derruba a função na subida.
- `APIFY_PHOTO_MAX_CHARGE_USD` (opcional): teto de cobrança por execução. Padrão `0.05`.

## Limites e estados

| Limite | Valor | Onde |
| --- | --- | --- |
| Consultas em andamento por Contato | 1 (uma parada há mais de 3 minutos deixa de contar) | `contact_photos.status = 'pending'` |
| Entre duas consultas do mesmo Contato | 1 minuto | `private.contact_photo_lookups` |
| Por Contato | 3 por dia | idem |
| Por Workspace | 50 por dia | idem |
| Prazo do Actor | 60 s na execução, 75 s na chamada | `apify.ts` |

Cada reserva conta, ache o Actor a foto ou não. Não há repetição automática (cada nova execução custa): quem quiser
tenta de novo, dentro do limite do Contato. Uma resposta atrasada de uma consulta já substituída não grava.

## Imagem e retenção

Guardamos só a URL devolvida, não a imagem. Motivos: a URL do LinkedIn expira, e sem cópia não há arquivo a reter,
apagar ou proteger num bucket. O navegador carrega a URL direto da CDN (sem `Referer`); se ela vencer ou quebrar, o
avatar cai para as iniciais.

A foto some da tela (a visão devolve `photo_url` nulo) quando a URL passa da validade que ela declara (`e=` na consulta),
quando passam 30 dias da observação ou quando o LinkedIn do Contato muda. O job diário `althius-contact-photo-retention`
(`private.purge_contact_photos`, pg_cron) apaga a URL de vez; o estado, o Actor e a data de observação ficam como
registro. Os 30 dias são uma escolha de produto, sem base em condições do Actor, que não pude ler: ver a decisão em aberto
no ticket.

## Correções manuais

A foto é um campo próprio. A consulta nunca lê nem altera nome, cargo, e-mail, telefone ou LinkedIn do Contato. Hoje não
há como uma pessoa informar a foto; quando houver, ela entra com `origin = 'manual'`, e a consulta (e a limpeza) não a
substitui sem confirmação (`409` na função, erro `55000` no banco).

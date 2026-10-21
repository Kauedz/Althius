# Publicação do frontend

O frontend (`projeto-althius-frontend`) vai ao ar em `https://app.althius.com.br`, servido por um Caddy num container
Docker na VPS da Hostinger (`srv2043190.hstgr.cloud`, `179.236.255.222`). As Edge Functions e as migrations têm caminho
próprio (`docs/agents/migrations.md`); este documento é só do frontend.

## O que existe na VPS

Tudo fica em `/opt/althius-web/`:

| Caminho | Para que serve |
| --- | --- |
| `publish.sh <ref>` | Publica: `git fetch` em `src/`, build num container `node:22`, backup do `dist` atual, troca do `dist`, conferência e rollback automático se a conferência falhar. Exige `SSH_AUTH_SOCK` (um agente SSH, mesmo vazio: o `src/` busca por https). Guarda os 5 backups mais recentes. |
| `auto-publish.sh` | A publicação automática (abaixo): confere a `main` e, se mudou e o CI passou, chama o `publish.sh main`. |
| `COMMIT` | O commit no ar, gravado pelo `publish.sh`. |
| `rollback.sh` | Volta o `dist` para um backup anterior. Leia o cabeçalho antes de usar: `sed -n 1,40p /opt/althius-web/rollback.sh`. |
| `src/` | Clone do repositório `Kauedz/althius` usado no build, com o remoto em https (o repositório é público). |
| `Caddyfile` | Configuração do Caddy, montada no container `althius-web`. Cabeçalhos de segurança (CSP, HSTS) e de cache. |

Fora dela: as unidades `althius-auto-publish.service` e `althius-auto-publish.timer` em `/etc/systemd/system/`, o
estado em `/var/lib/althius-auto-publish/` e o log em `/var/log/althius-auto-publish.log`.

## Como uma publicação acontece

A VPS puxa; o GitHub não precisa de nenhum segredo.

1. Um push chega na `main` do `Kauedz/althius` (merge de PR) e o workflow `CI` roda.
2. A cada 5 minutos, o timer `althius-auto-publish.timer` roda `/opt/althius-web/auto-publish.sh`, que:
   - lê a ponta da `main` com `git ls-remote` (https, sem chave);
   - se ela já é o `COMMIT` no ar, não faz nada;
   - pergunta à API pública do GitHub (sem token) pelo workflow `ci.yml` do push desse commit. Ainda rodando: espera a
     próxima rodada. Falhou: não publica e registra no log. Passou: roda `publish.sh main` com um agente SSH vazio;
   - se a publicação falha, grava o commit em `/var/lib/althius-auto-publish/last-failed` e não tenta de novo esse
     commit sozinho (o próximo merge tenta normalmente).
3. O `publish.sh` faz o build, a troca, a conferência e, se a conferência falha, o rollback.

Uma rodada por vez (`flock`), e o `publish.sh` tem a própria trava. A API sem token aceita 60 chamadas por hora por IP;
o script só a chama quando a `main` mudou.

Conferir e operar (na VPS):

```bash
systemctl list-timers althius-auto-publish.timer
tail -n 30 /var/log/althius-auto-publish.log
/opt/althius-web/auto-publish.sh -v                      # uma rodada agora, registrando também o "nada a fazer"
rm -f /var/lib/althius-auto-publish/last-failed          # deixar tentar de novo um commit que falhou
systemctl disable --now althius-auto-publish.timer       # desligar a publicação automática
systemctl enable --now althius-auto-publish.timer        # religar
```

## Cache

O Caddy manda `Cache-Control: no-cache` em tudo que não é `/assets/*` (o `index.html`, em qualquer rota da SPA) e
`public, max-age=31536000, immutable` em `/assets/*`, que têm hash no nome. Assim o navegador sempre revalida o
`index.html` (o ETag evita baixar de novo quando não mudou) e nunca pede de novo um asset que já tem. Sem isso, depois
da publicação de 2026-10-19 o navegador reaproveitou o `index.html` antigo.

Conferir:

```bash
curl -sI https://app.althius.com.br/ | grep -i cache-control
curl -sI "https://app.althius.com.br$(curl -s https://app.althius.com.br/ | grep -o '/assets/[^"]*\.js' | head -1)" | grep -i cache-control
```

## Publicar à mão

Para repetir uma publicação que falhou, ou publicar com o timer desligado. Pelo Mac, com a chave restrita `althius-publicar`
(no `authorized_keys` da VPS ela só roda `publish.sh main`):

```bash
ssh -A -i ~/.ssh/althius-publicar -o IdentitiesOnly=yes -o UserKnownHostsFile=$HOME/.ssh/althius-known-hosts \
  -o StrictHostKeyChecking=yes root@179.236.255.222 '/opt/althius-web/publish.sh main'
```

Ou pelo terminal do navegador do hPanel (VPS > srv2043190 > Terminal):

```bash
eval "$(ssh-agent -s)"
/opt/althius-web/publish.sh main
```

Voltar a versão anterior à mão:

```bash
sed -n 1,40p /opt/althius-web/rollback.sh
/opt/althius-web/rollback.sh
```

Depois de um rollback, a `main` continua diferente do `COMMIT` no ar, então o timer publicaria a `main` de novo na
próxima rodada. Para segurar a versão anterior, desligue o timer antes (`systemctl disable --now althius-auto-publish.timer`).

## Configuração inicial (uma vez, terminal do hPanel)

### Publicação automática

As cópias versionadas ficam em `scripts/vps/`. Para instalar ou atualizar na VPS (como root), copie os três arquivos para
lá e rode:

```bash
install -m 750 auto-publish.sh /opt/althius-web/auto-publish.sh
install -m 644 althius-auto-publish.service althius-auto-publish.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now althius-auto-publish.timer
/opt/althius-web/auto-publish.sh -v && tail -n 3 /var/log/althius-auto-publish.log
```

### Cache no Caddyfile (terminal do hPanel)

Primeiro olhe o arquivo e ache o bloco do site (a linha com `app.althius.com.br` terminando em `{`):

```bash
cat -n /opt/althius-web/Caddyfile
```

Backup, inserção das três linhas logo depois da abertura do bloco, e validação com a mesma imagem do container. O
`cat >` regrava o arquivo no mesmo lugar, para o container (que monta o arquivo) ver a versão nova ao reiniciar:

```bash
cd /opt/althius-web
cp -a Caddyfile Caddyfile.bak-$(date +%Y%m%d%H%M%S)
grep -c 'app\.althius\.com\.br.*{[[:space:]]*$' Caddyfile
awk '{ print } !feito && /app\.althius\.com\.br.*\{[[:space:]]*$/ {
  print "\t@nao_assets not path /assets/*"
  print "\theader @nao_assets Cache-Control \"no-cache\""
  print "\theader /assets/* Cache-Control \"public, max-age=31536000, immutable\""
  feito = 1 }' Caddyfile > /tmp/Caddyfile.novo
diff Caddyfile /tmp/Caddyfile.novo
IMG=$(docker inspect -f '{{.Config.Image}}' althius-web)
docker run --rm -v /tmp/Caddyfile.novo:/etc/caddy/Caddyfile:ro "$IMG" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Siga só se o `grep -c` deu `1`, o `diff` mostra apenas as três linhas novas e o `validate` terminou com `Valid
configuration`. Então:

```bash
cat /tmp/Caddyfile.novo > /opt/althius-web/Caddyfile
docker restart althius-web
sleep 3
docker ps --filter name=althius-web
curl -sI https://app.althius.com.br/ | grep -i cache-control
```

Se o container não subir, volte o backup (troque pelo nome que o `ls` mostrar) e reinicie:

```bash
ls -1 /opt/althius-web/Caddyfile.bak-*
cat /opt/althius-web/Caddyfile.bak-AAAAMMDDHHMMSS > /opt/althius-web/Caddyfile
docker restart althius-web
```

Se o bloco do site já usa `handle`/`route` para `/assets`, ou o `grep -c` não deu `1`, não aplique: mande o
`cat -n` para quem está fazendo o ticket.

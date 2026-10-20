# Publicação do frontend

O frontend (`projeto-althius-frontend`) vai ao ar em `https://app.althius.com.br`, servido por um Caddy num container
Docker na VPS da Hostinger (`srv2043190.hstgr.cloud`, `179.236.255.222`). As Edge Functions e as migrations têm caminho
próprio (`docs/agents/migrations.md`); este documento é só do frontend.

## O que existe na VPS

Tudo fica em `/opt/althius-web/`:

| Caminho | Para que serve |
| --- | --- |
| `publish.sh <ref>` | Publica: `git fetch` em `src/`, build num container `node:22`, backup do `dist` atual, troca do `dist`, conferência e rollback automático se a conferência falhar. Exige `SSH_AUTH_SOCK` (agente SSH encaminhado). |
| `rollback.sh` | Volta o `dist` para um backup anterior. Leia o cabeçalho antes de usar: `sed -n 1,40p /opt/althius-web/rollback.sh`. |
| `src/` | Clone do repositório `Kauedz/althius` usado no build. |
| `Caddyfile` | Configuração do Caddy, montada no container `althius-web`. Cabeçalhos de segurança (CSP, HSTS) e de cache. |

## Como uma publicação acontece

1. Um push chega na `main` do `Kauedz/althius` (merge de PR).
2. O workflow `CI` roda.
3. Se o CI passar, o workflow `Publicar frontend` (`.github/workflows/publicar-frontend.yml`) confere que o commit
   ainda é a ponta da `main`, abre SSH como `root` na VPS e roda `/opt/althius-web/publish.sh main`. Se a `main` já
   andou, ele não publica: o CI do commit mais novo chama a publicação dele.
4. No fim, confere que `https://app.althius.com.br/` responde 200 e mostra o `Cache-Control` do `index.html`.

Para publicar sem push (repetir uma publicação que falhou, por exemplo): Actions > Publicar frontend > Run workflow,
ou `gh workflow run publicar-frontend.yml --repo Kauedz/althius`.

Segredos do repositório `Kauedz/althius` que o workflow lê:

| Segredo | Conteúdo |
| --- | --- |
| `VPS_SSH_KEY` | Chave privada ed25519 só para publicar. A pública está em `/root/.ssh/authorized_keys` com `command=` fixo no `publish.sh main`. |
| `VPS_HOST` | `179.236.255.222` |
| `VPS_KNOWN_HOSTS` | As linhas de `ssh-keyscan` da VPS, conferidas contra as chaves do próprio servidor. |

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

## Se o workflow falhar

Abra o log da execução em Actions > Publicar frontend. O passo que falhou diz onde olhar:

- **Preparar a chave**: segredo `VPS_SSH_KEY` vazio ou mal colado (precisa das linhas `-----BEGIN` e `-----END`).
- **Rodar o publish.sh**, com `Host key verification failed`: a VPS mudou de chave (reinstalação) ou `VPS_KNOWN_HOSTS`
  está errado. Refaça o `VPS_KNOWN_HOSTS` como nos passos abaixo. Nunca troque para `StrictHostKeyChecking=no`.
- **Rodar o publish.sh**, com `Permission denied (publickey)`: a linha da chave saiu do `/root/.ssh/authorized_keys`.
- **Rodar o publish.sh**, com erro do próprio script (fetch, build, conferência): o `publish.sh` já desfez a troca se a
  conferência falhou, então o site continua na versão anterior. Corrija a causa e rode de novo pelo Run workflow.

Publicar à mão (o caminho antigo, pelo terminal do navegador do hPanel, VPS > srv2043190 > Terminal):

```bash
eval "$(ssh-agent -s)"
/opt/althius-web/publish.sh main
```

Voltar a versão anterior à mão:

```bash
sed -n 1,40p /opt/althius-web/rollback.sh
/opt/althius-web/rollback.sh
```

## Passos do Nan (configuração inicial)

Uma vez só. Os segredos têm de ser criados por quem é admin do `Kauedz/althius` (o Kauê, se o Nan não for).

### 1. Gerar o par de chaves (PowerShell, no computador do Nan)

Sem senha (aperte Enter duas vezes quando pedir):

```powershell
ssh-keygen -t ed25519 -C "github-actions publicar-frontend" -f "$env:USERPROFILE\.ssh\althius-publicar"
Get-Content "$env:USERPROFILE\.ssh\althius-publicar.pub"
```

### 2. Autorizar a chave na VPS (terminal do hPanel)

Troque `COLE_AQUI` pela linha inteira que o `Get-Content` mostrou (começa com `ssh-ed25519`). O `command=` faz a chave só
conseguir rodar a publicação; `agent-forwarding` deixa o `SSH_AUTH_SOCK` chegar ao script.

```bash
cp -a /root/.ssh/authorized_keys /root/.ssh/authorized_keys.bak-$(date +%Y%m%d%H%M%S)
echo 'command="/opt/althius-web/publish.sh main",restrict,agent-forwarding COLE_AQUI' >> /root/.ssh/authorized_keys
tail -1 /root/.ssh/authorized_keys
```

### 3. Trocar o remoto do `src/` para https (terminal do hPanel)

O repositório é público, então o `git fetch` não precisa de chave do GitHub. Com isso o fetch não depende de qual
agente foi encaminhado.

```bash
git -C /opt/althius-web/src remote -v
git -C /opt/althius-web/src remote set-url origin https://github.com/Kauedz/althius.git
git -C /opt/althius-web/src fetch origin main
grep -n 'SSH_AUTH_SOCK' /opt/althius-web/publish.sh
```

Se o `remote -v` mostrar outro nome no lugar de `origin`, use esse nome. O `grep` mostra onde o script exige o agente;
com o remoto em https a checagem continua satisfeita pelo `ssh -A` do workflow.

### 4. Conferir as chaves da VPS (terminal do hPanel)

```bash
for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done
```

No PowerShell, compare com o que a rede mostra; as impressões (`SHA256:...`) têm de ser iguais:

```powershell
ssh-keyscan -t ed25519,ecdsa,rsa 179.236.255.222 2>$null | Out-File -Encoding ascii "$env:TEMP\althius-known-hosts"
ssh-keygen -lf "$env:TEMP\althius-known-hosts"
```

### 5. Criar os segredos (PowerShell, com `gh` logado como admin do `Kauedz/althius`)

```powershell
Get-Content "$env:USERPROFILE\.ssh\althius-publicar" -Raw | gh secret set VPS_SSH_KEY --repo Kauedz/althius
gh secret set VPS_HOST --repo Kauedz/althius --body "179.236.255.222"
Get-Content "$env:TEMP\althius-known-hosts" -Raw | gh secret set VPS_KNOWN_HOSTS --repo Kauedz/althius
gh secret list --repo Kauedz/althius
```

Depois, testar sem esperar um merge:

```powershell
gh workflow run publicar-frontend.yml --repo Kauedz/althius
gh run watch --repo Kauedz/althius
```

### 6. Cache no Caddyfile (terminal do hPanel)

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

#!/bin/bash
# Publicação automática do frontend por pull (sem segredos no GitHub).
# A cada execução (timer do systemd): lê a ponta da main do repositório público, compara com o commit no ar
# (/opt/althius-web/COMMIT, gravado pelo publish.sh) e, se for nova E o workflow CI (push) desse commit terminou
# com sucesso, roda /opt/althius-web/publish.sh main. CI pendente: espera a próxima rodada. CI falhou: não publica.
# Um commit cuja publicação falhou não é tentado de novo sozinho (ver $FAILED); para repetir: apague esse arquivo.
# Desligar: systemctl disable --now althius-auto-publish.timer
set -uo pipefail
BASE=/opt/althius-web
REPO=https://github.com/Kauedz/Althius
API=https://api.github.com/repos/Kauedz/Althius
STATE=/var/lib/althius-auto-publish
FAILED=$STATE/last-failed
LOG=/var/log/althius-auto-publish.log
MAXLOG=1048576
mkdir -p "$STATE"
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt "$MAXLOG" ]; then mv -f "$LOG" "$LOG.1"; fi
log() { echo "$(date -Is) $*" >> "$LOG"; }

exec 8>/run/althius-auto-publish.lock
flock -n 8 || { log "outra rodada em andamento"; exit 0; }

HEAD=$(timeout 30 git ls-remote "$REPO" refs/heads/main 2>/dev/null | cut -f1)
if ! [[ "$HEAD" =~ ^[0-9a-f]{40}$ ]]; then log "ls-remote falhou"; exit 0; fi
LIVE=$(cat "$BASE/COMMIT" 2>/dev/null || true)
if [ "$HEAD" = "$LIVE" ]; then
  [ "${1:-}" = "-v" ] && log "nada a fazer: main=$HEAD já está no ar"
  exit 0
fi
if [ -f "$FAILED" ] && [ "$(cat "$FAILED")" = "$HEAD" ]; then
  [ "${1:-}" = "-v" ] && log "main=$HEAD já falhou antes; não repito (apague $FAILED para tentar de novo)"
  exit 0
fi

# Gate do CI: o workflow ci.yml do push desse commit precisa ter terminado com sucesso; status legado, se houver, também.
CI=$(timeout 30 curl -fsS -H 'Accept: application/vnd.github+json' "$API/actions/runs?head_sha=$HEAD&event=push&per_page=50" 2>/dev/null \
  | python3 -c '
import json, sys
try:
    runs = [r for r in json.load(sys.stdin)["workflow_runs"] if r.get("path") == ".github/workflows/ci.yml"]
except Exception:
    print("erro"); sys.exit()
if not runs: print("pendente"); sys.exit()
r = max(runs, key=lambda r: r.get("run_attempt", 1))
if r["status"] != "completed": print("pendente")
elif r["conclusion"] == "success": print("ok")
else: print("falhou:" + str(r["conclusion"]))
')
ST=$(timeout 30 curl -fsS "$API/commits/$HEAD/status" 2>/dev/null \
  | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print("ok" if d["total_count"]==0 or d["state"]=="success" else d["state"])
except Exception: print("erro")')
if [ "$CI" != ok ] || [ "$ST" != ok ]; then
  if [[ "$CI" == falhou* ]] || [ "$ST" = failure ] || [ "$ST" = error ]; then
    log "main=$HEAD com CI=$CI status=$ST: não publico"
  elif [ "${1:-}" = "-v" ]; then
    log "main=$HEAD aguardando CI (CI=$CI status=$ST)"
  fi
  exit 0
fi

log "publicando main=$HEAD (no ar: $LIVE)"
# O publish.sh exige SSH_AUTH_SOCK; o src usa https (repo público), então um agente vazio basta.
eval "$(ssh-agent -s)" > /dev/null
OUT=$("$BASE/publish.sh" main 2>&1); RC=$?
ssh-agent -k > /dev/null 2>&1 || true
echo "$OUT" | tail -40 | sed 's/^/    /' >> "$LOG"
if [ $RC -eq 0 ] && [ "$(cat "$BASE/COMMIT" 2>/dev/null)" = "$HEAD" ]; then
  log "ok: $HEAD no ar"; rm -f "$FAILED"
else
  log "FALHOU (rc=$RC) para $HEAD"; echo "$HEAD" > "$FAILED"; exit 1
fi

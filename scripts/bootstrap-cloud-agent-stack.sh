#!/usr/bin/env bash
set -euo pipefail

# Version pinned on purpose (auditada el 2026-09-25): una sesion futura NO
# debe ejecutar automaticamente una version de ruflo mas nueva sin que
# alguien la revise primero. Para probar una version nueva, cambiar esta
# variable a mano (o exportar RUFLO_VERSION antes de llamar al script) y
# actualizar tambien .mcp.json a juego.
RUFLO_VERSION="${RUFLO_VERSION:-3.45.0}"

echo "== Atheron Cloud Agent Stack bootstrap (ruflo@${RUFLO_VERSION}) =="

echo
echo "[1/8] Runtime"
node --version
npm --version
git --version
python3 --version || true

echo
echo "[2/8] Ruflo skill"
npx --yes skills add ruvnet/ruflo --skill ruflo --yes

echo
echo "[3/8] Ruflo project init"
npx --yes "ruflo@${RUFLO_VERSION}" init

echo
echo "[4/8] Ruflo MCP en Claude Code"
# 'ruflo init' ya escribe el registro canonico (clave "claude-flow") en el
# .mcp.json del proyecto, versionado y con CLAUDE_FLOW_MCP_TOOLS filtrado.
# NO volver a registrarlo con 'claude mcp add': eso crea un segundo
# registro con otra clave ("ruflo") que ruflo doctor senala como
# duplicado. Aqui solo se limpia ese duplicado legado si existe, por si
# quedo de una ejecucion anterior a esta correccion.
if command -v claude >/dev/null 2>&1; then
  claude mcp remove ruflo >/dev/null 2>&1 || true
  echo "MCP registrado via .mcp.json (clave claude-flow). Aprobacion pendiente: requiere abrir 'claude' de forma interactiva una vez."
else
  echo "WARN: claude CLI not found; el registro sigue quedando en .mcp.json para cuando este disponible."
fi

echo
echo "[5/8] Ruflo diagnostics"
npx --yes "ruflo@${RUFLO_VERSION}" doctor --fix || true

echo
echo "[6/8] 15-worker hierarchical-mesh swarm (autoScale off — ver AI/CLOUD_AGENT_STACK.md)"
npx --yes "ruflo@${RUFLO_VERSION}" swarm init --topology hierarchical-mesh --max-agents 15 --strategy specialized

echo
echo "[7/8] Graphify"
if command -v graphify >/dev/null 2>&1; then
  graphify --help >/dev/null
elif command -v uv >/dev/null 2>&1; then
  uv tool install graphifyy
  export PATH="$HOME/.local/bin:$PATH"
else
  python3 -m pip install --user -U graphifyy
  export PATH="$HOME/.local/bin:$PATH"
fi
graphify install
graphify claude install || true

echo
echo "[8/8] Optional companion CLIs (install only if missing)"
if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex || echo "WARN: Codex CLI install failed; leave for later."
fi
if ! command -v higgsfield >/dev/null 2>&1; then
  npm install -g @higgsfield/cli || echo "WARN: Higgsfield CLI install failed; leave for later."
fi

echo
echo "== Verification =="
echo "Ruflo:"
npx --yes "ruflo@${RUFLO_VERSION}" --version || true
npx --yes "ruflo@${RUFLO_VERSION}" doctor || true

echo
echo "Graphify:"
command -v graphify && graphify --help >/dev/null && echo "graphify: OK" || true

echo
echo "Codex:"
codex --version || true

echo
echo "Higgsfield:"
higgsfield --version || true

echo
echo "Bootstrap complete. Do not authenticate external services or add secrets from this script."

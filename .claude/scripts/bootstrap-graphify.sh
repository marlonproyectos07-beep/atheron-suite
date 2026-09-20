#!/usr/bin/env bash
#
# Instala Graphify en esta sesion de Claude Code.
#
# Se ejecuta A MANO, nunca de forma automatica:
#
#     bash .claude/scripts/bootstrap-graphify.sh
#
# Por que a mano: 'graphify install' escribe en ~/.claude/skills/graphify/,
# que es ambito de usuario y no se puede versionar. En los contenedores
# efimeros de Claude Code en la nube ese directorio nace vacio, asi que hay
# que reconstruirlo en cada sesion donde se quiera usar Graphify.
#
# No necesita ninguna clave de API. La extraccion de codigo es local
# (tree-sitter). Las variables ANTHROPIC_API_KEY / GEMINI_API_KEY /
# GOOGLE_API_KEY son opcionales, solo mejoran el etiquetado semantico, y
# se pasan por entorno: NUNCA se escriben en un archivo versionado.
#
# Fuente:  https://github.com/Graphify-Labs/graphify
# Paquete: https://pypi.org/project/graphifyy/
# Licencia: Apache-2.0 / MIT
#
set -euo pipefail

# Version fijada. Verificada el 2026-09-20 en Claude Code 2.1.278:
# 783 nodos y 1206 aristas sobre este repositorio, sin clave de API.
# Para subir de version, cambiar aqui y volver a verificar.
GRAPHIFY_VERSION="0.9.64"

echo "==> Instalando graphifyy==${GRAPHIFY_VERSION}"

if command -v uv >/dev/null 2>&1; then
  uv tool install "graphifyy==${GRAPHIFY_VERSION}"
elif command -v pipx >/dev/null 2>&1; then
  pipx install "graphifyy==${GRAPHIFY_VERSION}"
elif command -v pip3 >/dev/null 2>&1; then
  pip3 install --quiet --user "graphifyy==${GRAPHIFY_VERSION}"
else
  echo "ERROR: no hay uv, pipx ni pip3 disponibles." >&2
  exit 1
fi

export PATH="${HOME}/.local/bin:${PATH}"

if ! command -v graphify >/dev/null 2>&1; then
  echo "ERROR: 'graphify' no quedo en el PATH. Revisa ~/.local/bin." >&2
  exit 1
fi

echo "==> Registrando la skill para Claude Code"
graphify install --platform claude

echo
echo "==> Listo. Version: $(graphify --version)"
echo
echo "Siguiente paso, para construir el grafo de este repositorio:"
echo
echo "    graphify update ."
echo
echo "Escribe graphify-out/ (ignorado por git). Despues, dentro de Claude Code,"
echo "se consulta con /graphify."

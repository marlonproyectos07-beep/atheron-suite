#!/usr/bin/env bash
#
# Materializa en esta maquina los marketplaces que declara
# .claude/settings.json (que si esta versionado).
#
#     bash .claude/scripts/bootstrap-plugins.sh
#
# Por que hace falta: .claude/settings.json declara QUE marketplaces usa el
# proyecto, pero no trae su contenido. Claude Code necesita una copia local
# en ~/.claude/plugins/marketplaces/, que en un contenedor nuevo nace vacia.
# Este script la reconstruye. No inventa nada: clona exactamente los mismos
# repositorios que ya declara settings.json.
#
# Verificado el 2026-09-20 en Claude Code 2.1.278. Con la cache presente y
# SIN ningun ~/.claude/settings.json, una sesion abierta en este repositorio
# carga las 15 skills de superpowers; una sesion abierta en un repositorio
# sin .claude/settings.json no carga ninguna.
#
# No necesita credenciales. Solo lectura publica de GitHub.
#
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: no se encuentra el ejecutable 'claude'." >&2
  exit 1
fi

echo "==> Registrando marketplaces declarados en .claude/settings.json"

# Mismas fuentes que .claude/settings.json. Si cambian alli, cambiar aqui.
claude plugin marketplace add obra/superpowers-marketplace --scope project
claude plugin marketplace add anthropics/skills --scope project

echo
echo "==> Instalando plugins aprobados"

# Solo superpowers. document-skills NO se instala: duplicaria pdf/docx/xlsx/pptx,
# que ya llegan sincronizadas desde la cuenta de claude.ai. Ver .claude/README.md
claude plugin install superpowers@superpowers-marketplace --scope project

echo
claude plugin list

echo
echo "==> Listo. Reinicia la sesion de Claude Code para que cargue las skills."

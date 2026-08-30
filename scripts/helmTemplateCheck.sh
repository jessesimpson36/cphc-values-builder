#!/usr/bin/env bash
#
# helmTemplateCheck.sh — Render every fixture against every supported chart.
#
# The unit tests prove transform.js produces the values we intended. This proves
# the charts actually accept them: a renamed path, a wrong type (a port emitted
# as a string), or a value that trips a chart-side `fail` assertion is caught
# here rather than by a user running `helm install`.
#
# Every supported Camunda release is checked, not just the newest — the whole
# point of supporting more than one is that a file generated for 8.8 installs
# on 8.8. Chart versions come from package.json so they cannot drift from the
# values.yaml each schema was generated from.
#
# Run with:  npm run verify:helm

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v helm >/dev/null 2>&1; then
  echo "[helm] helm is not installed - see https://helm.sh/docs/intro/install/" >&2
  exit 1
fi

CHART_REPO=$(node -p "require('./package.json').camundaCharts[0].repository")
helm repo add camunda "${CHART_REPO}" >/dev/null 2>&1 || true
helm repo update camunda >/dev/null

npm run --silent fixtures

failed=0
total=0

while IFS=$'\t' read -r key chart_name chart_version app_version; do
  echo "[helm] Camunda ${app_version} - camunda/${chart_name} ${chart_version}"

  for fixture in "tmp/fixtures/${key}"/*.yaml; do
    name=$(basename "${fixture}" .yaml)
    total=$((total + 1))

    # --validate is deliberately omitted: it requires a live cluster. Template
    # rendering alone catches the failures this tool can actually cause.
    if output=$(helm template cphc "camunda/${chart_name}" \
          --version "${chart_version}" \
          --values "${fixture}" 2>&1); then
      echo "[helm]   ok   ${name}"
    else
      echo "[helm]   FAIL ${name}"
      echo "${output}" | sed 's/^/             /'
      failed=$((failed + 1))
    fi
  done
done < <(node -p "require('./package.json').camundaCharts.map(c => [c.key, c.chart, c.version, c.appVersion].join('\t')).join('\n')")

echo "[helm] ${total} render(s), ${failed} failed"
[ "${failed}" -eq 0 ]

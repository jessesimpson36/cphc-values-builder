#!/usr/bin/env bash
#
# helmTemplateCheck.sh — Render every fixture against the real Camunda chart.
#
# The unit tests prove transform.js produces the values we intended. This proves
# the chart actually accepts them: a renamed path, a wrong type (a port emitted
# as a string), or a value that trips a chart-side `fail` assertion is caught
# here rather than by a user running `helm install`.
#
# The chart version is read from package.json so it can never drift from the
# public/values.yaml the schema was generated from.
#
# Run with:  npm run verify:helm

set -euo pipefail

cd "$(dirname "$0")/.."

CHART_VERSION=$(node -p "require('./package.json').camundaChart.version")
CHART_NAME=$(node -p "require('./package.json').camundaChart.chart")
CHART_REPO=$(node -p "require('./package.json').camundaChart.repository")

echo "[helm] chart camunda/${CHART_NAME} version ${CHART_VERSION}"

if ! command -v helm >/dev/null 2>&1; then
  echo "[helm] helm is not installed - see https://helm.sh/docs/intro/install/" >&2
  exit 1
fi

helm repo add camunda "${CHART_REPO}" >/dev/null 2>&1 || true
helm repo update camunda >/dev/null

npm run --silent fixtures

failed=0
total=0

for fixture in tmp/fixtures/*.yaml; do
  name=$(basename "${fixture}" .yaml)
  total=$((total + 1))

  # --validate is deliberately omitted: it requires a live cluster. Template
  # rendering alone catches the failures this tool can actually cause.
  if output=$(helm template cphc "camunda/${CHART_NAME}" \
        --version "${CHART_VERSION}" \
        --values "${fixture}" 2>&1); then
    echo "[helm] ok   ${name}"
  else
    echo "[helm] FAIL ${name}"
    echo "${output}" | sed 's/^/           /'
    failed=$((failed + 1))
  fi
done

echo "[helm] ${total} fixture(s) rendered, ${failed} failed"
[ "${failed}" -eq 0 ]

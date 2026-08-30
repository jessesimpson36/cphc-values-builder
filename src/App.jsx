/**
 * App.jsx - Main UI Component
 *
 * Renders the entire Camunda Helm Values Generator interface.
 * The form structure is driven entirely by displayConfig.js - no fields
 * are hardcoded here. Adding or removing fields only requires changes
 * to displayConfig.js.
 *
 * Component tree:
 *   App
 *   ├── ThemeSelector
 *   ├── Product selection grid
 *   ├── Section (repeated for each visible section)
 *   │   └── Field (text | password | radio | checkbox | env_vars)
 *   │       └── Tooltip
 *   ├── SizingPreview        (throughput target mode)
 *   ├── MultiregionPreview   (multi-region mode)
 *   ├── Validation errors
 *   ├── Generate button
 *   └── YAML output
 */

import { useState, useEffect, useRef } from "react"
import {
  displayConfig,
  visibleSections as computeVisibleSections,
  violatedConstraints,
} from "./displayConfig"
import {
  SUPPORTED_VERSIONS,
  DEFAULT_VERSION,
  getChart,
  selectedVersion,
  fieldApplies,
  describePath,
} from "./chartVersions"
import {
  transformAnswers,
  resolveSizing,
  buildInitialContactPoints,
  multiregionRegions,
  effectiveClusterSize,
} from "./transform"
import { importValues } from "./importValues"
import { CALIBRATION_PROFILES, DEFAULT_CALIBRATION } from "./sizing"
import { dumpValues, loadValues } from "./yaml"
// ─── Tooltip icon ──────────────────────────────────────────────────────────────
function Tooltip({ path }) {
  const description = path ? describePath(path) : null
  const [pos, setPos] = useState(null)
  const iconRef = useRef(null)

  if (!description) return null

  const handleMouseEnter = () => {
    const rect = iconRef.current.getBoundingClientRect()
    // Use viewport coordinates (fixed positioning uses viewport, not document)
    setPos({
      top: rect.top,       // top of the icon in viewport
      left: rect.left + rect.width / 2,
    })
  }

  const handleMouseLeave = () => setPos(null)

  return (
    <div className="tooltip-wrapper" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="tooltip-icon" ref={iconRef}>?</div>
      {pos && (
        <div
          className="tooltip-box"
          style={{
            top: pos.top,
            left: pos.left,
            transform: "translate(-50%, -100%)",
            display: "block",
          }}
        >
          {description}
          <div className="tooltip-arrow" />
        </div>
      )}
    </div>
  )
}

// ─── Env Vars Editor ───────────────────────────────────────────────────────────
function EnvVarsEditor({ field, value, onChange }) {
  const rows = value || []

  const addRow = () => onChange(field.id, [...rows, { name: "", value: "" }])
  const removeRow = (index) => onChange(field.id, rows.filter((_, i) => i !== index))
  const updateRow = (index, key, val) => {
    onChange(field.id, rows.map((row, i) => i === index ? { ...row, [key]: val } : row))
  }

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" style={{ margin: 0 }}>
          {field.label}
          {field.required && <span className="required">*</span>}
        </label>
        <Tooltip path={field.path} />
      </div>

      <div className="env-vars-editor">
        {rows.length > 0 && (
          <div className="env-vars-header">
            <span className="env-vars-col-label">Name</span>
            <span className="env-vars-col-label">Value</span>
            <span />
          </div>
        )}

        {rows.map((row, index) => (
          <div key={index} className="env-var-row">
            <input
              type="text"
              className="env-var-input"
              placeholder="ENV_VAR_NAME"
              value={row.name}
              onChange={(e) => updateRow(index, "name", e.target.value)}
            />
            <input
              type="text"
              className="env-var-input"
              placeholder="value"
              value={row.value}
              onChange={(e) => updateRow(index, "value", e.target.value)}
            />
            <button className="btn-remove-env" onClick={() => removeRow(index)} title="Remove">
              ×
            </button>
          </div>
        ))}

        <button className="btn-add-env" onClick={addRow}>
          + Add Environment Variable
        </button>
      </div>
    </div>
  )
}

// ─── String List Editor ────────────────────────────────────────────────────────
// An ordered list of plain strings. Order is significant for multi-region
// namespaces: the position in the list is the region ID.

function StringListEditor({ field, value, onChange }) {
  const rows = value && value.length > 0 ? value : [""]

  const update = (next) => onChange(field.id, next)

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" style={{ margin: 0 }}>
          {field.label}
          {field.required && <span className="required">*</span>}
        </label>
        <Tooltip path={field.path} />
      </div>

      <div className="string-list-editor">
        {rows.map((row, index) => (
          <div key={index} className="string-list-row">
            <span className="string-list-index">{index}</span>
            <input
              type="text"
              className="field-input"
              placeholder={field.placeholder}
              value={row}
              onChange={(e) => update(rows.map((r, i) => (i === index ? e.target.value : r)))}
            />
            <button
              className="btn-remove-env"
              onClick={() => update(rows.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn-add-env" onClick={() => update([...rows, ""])}>
          + Add
        </button>
      </div>
    </div>
  )
}

// ─── Field ─────────────────────────────────────────────────────────────────────
function Field({ field, value, onChange }) {

  if (field.type === "env_vars") {
    return <EnvVarsEditor field={field} value={value} onChange={onChange} />
  }

  if (field.type === "string_list") {
    return <StringListEditor field={field} value={value} onChange={onChange} />
  }

  if (field.type === "text" || field.type === "password") {
    return (
      <div className="field">
        <div className="field-label-row">
          <label className="field-label" style={{ margin: 0 }}>
            {field.label}
            {field.required && <span className="required">*</span>}
          </label>
          <Tooltip path={field.path} />
        </div>
        <input
          type={field.type}
          className="field-input"
          placeholder={field.placeholder || field.label}
          value={value || ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      </div>
    )
  }

  if (field.type === "checkbox") {
    return (
      <div className="field">
        <div className="field-checkbox-row" onClick={() => onChange(field.id, !value)}>
          <div className={`field-checkbox-box ${value ? "checked" : ""}`}>
            {value && (
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="field-checkbox-label">{field.label}</span>
          <Tooltip path={field.path} />
        </div>
      </div>
    )
  }

  if (field.type === "radio") {
    return (
      <div className="field">
        <div className="field-label-row">
          <label className="field-label" style={{ margin: 0 }}>
            {field.label}
            {field.required && <span className="required">*</span>}
          </label>
          <Tooltip path={field.path} />
        </div>
        <div className="radio-group">
          {field.options.map((opt) => (
            <button
              key={opt}
              className={`radio-btn ${value === opt ? "selected" : ""}`}
              onClick={() => onChange(field.id, opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}

// ─── Section ───────────────────────────────────────────────────────────────────
function Section({ section, answers, onFieldChange }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-accent-bar" />
        <h2 className="card-title">{section.title}</h2>
      </div>
      <div className="card-body">
        {section.fields
          .filter((field) => fieldApplies(field, answers))
          .map((field) => (
            <Field
              key={field.id}
              field={field}
              value={answers[field.id]}
              onChange={onFieldChange}
            />
          ))}
      </div>
    </div>
  )
}

// ─── Sizing Preview ────────────────────────────────────────────────────────────
//
// Shows the computed topology before the user commits to it. Partition count in
// particular cannot be changed later by editing values.yaml — it needs a cluster
// scaling procedure — so it is worth seeing the number before installing.

function SizingPreview({ answers }) {
  const sizing = resolveSizing(answers)
  if (!sizing) return null

  const calibration = CALIBRATION_PROFILES[answers.sizing_calibration || DEFAULT_CALIBRATION]

  return (
    <div className="preview-panel">
      <div className="preview-header">Computed topology</div>

      <div className="preview-grid">
        <div className="preview-stat">
          <span className="preview-value">{sizing.clusterSize}</span>
          <span className="preview-label">brokers</span>
        </div>
        <div className="preview-stat">
          <span className="preview-value">{sizing.partitionCount}</span>
          <span className="preview-label">partitions</span>
        </div>
        <div className="preview-stat">
          <span className="preview-value">{sizing.replicationFactor}</span>
          <span className="preview-label">replication factor</span>
        </div>
        {sizing.totalVcpu != null && (
          <div className="preview-stat">
            <span className="preview-value">{sizing.totalVcpu}</span>
            <span className="preview-label">total vCPU</span>
          </div>
        )}
      </div>

      {sizing.tasksPerSecond != null && (
        <p className="preview-note">
          Sized for {sizing.tasksPerSecond.toLocaleString()} tasks per second
          {calibration && ` using the ${calibration.label.toLowerCase()} calibration — ${calibration.note}`}
        </p>
      )}

      {(sizing.notes || []).map((note, i) => (
        <p key={i} className="preview-note">{note}</p>
      ))}

      <p className="preview-caveat">
        A starting point, not a guarantee. Real throughput depends on your process model,
        payload size and disk latency. Camunda recommends sizing for roughly 20x average
        load and validating with a load test before go-live. Partition count cannot be
        changed by editing values.yaml after install.
      </p>
    </div>
  )
}

// ─── Multi-region Preview ──────────────────────────────────────────────────────
//
// The contact point list is the part of a dual-region install that is most
// tedious to write by hand and hardest to spot as wrong, so show it in full.

function MultiregionPreview({ answers }) {
  // Same helper transform.js uses, so the preview cannot drift from the output.
  const clusterSize = effectiveClusterSize(answers)
  const contactPoints = buildInitialContactPoints(answers, clusterSize)

  if (contactPoints.length === 0) return null

  const regions = multiregionRegions(answers)

  return (
    <div className="preview-panel">
      <div className="preview-header">Generated initial contact points</div>
      <p className="preview-note">
        {clusterSize} brokers across {regions} regions — {clusterSize / regions} per region.
        The chart cannot compute this list itself because it has no way to know the other
        region&apos;s namespace, so it is passed as CAMUNDA_CLUSTER_INITIALCONTACTPOINTS.
      </p>
      <pre className="preview-code">{contactPoints.join("\n")}</pre>
      <p className="preview-caveat">
        Generate this file once per region, changing only the region ID. Every other value
        must be identical across regions.
      </p>
    </div>
  )
}

// ─── Chart Version Selector ────────────────────────────────────────────────────
//
// Camunda supports several minor versions at once and their charts differ, so
// the target release is a choice the user makes rather than a property of the
// build. Everything downstream — which fields render, which are required, and
// which paths get written — follows from it.

function VersionSelector({ current, onChange }) {
  return (
    <div className="theme-selector" title="Camunda release this file targets">
      {SUPPORTED_VERSIONS.map((chart) => (
        <button
          key={chart.key}
          className={`theme-btn ${current === chart.key ? "active" : ""}`}
          onClick={() => onChange(chart.key)}
        >
          {chart.appVersion}
        </button>
      ))}
    </div>
  )
}

// ─── Theme Selector ────────────────────────────────────────────────────────────
const THEMES = [
  { id: "dark",    label: "Dark",    icon: "◑" },
  { id: "light",   label: "Light",   icon: "○" },
  { id: "camunda", label: "Camunda", icon: "◆" },
]

function ThemeSelector({ current, onChange }) {
  return (
    <div className="theme-selector">
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          className={`theme-btn ${current === theme.id ? "active" : ""}`}
          onClick={() => onChange(theme.id)}
          title={theme.label}
        >
          {theme.icon} {theme.label}
        </button>
      ))}
    </div>
  )
}

// ─── Theme persistence ─────────────────────────────────────────────────────────
//
// localStorage is unavailable in more situations than it looks: a browser with
// site data blocked, some private-browsing modes, and any non-browser renderer.
// Reading it unguarded throws before the app paints anything, so both accesses
// are wrapped and the theme simply falls back to the default.

const THEME_STORAGE_KEY = "helm-theme"

function readStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) || "dark"
  } catch {
    return "dark"
  }
}

function storeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Preference is not persisted; the app still works for this session.
  }
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [answers, setAnswers] = useState({ products: [], chartVersion: DEFAULT_VERSION })
  const [yamlOutput, setYamlOutput] = useState("")
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState([])
  const [importReport, setImportReport] = useState(null)
  const fileInputRef = useRef(null)

  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    storeTheme(theme)
  }, [theme])

  const handleProductToggle = (productId) => {
    setAnswers((prev) => {
      const products = prev.products.includes(productId)
        ? prev.products.filter((p) => p !== productId)
        : [...prev.products, productId]
      return { ...prev, products }
    })
  }

  const handleFieldChange = (fieldId, value) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }))
  }

  const visibleSections = computeVisibleSections(answers)
  const chart = getChart(selectedVersion(answers))

  const validate = () => {
    const errs = []

    for (const section of visibleSections) {
      for (const field of section.fields) {
        // A field the user cannot see cannot be required of them.
        if (!fieldApplies(field, answers)) continue

        if (field.type === "env_vars") {
          const rows = answers[field.id] || []
          rows.forEach((row, i) => {
            if (!row.name || !row.value) {
              errs.push(`${section.title} → Environment variable row ${i + 1} must have both a name and value`)
            }
          })
          continue
        }

        if (field.type === "string_list") {
          const items = (answers[field.id] || []).filter((item) => (item || "").trim())
          if (field.required && items.length === 0) {
            errs.push(`${section.title} → ${field.label} needs at least one entry`)
          }
          continue
        }

        if (field.required && !answers[field.id]) {
          errs.push(`${section.title} → ${field.label} is required`)
        }
      }
    }

    // Rules the chart enforces at template time. Catching them here turns a
    // failed `helm install` into a message the user can act on.
    for (const constraint of violatedConstraints(answers)) {
      errs.push(constraint.message)
    }

    return errs
  }

  const handleGenerate = () => {
    if (answers.products.length === 0) {
      setErrors(["Please select at least one product"])
      return
    }
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])
    const helmValues = transformAnswers(answers)
    setYamlOutput(dumpValues(helmValues))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([yamlOutput], { type: "text/yaml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "values.yaml"
    a.click()
    URL.revokeObjectURL(url)
  }

  // Switching release re-evaluates every showIf and drops fields the new chart
  // does not have, so any output generated for the previous one is discarded.
  const handleVersionChange = (versionKey) => {
    setAnswers((prev) => ({ ...prev, chartVersion: versionKey }))
    setYamlOutput("")
    setErrors([])
  }

  const handleReset = () => {
    setAnswers({ products: [], chartVersion: selectedVersion(answers) })
    setYamlOutput("")
    setErrors([])
    setImportReport(null)
  }

  // Load an existing values.yaml back into the form so it can be edited and
  // regenerated, rather than rebuilt from memory.
  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Allow re-selecting the same file after a failed parse.
    event.target.value = ""

    try {
      const parsed = loadValues(await file.text())
      const { answers: imported, unmapped, warnings } = importValues(parsed)

      // A values.yaml carries no marker of the release it was written for, so
      // the current selection is kept rather than silently reset to the newest.
      setAnswers({ ...imported, chartVersion: selectedVersion(answers) })
      setYamlOutput("")
      setErrors([])
      setImportReport({ fileName: file.name, unmapped, warnings })
    } catch (error) {
      setImportReport({ fileName: file.name, unmapped: [], warnings: [], error: error.message })
    }
  }

  return (
    <div className="app-container">

      <header className="header">
        <div className="header-left">
          {theme === "dark" && (
            <div className="traffic-lights">
              <div className="traffic-light" style={{ backgroundColor: "#ff5f57" }} />
              <div className="traffic-light" style={{ backgroundColor: "#febc2e" }} />
              <div className="traffic-light" style={{ backgroundColor: "#28c840" }} />
            </div>
          )}
          <span className="header-title">Camunda Helm Values Generator</span>
        </div>
        <div className="header-right">
          <VersionSelector current={selectedVersion(answers)} onChange={handleVersionChange} />
          <ThemeSelector current={theme} onChange={setTheme} />
          <input
            type="file"
            accept=".yaml,.yml"
            ref={fileInputRef}
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button className="btn-reset" onClick={() => fileInputRef.current?.click()}>
            Import values.yaml
          </button>
          <button className="btn-reset" onClick={handleReset}>Reset</button>
        </div>
      </header>

      <main className="main-content">

        {/* Product Selection */}
        <div className="card">
          <div className="card-header">
            <div className="card-accent-bar pink" />
            <h2 className="card-title">Select Products</h2>
          </div>
          <div className="card-body">
            <div className="product-grid">
              {displayConfig.products.map((product) => {
                const selected = answers.products.includes(product.id)
                return (
                  <div
                    key={product.id}
                    className={`product-item ${selected ? "selected" : ""}`}
                    onClick={() => handleProductToggle(product.id)}
                  >
                    <div className="product-checkbox">
                      {selected && (
                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="product-label">{product.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Import report */}
        {importReport && (
          <div className={importReport.error ? "error-box" : "import-box"}>
            {importReport.error ? (
              <>
                <p className="error-title">Could not read {importReport.fileName}</p>
                <p className="error-item">{importReport.error}</p>
              </>
            ) : (
              <>
                <p className="import-title">Loaded {importReport.fileName}</p>
                {importReport.warnings.map((warning, i) => (
                  <p key={i} className="error-item">→ {warning}</p>
                ))}
                {importReport.unmapped.length > 0 && (
                  <>
                    <p className="import-note">
                      {importReport.unmapped.length} setting(s) in that file are not covered by this
                      form. They will be dropped if you regenerate — copy them across by hand:
                    </p>
                    <pre className="preview-code">{importReport.unmapped.join("\n")}</pre>
                  </>
                )}
                {importReport.unmapped.length === 0 && importReport.warnings.length === 0 && (
                  <p className="import-note">Every setting in that file is represented in the form.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Dynamic Sections */}
        {visibleSections.map((section) => (
          <div key={section.id}>
            <Section
              section={section}
              answers={answers}
              onFieldChange={handleFieldChange}
            />
            {section.id === "sizing" && <SizingPreview answers={answers} />}
            {section.id === "multiRegionConfig" && <MultiregionPreview answers={answers} />}
          </div>
        ))}

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div className="error-box">
            <p className="error-title">Fix these before generating</p>
            {errors.map((err, i) => (
              <p key={i} className="error-item">→ {err}</p>
            ))}
          </div>
        )}

        {/* Generate Button */}
        <button className="btn-generate" onClick={handleGenerate}>
          Generate values.yaml
        </button>

        {/* YAML Output */}
        {yamlOutput && (
          <div className="yaml-output">
            <div className="yaml-header">
              <div className="yaml-header-left">
                <div className="card-accent-bar success" />
                <h2 className="card-title">Generated values.yaml</h2>
              </div>
              <div className="yaml-header-right">
                <button className={`btn-copy ${copied ? "copied" : ""}`} onClick={handleCopy}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button className="btn-copy" onClick={handleDownload}>
                  Download
                </button>
              </div>
            </div>
            <pre className="yaml-pre">{yamlOutput}</pre>
          </div>
        )}

        <footer className="app-footer">
          Generated for {chart.chart} chart {chart.version} (Camunda {chart.appVersion}).
          {" "}Install with{" "}
          <code>helm install camunda camunda/{chart.chart} --version {chart.version} -f values.yaml</code>
        </footer>

      </main>
    </div>
  )
}
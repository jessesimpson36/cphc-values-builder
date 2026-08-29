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
 *   ├── Validation errors
 *   ├── Generate button
 *   └── YAML output
 */

import { useState, useEffect, useRef } from "react"
import { displayConfig } from "./displayConfig"
import { transformAnswers } from "./transform"
import yaml from "js-yaml"
import schema from "./schema.json"

// ─── Build a path → description lookup from schema.json ───────────────────────
const schemaDescriptions = Object.fromEntries(
  schema.map((field) => [field.path, field.description])
)

// ─── Tooltip icon ──────────────────────────────────────────────────────────────
function Tooltip({ path }) {
  const description = path ? schemaDescriptions[path] : null
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

// ─── Field ─────────────────────────────────────────────────────────────────────
function Field({ field, value, onChange }) {

  if (field.type === "env_vars") {
    return <EnvVarsEditor field={field} value={value} onChange={onChange} />
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
        {section.fields.map((field) => (
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

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [answers, setAnswers] = useState({ products: [] })
  const [yamlOutput, setYamlOutput] = useState("")
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState([])

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("helm-theme") || "dark"
  })

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("helm-theme", theme)
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

  const visibleSections = displayConfig.sections.filter((s) => s.showIf(answers))

  const validate = () => {
    const errs = []
    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (field.type !== "env_vars" && field.required && !answers[field.id]) {
          errs.push(`${section.title} → ${field.label} is required`)
        }
        if (field.type === "env_vars") {
          const rows = answers[field.id] || []
          rows.forEach((row, i) => {
            if (!row.name || !row.value) {
              errs.push(`${section.title} → Environment variable row ${i + 1} must have both a name and value`)
            }
          })
        }
      }
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
    setYamlOutput(yaml.dump(helmValues, { indent: 2, lineWidth: -1 }))
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

  const handleReset = () => {
    setAnswers({ products: [] })
    setYamlOutput("")
    setErrors([])
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
          <ThemeSelector current={theme} onChange={setTheme} />
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

        {/* Dynamic Sections */}
        {visibleSections.map((section) => (
          <Section
            key={section.id}
            section={section}
            answers={answers}
            onFieldChange={handleFieldChange}
          />
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

      </main>
    </div>
  )
}
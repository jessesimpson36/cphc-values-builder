/**
 * parseValues.js - YAML Schema Extractor
 *
 * Reads the official Camunda Helm chart values.yaml, extracts every
 * configurable field and its ## @param description, then writes a flat
 * schema.json that the React UI consumes at runtime.
 *
 * Run with:  npm run parse
 *
 * Input:   public/values.yaml
 * Output:  src/schema.json
 *
 * Data flow:
 *
 *   values.yaml (raw text + YAML structure)
 *        |
 *        ├── js-yaml parses structure 
 *        └── comment parser           
 *             |
 *             └── combined + typed
 *                  |
 *                  └── schema.json  ← consumed by the React UI
 */


import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

// Resolve __dirname in ESM (not available natively unlike CommonJS)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Read source file ─────────────────────────────────────────────────────────

const rawYaml = fs.readFileSync(
  path.join(__dirname, '../public/values.yaml'),
  'utf8'
)

process.stdout.write(`[parse] Read values.yaml - ${rawYaml.length.toLocaleString()} characters\n`)

// Parse the YAML into a JavaScript object so we can traverse its structure
const parsedYaml = yaml.load(rawYaml)

process.stdout.write(`[parse] YAML parsed - top-level keys: ${Object.keys(parsedYaml).join(', ')}\n`)


// ─── Object Flattening ────────────────────────────────────────────────────────
//
// The parsed YAML is a deeply nested object. We flatten it into a list of
// dot-notation paths so every field can be referenced by a single string
// e.g. { global: { elasticsearch: { auth: { username: "" } } } }
// becomes  "global.elasticsearch.auth.username"
//
// This makes it trivial to look up any field, map user inputs to YAML paths,
// and reconstruct the correct nested structure in the output.

function flattenObject(obj, parentPath = '') {
  const result = []

  for (const key of Object.keys(obj)) {
    // Build the full path for this key
    const currentPath = parentPath ? `${parentPath}.${key}` : key
    const value = obj[key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // If the value is an object, go deeper
      const nested = flattenObject(value, currentPath)
      result.push(...nested)
    } else {
      // If the value is a primitive (string, number, boolean) or array, save it
      result.push({
        path: currentPath,
        default: value
      })
    }
  }

  return result
}

const flatFields = flattenObject(parsedYaml)

process.stdout.write(`[parse] Flattened - ${flatFields.length} fields extracted\n`)


// ─── Comment Parser ───────────────────────────────────────────────────────────
//
// The values.yaml file documents each field with a structured comment directly
// above it, following the Bitnami convention:
//
//   ## @param global.elasticsearch.auth.username the username for external elasticsearch
//
// We parse these from the raw text (not the parsed YAML, since comments are
// stripped during YAML parsing) and build a path → description map.
// The path in the comment is used as the key so we can join it with the
// flattened fields in the next step.

function parseComments(rawText) {
  const result = {}
  const lines = rawText.split('\n')

  for (const line of lines) {
    if (line.includes('## @param')) {
      // Strip the ## @param prefix, leaving "<path> <description>"
      const content = line.replace(/.*##\s*@param\s+/, '').trim()

      // First word is the path, everything after is the description
      // (descriptions can contain spaces, URLs, punctuation)
      const spaceIndex = content.indexOf(' ')

      if (spaceIndex !== -1) {
        const path = content.substring(0, spaceIndex)
        const description = content.substring(spaceIndex + 1).trim()
        result[path] = description
      }
    }
  }

  return result
}

const comments = parseComments(rawYaml)

process.stdout.write(`[parse] Comments parsed - ${Object.keys(comments).length} @param descriptions found\n`)


// ─── Combine Fields and Comments ──────────────────────────────────────────────
//
// Both lists use the dot-notation path as a common key, so combining them is
// a straightforward map. Fields without a matching comment get an empty string.
// We also infer a type from the default value so the UI can render the
// appropriate input (e.g. checkboxes for booleans, text inputs for strings).

function combineFieldsAndComments(flatFields, comments) {
  return flatFields.map(field => {
    return {
      path: field.path,
      default: field.default,
      type: Array.isArray(field.default)
        ? 'array'
        : typeof field.default,
      description: comments[field.path] || ''
    }
  })
}

const schema = combineFieldsAndComments(flatFields, comments)

process.stdout.write(`[parse] Schema built - ${schema.length} entries total\n`)


// ─── Write Output ─────────────────────────────────────────────────────────────
//
// schema.json is the single file the React UI imports. It is always generated
// by this script - never edited manually. Commit it alongside values.yaml
// so the deployed app stays in sync with the chart version.

const outputPath = path.join(__dirname, '../src/schema.json')

fs.writeFileSync(
  outputPath,
  JSON.stringify(schema, null, 2)
)

process.stdout.write(`[parse] Done - schema.json written to src/schema.json (${fs.statSync(outputPath).size.toLocaleString()} bytes)\n`)
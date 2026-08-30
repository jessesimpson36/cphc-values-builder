/**
 * yaml.js — YAML serialisation
 *
 * One place that owns how this tool reads and writes YAML.
 *
 * The dump options must be identical everywhere: the app, the test fixtures and
 * the golden files all have to agree, or a golden file diff shows a formatting
 * change nobody made. They were duplicated across four call sites before.
 *
 * js-yaml 5 dropped the default export in favour of named exports, so this
 * module is also the single import to update on a future major.
 */

import { dump, load } from 'js-yaml'

// lineWidth: -1 disables line wrapping. Helm values contain long strings —
// notably the multi-region contact point list — and a wrapped line is harder to
// read and to diff, though both forms parse identically.
const DUMP_OPTIONS = { indent: 2, lineWidth: -1 }

export function dumpValues(values) {
  return dump(values, DUMP_OPTIONS)
}

export function loadValues(text) {
  return load(text)
}

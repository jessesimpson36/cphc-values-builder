/**
 * objectPaths.js — Flatten a nested object into dot-notation leaf paths
 *
 * The same traversal is needed by importValues.js (what does this file set?),
 * compareVersions.js (which of those paths exist in another chart?) and
 * scripts/validatePaths.js (what does transform.js actually emit?). One
 * implementation, shared by the browser and by build-time scripts.
 */

export function flattenLeafPaths(obj, parentPath = '') {
  const result = []

  for (const [key, value] of Object.entries(obj || {})) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenLeafPaths(value, currentPath))
    } else {
      result.push(currentPath)
    }
  }

  return result
}

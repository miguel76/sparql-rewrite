/**
 * utils.js
 *
 * Small general-purpose utilities used across the rewrite pipeline.
 */

/**
 * assertNoPaths(query, msg)
 *
 * Walks a parsed SPARQL query structure and throws an error if any
 * `path` expressions are present. Useful to enforce that certain
 * transformations are only run on path-free queries.
 */
export function assertNoPaths(query, msg = "Paths not allowed here.") {
    if (typeof query !== 'object' || query === null) {
        return;
    }
    if ('type' in query && query.type === 'path') {
        throw new Error(msg);
    }
    if (Array.isArray(query)) {
        query.forEach((q) => assertNoPaths(q));
        return;
    }
    Object.entries(query).forEach(([k, v]) => [k, assertNoPaths(v)]);
}

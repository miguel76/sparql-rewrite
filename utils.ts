import type * as SparqlJs from 'sparqljs';

export function assertNoPaths(query: SparqlJs.Query | SparqlJs.Pattern | any, msg = "Paths not allowed here.") {
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

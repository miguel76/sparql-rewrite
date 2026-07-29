import type * as SparqlJs from 'sparqljs';
import visit from "./visitQuery.js";

export default function getOutputVariables(query: SparqlJs.Query | SparqlJs.Pattern | SparqlJs.Pattern[]): string[] {
    return visit(query, {
        visitTerm: (term: any) => {
            if (term.termType === 'Variable') {
                return [term.value];
            }
            return [];
        },
        postVisitPattern: (pattern: any) => {
            if ('patterns' in pattern) {
                return [...new Set(pattern.patterns.flat())];
            }
            if (pattern.type === 'bgp') {
                const tripleVars = pattern.triples.flatMap(
                    ({subject, predicate, object}: any) => ([subject, predicate, object])).flat();
                return [...new Set(tripleVars)];
            }
            if (pattern.type === 'values') {
                return [...new Set(pattern.values.flatMap(
                    (binding: any) => Object.keys(binding).map((v: string) => v.slice(1))))];
            }
            if (pattern.type === 'bind') {
                return pattern.variable;
            }
            return [];
        },
        postVisitQuery: (query: any) => {
            if ('variables' in query) {
                if (query.variables.length === 1 && Object.keys(query.variables[0]).length === 0) {
                    return  [...new Set(query.where.flat())];
                }
                return query.variables.map((varExpr: any) =>
                    ('termType' in varExpr ? varExpr : varExpr.variable).value);
            } 
            return [];
        }
    });
}

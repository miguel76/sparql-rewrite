import visit, { COLLAPSED_FALSE, COLLAPSED_TRUE } from "./visitQuery.js";

export default function getOuptutVariables(query, rules, exposeSource = true) {
    return visit(query, {
        visitTerm: term => {
            if (term.termType === 'Variable') {
                return [term.value];
            }
            return [];
        },
        postVisitPattern: pattern => {
            if ('patterns' in pattern) {
                return [...new Set(pattern.patterns.flat())];
            }
            if (pattern.type === 'bgp') {
                const tripleVars = pattern.triples.flatMap(
                    ({subject, predicate, object}) => ([subject, predicate, object])).flat();
                return [...new Set(tripleVars)];
            }
            if (pattern.type === 'values') {
                return [...new Set(pattern.values.flatMap(
                    binding => Object.keys(binding).map(v => v.slice(1))))];
            }
            if (pattern.type === 'bind') {
                return pattern.variable;
            }
            return [];
        },
        postVisitQuery: query => {
            if ('variables' in query) {
                if (query.variables.length === 1 && Object.keys(query.variables[0]).length === 0) {
                    return  [...new Set(query.where.flat())];
                }
                return query.variables.map(varExpr =>
                    ('termType' in varExpr ? varExpr : varExpr.variable).value);
            } 
            return [];
        }
    });
}
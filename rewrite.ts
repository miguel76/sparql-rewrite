import type * as SparqlJs from 'sparqljs';
import visit from "./visitQuery.js";
import tripleMatch from "./match.js";
import replaceVars from "./replaceVars.js";
import getOutputVariables from "./getOutputVariables.js";

export default function queryRewrite(query: SparqlJs.Query, rules: SparqlJs.ConstructQuery[]): SparqlJs.Query {
    let subqueryCounter = 0;
    return visit(query, {
        postVisitPattern: pattern => {
            if (pattern.type === 'bgp') {
                let remainingBgpTriples: SparqlJs.Triple[] = [];
                let newPatterns: SparqlJs.Pattern[] = [];
                for (const triplePattern of pattern.triples) {
                    let matchFound = false;
                    for (const rule of rules) {
                        const ruleHead = rule.template[0];
                        const matchResult = tripleMatch(triplePattern, ruleHead);
                        if (matchResult !== null) {
                            matchFound = true;
                            newPatterns.push(...replaceVars(rule.where, matchResult.match, `_q${subqueryCounter++}_`, getOutputVariables(newPatterns)));
                            newPatterns.push(...matchResult.extraClauses);
                            break;
                        }
                    }
                    if (!matchFound) {
                        return {type: 'values', values: []}; // COLLAPSED_FALSE
                    }
                }
                if (remainingBgpTriples.length > 0) {
                    newPatterns.push({
                        type: 'bgp',
                        triples: remainingBgpTriples
                    });
                }
                if (newPatterns.length === 0) {
                    return {type: 'values', values: [{}]}; // COLLAPSED_TRUE
                }
                if (newPatterns.length === 1) {
                    return newPatterns[0];
                }
                return {
                    type: 'group',
                    patterns: newPatterns
                }
            }
            return pattern;
        },
        preVisitQuery: query => {
            if ('variables' in query &&
                query.variables.length === 1 &&
                Object.keys(query.variables[0]).length === 0
            ) {
                return {
                    ...query,
                    projectedVariables: getOutputVariables(query)
                }
            }
            return {
                ...query,
                projectedVariables: []
            };
        },
        postVisitQuery: query => {
            if ('variables' in query &&
                query.variables.length === 1 &&
                Object.keys(query.variables[0]).length === 0
            ) {
                const {projectedVariables, ...justQuery} = query;
                const newProjectedVariables = getOutputVariables(justQuery);
                if (JSON.stringify(newProjectedVariables) != JSON.stringify(projectedVariables)) {
                    return {
                        ...justQuery,
                        variables: projectedVariables.map((varname: any) => ({
                            termType: 'Variable',
                            value: varname
                        }))
                    }
                }
                return justQuery;
            }
            return query;
        }
    });
}

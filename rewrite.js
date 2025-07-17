import visit, { COLLAPSED_FALSE, COLLAPSED_TRUE } from "./visitQuery.js";
import tripleMatch from "./match.js";
import replaceVars from "./replaceVars.js";
import getOuptutVariables from "./getOutputVariables.js";

export default function queryRewrite(query, rules, exposeSource = true) {
    let subqueryCounter = 0;
    return visit(query, {
        postVisitPattern: pattern => {
            if (pattern.type === 'bgp') {
                let remainingBgpTriples = [];
                let newPatterns = [];
                for (const triplePattern of pattern.triples) {
                    let matchFound = false;
                    for (const rule of rules) {
                        const ruleHead = rule.template[0];
                        const matchResult = tripleMatch(triplePattern, ruleHead);
                        if (matchResult !== null) {
                            matchFound = true;
                            newPatterns.push(replaceVars(rule.where, matchResult.match, `_q${subqueryCounter++}_`));
                            newPatterns.push(...matchResult.extraClauses);
                            break;
                        }
                    }
                    if (!matchFound) {
                        if (exposeSource) {
                            remainingBgpTriples.push(triplePattern);
                        } else {
                            return COLLAPSED_FALSE;
                        }
                    }
                }
                if (remainingBgpTriples.length > 0) {
                    newPatterns.push({
                        type: 'bgp',
                        triples: remainingBgpTriples
                    });
                }
                if (newPatterns.length === 0) {
                    return COLLAPSED_TRUE;
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
                    projectedVariables: getOuptutVariables(query)
                }
            }
            return query;
        },
        postVisitQuery: query => {
            if ('variables' in query &&
                query.variables.length === 1 &&
                Object.keys(query.variables[0]).length === 0
            ) {
                const {projectedVariables, ...justQuery} = query;
                const newProjectedVariables = getOuptutVariables(justQuery);
                if (JSON.stringify(newProjectedVariables) != JSON.stringify(projectedVariables)) {
                    return {
                        ...justQuery,
                        variables: projectedVariables.map(varname => ({
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
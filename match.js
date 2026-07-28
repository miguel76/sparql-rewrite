/**
 * match.js
 *
 * Utilities for comparing and matching triple patterns.
 *
 * - `equalTerms(termA, termB)` performs a structural equality check on two
 *   term objects by comparing their JSON representations.
 *
 * - `tripleMatch(specificTriplePattern, genericTriplePattern)` attempts to
 *   match a concrete (specific) triple pattern against a generic template
 *   that may contain variables. When successful it returns an object
 *   `{ match, extraClauses }` where `match` maps variable names to bound
 *   terms and `extraClauses` is an array of additional patterns (VALUES or
 *   FILTER) required to enforce equalities discovered during matching. If
 *   the patterns are incompatible it returns `null`.
 */

export function equalTerms(termA, termB) {
    return JSON.stringify(termA) === JSON.stringify(termB)
}

export default function tripleMatch(specificTriplePattern, genericTriplePattern) {
    const specificTerms = [specificTriplePattern.subject, specificTriplePattern.predicate, specificTriplePattern.object];
    const genericTerms = [genericTriplePattern.subject, genericTriplePattern.predicate, genericTriplePattern.object];
    let match = {};
    let extraClauses = [];
    for (let i = 0; i < 3; i++) {
        if (genericTerms[i].termType === 'Variable') {
            const varName = genericTerms[i].value;
            if (varName in match) {
                if (match[varName].termType === 'Variable' || specificTerms[i].termType === 'Variable') {
                    extraClauses.push({
                        type: 'filter',
                        expression: {
                            type: 'operation',
                            operator: '=',
                            args: [match[varName], specificTerms[i]]
                        }
                    });
                } else {
                    if (!equalTerms(match[varName], specificTerms[i])) {
                        return null;
                    }
                }
            } else {
                match[varName] = specificTerms[i];
            }
        } else {
            if (specificTerms[i].termType === 'Variable') {
                return null;
            } else {
                if (!equalTerms(genericTerms[i], specificTerms[i])) {
                    return null;
                }
            }
        }
    }
    return {match, extraClauses};
}

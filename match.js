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
                extraClauses.push({
                    type: 'values',
                    values: [object.fromEntries([[`?${specificTerms[i].value}`,genericTerms[i]]])]
                });
            } else {
                if (!equalTerms(genericTerms[i], specificTerms[i])) {
                    return null;
                }
            }
        }
    }
    return {match, extraClauses};
}

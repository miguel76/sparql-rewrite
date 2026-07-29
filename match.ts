import type * as SparqlJs from 'sparqljs';

export function equalTerms(termA: SparqlJs.Term, termB: SparqlJs.Term): boolean {
    return JSON.stringify(termA) === JSON.stringify(termB)
}

export default function tripleMatch(specificTriplePattern: SparqlJs.Triple, genericTriplePattern: SparqlJs.Triple): {match: Record<string, SparqlJs.Term>, extraClauses: SparqlJs.Pattern[]} | null {
    const specificTerms: SparqlJs.Term[] = [specificTriplePattern.subject, specificTriplePattern.predicate, specificTriplePattern.object];
    const genericTerms: SparqlJs.Term[] = [genericTriplePattern.subject, genericTriplePattern.predicate, genericTriplePattern.object];
    let match: Record<string, SparqlJs.Term> = {};
    let extraClauses: SparqlJs.Pattern[] = [];
    for (let i = 0; i < 3; i++) {
        const g = genericTerms[i];
        const s = specificTerms[i];
        if (g.termType === 'Variable') {
            const varName = g.value;
            if (varName in match) {
                if (match[varName].termType === 'Variable' || s.termType === 'Variable') {
                    extraClauses.push({
                        type: 'filter',
                        expression: {
                            type: 'operation',
                            operator: '=',
                            args: [match[varName], s]
                        }
                    });
                } else {
                    if (!equalTerms(match[varName], s)) {
                        return null;
                    }
                }
            } else {
                match[varName] = s;
            }
        } else {
            if (s.termType === 'Variable') {
                return null;
            } else {
                if (!equalTerms(g, s)) {
                    return null;
                }
            }
        }
    }
    return {match, extraClauses};
}

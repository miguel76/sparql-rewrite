export const COLLAPSED_TRUE = {type: 'dee'}; // TABLE_DEE
export const COLLAPSED_FALSE = {type: 'dum'}; // TABLE_DUM

export function isCollapsedFalse(query) {
    return typeof query === 'object' && 'type' in query && query.type === 'dum';
}

export function isCollapsedTrue(query) {
    return typeof query === 'object' && 'type' in query && query.type === 'dee';
}

export function convertCollapsed(patterns) {
    if (patterns.length === 1) {
        if (isCollapsedTrue(patterns[0])) {
            return {
                type: 'values',
                values: [{}]
            }
        }
        if (isCollapsedFalse(patterns[0])) {
            return {
                type: 'values',
                values: []
            }
        }
    }
    return patterns;
}

export default function visitQuery(query, {
    preVisitQuery = (x) => (x),
    postVisitQuery = (x) => (x), 
    preVisitPattern = (x) => (x),
    postVisitPattern = (x) => (x), 
    visitTerm = (x) => (x)
} = {}) {
    function v(query) {
        if (typeof query !== 'object' || query === null) {
            return query;
        }
        if (Array.isArray(query)) {
            let newSubQueries = [];
            for (const subQuery of query) {
                const postSubQuery = v(subQuery);
                if (!isCollapsedTrue(postSubQuery)) {
                    if (isCollapsedFalse(postSubQuery)) {
                        return [COLLAPSED_FALSE]
                    }
                    newSubQueries.push(postSubQuery);
                }
            }
            if (newSubQueries.length === 0) {
                return [COLLAPSED_TRUE];
            }
            return newSubQueries;
        }
        if ('termType' in query) {
            return visitTerm(query)
        }
        if ('queryType' in query) {
            query = preVisitQuery(query);
            const where = v(query.where);
            return postVisitQuery({...query, where});
        }
        if ('type' in query) {
            query = preVisitPattern(query);
            if (query.type === 'bgp') {
                query = {
                    type: 'bgp',
                    triples: query.triples.map(({subject, predicate, object}) => ({
                        subject: v(subject),
                        predicate: v(predicate),
                        object: v(object)
                    }))
                }
            } else if (query.type === 'union') {
                let newPatterns = [];
                let collapsedTrueFound = false;
                for (const pattern of query.patterns) {
                    const newPattern = v(pattern);
                    if (!isCollapsedFalse(newPattern)) {
                        if (isCollapsedTrue(newPattern)) {
                            collapsedTrueFound = true;
                        } else {
                            newPatterns.push(newPattern);
                        }
                    }
                }
                if (collapsedTrueFound) {
                    newPatterns.push(COLLAPSED_TRUE);
                }
                if (newPatterns.length === 0) {
                    query = COLLAPSED_FALSE;
                } else {
                    query = {
                        type: 'union',
                        patterns: newPatterns
                    }
                }
            } else if (query.type === 'optional') {
                let newPatterns = v(query.patterns);
                if (newPatterns.length === 1 && (isCollapsedTrue(newPatterns[0]) || isCollapsedFalse(newPatterns[0]))) {
                    query = COLLAPSED_TRUE;
                } else {
                    query = {
                        type: 'optional',
                        patterns: newPatterns
                    }
                }
            } else if (query.type === 'values') {
                query = {
                    type: 'values',
                    values: query.values.map(binding => Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, v(value)])))
                };
            } else {
                query = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, v(value)]));
            }
            return postVisitPattern(query);
        }
    }
    return v(query);
}

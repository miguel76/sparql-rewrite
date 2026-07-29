import type * as SparqlJs from 'sparqljs';

export const COLLAPSED_TRUE = {type: 'values', values: [{}]} as SparqlJs.Pattern; // TABLE_DEE
export const COLLAPSED_FALSE = {type: 'values', values: []} as SparqlJs.Pattern; // TABLE_DUM

export function isCollapsedFalse(query: SparqlJs.Pattern) {
    return typeof query === 'object' && 'type' in query && query.type === 'values' && query.values.length === 0;
}

export function isCollapsedTrue(query: SparqlJs.Pattern) {
    return typeof query === 'object' && 'type' in query && query.type === 'values' && query.values.length === 1 && Object.keys(query.values[0]).length === 0;
}

export type QueryComponent = SparqlJs.Query | SparqlJs.Pattern | SparqlJs.Term | (SparqlJs.Query | SparqlJs.Pattern | SparqlJs.Term)[];

export default function visitQuery<visitedType extends QueryComponent, ModifiedQuery extends SparqlJs.Query, ModifiedPattern extends SparqlJs.Pattern>(
    query: visitedType,
    visitors: {
        preVisitQuery?: ((x: SparqlJs.Query) => ModifiedQuery),
        postVisitQuery?: ((x: ModifiedQuery) => any), 
        preVisitPattern?: ((x: SparqlJs.Pattern) => ModifiedPattern),
        postVisitPattern?: ((x: ModifiedPattern) => any), 
        visitTerm?: ((x: SparqlJs.Term) => any)
    }
): any {
    const {
        preVisitQuery = (x => x),
        postVisitQuery = (x => x),
        preVisitPattern = (x => x),
        postVisitPattern = (x => x),
        visitTerm = (x => x)
    } = visitors;
    function v(query: any): any {
        if (typeof query !== 'object' || query === null) {
            return query;
        }
        if (Array.isArray(query)) {
            let newSubQueries: any[] = [];
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
            query = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, v(value)]));
            return postVisitQuery(query);
        }
        if ('type' in query) {
            query = preVisitPattern(query);
            if (query.type === 'bgp') {
                query = {
                    type: 'bgp',
                    triples: query.triples.map(({subject, predicate, object}: any) => ({
                        subject: v(subject),
                        predicate: v(predicate),
                        object: v(object)
                    }))
                }
            } else if (query.type === 'union') {
                let newPatterns: any[] = [];
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
                    values: query.values.map((binding: any) => Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, v(value)])))
                };
            } else {
                query = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, v(value)]));
            }
            return postVisitPattern(query);
        }
        return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, v(value)]));
    }
    return v(query);
}

import type * as SparqlJs from 'sparqljs';
import visitQuery, { COLLAPSED_FALSE } from './visitQuery.js';
import replaceVars from './replaceVars.js';
import { equalTerms } from './match.js';
import parseView, { AnnotatedConstructQuery, DEFAULT_VARS, ParsedView } from './parseView.js';

function freeRoles(templateTriple: SparqlJs.Triple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType === 'Variable'
    );
}

function boundRoles(templateTriple: SparqlJs.Triple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType !== 'Variable'
    );
}

function subsets([first, ...rest]: any[]): any[] {
    if (first === undefined)
        return [[]];
    const restSubsets = subsets(rest);
    return [...restSubsets, ...restSubsets.map(restSubset => [first, ...restSubset])];
}

function nonEmptySubsets(items: any[]) {
    return subsets(items).slice(1);
}

function replaceTemplate(query: SparqlJs.ConstructQuery, newTemplate: SparqlJs.Triple[]): SparqlJs.ConstructQuery {
    return visitQuery(query, {
        postVisitQuery: (query: SparqlJs.ConstructQuery) => {
            query.template = newTemplate
            return query;
        }
    });
}

function decomposeConstruct(construct: SparqlJs.ConstructQuery): SparqlJs.ConstructQuery[] {
    return construct.template.map((templateTriple: SparqlJs.Triple) => replaceVars(
        replaceTemplate(construct, [templateTriple]),
        Object.fromEntries(
            freeRoles(templateTriple).map((role: string) =>
                [templateTriple[role].value, DEFAULT_VARS[role]]
            )
        )
    ) );
}

function generalize(construct: SparqlJs.ConstructQuery): SparqlJs.ConstructQuery[] {
    return nonEmptySubsets(boundRoles(construct.template[0])).map((rolesToGeneralize: string[]) =>
        visitQuery(construct, {
            postVisitQuery: (construct: SparqlJs.ConstructQuery) => {
                if (rolesToGeneralize.length > 0) {
                    construct.where.push({
                        type: 'values',
                        values: [
                            Object.fromEntries(rolesToGeneralize.map((roleToGeneralize: string) =>
                                [`?${roleToGeneralize}`, construct.template[0][roleToGeneralize]]
                            ))
                        ]
                    });
                    rolesToGeneralize.forEach((roleToGeneralize: string) => {
                        construct.template[0][roleToGeneralize] = DEFAULT_VARS[roleToGeneralize];
                    });
                }
                return construct;
            }
        })
    );
}

function cospecialize(
    construct: AnnotatedConstructQuery,
    [otherConstruct, ...restOfOtherConstructs]: AnnotatedConstructQuery[]
) : SparqlJs.ConstructQuery[] {
    if (construct.uniqueTemplate || otherConstruct === undefined) {
        return [];
    }
    if (otherConstruct.uniqueTemplate) {
        return cospecialize(construct, restOfOtherConstructs);
    }
    let specializations: SparqlJs.ConstructQuery[] = [];
    const constructFreeRoles = freeRoles(construct.template[0]);
    const constructBoundRoles = boundRoles(construct.template[0]);
    const otherConstructFreeRoles = freeRoles(otherConstruct.template[0]);
    const otherConstructBoundRoles = boundRoles(otherConstruct.template[0]);
    if (
        constructBoundRoles.every((boundRole: string) =>
            otherConstructFreeRoles.indexOf(boundRole) >= 0 ||
            equalTerms(construct.template[0][boundRole], otherConstruct.template[0][boundRole]))
        && constructFreeRoles.some((freeRole: string) => otherConstructBoundRoles.indexOf(freeRole) >= 0)
    ) {
        const rolesToSpecialize = boundRoles(otherConstruct.template[0]).filter((role: any) => constructFreeRoles.indexOf(role) >= 0);
        specializations = nonEmptySubsets(rolesToSpecialize).map((rolesToSpecialize: string[]) =>
            visitQuery(construct, {
                postVisitQuery: (construct: SparqlJs.ConstructQuery) => {
                    rolesToSpecialize.forEach((roleToSpecialize: string) => {
                        construct.template[0][roleToSpecialize] = otherConstruct.template[0][roleToSpecialize];
                    });
                    construct.where = replaceVars(
                        construct.where,
                        Object.fromEntries(rolesToSpecialize.map((roleToSpecialize: string) =>
                            [roleToSpecialize, otherConstruct.template[0][roleToSpecialize]]
                        ))
                    );
                    return construct;
                }
            }) as SparqlJs.ConstructQuery
        );
        specializations = [
            ...specializations,
            ...specializations.flatMap(specializedConstruct => cospecialize(specializedConstruct, restOfOtherConstructs))
        ]
    }
    return [
        ...specializations,
        ...cospecialize(construct, restOfOtherConstructs)
    ];
}

function cospecializeAll([construct, ...otherConstructs]: AnnotatedConstructQuery[]): SparqlJs.ConstructQuery[] {
    if (construct === undefined) {
        return [];
    }
    return [
        ...cospecialize(construct, otherConstructs),
        ...cospecializeAll(otherConstructs)
    ];
}

function join(patterns: SparqlJs.Pattern[]): SparqlJs.Pattern {
    if (patterns.length === 0) {
        return COLLAPSED_FALSE;
    } else if (patterns.length === 1) {
        return patterns[0];
    }
    return {
        type: 'group',
        patterns
    };
}

function merge(constructs: SparqlJs.ConstructQuery[]): SparqlJs.ConstructQuery[] {
    let constructByTemplate: Record<string, SparqlJs.ConstructQuery[]> = {};
    for (const construct of constructs) {
        const templateTxt = JSON.stringify(construct.template[0]);
        if (templateTxt in constructByTemplate) {
            constructByTemplate[templateTxt].push(construct);
        } else {
            constructByTemplate[templateTxt] = [construct];
        }
    }
    return Object.entries(constructByTemplate).map(([templateTxt, templateConstructs]) => {
        if (templateConstructs.length === 1) {
            return templateConstructs[0];
        }
        return {
            queryType: 'CONSTRUCT',
            template: templateConstructs[0].template,
            where: [{
                type: 'union',
                patterns: templateConstructs.map(construct => join(construct.where))
            }],
            type: 'query',
            prefixes: Object.fromEntries(templateConstructs.flatMap(construct => Object.entries(construct.prefixes)))
        } as SparqlJs.ConstructQuery;
    })
}

function orderByDecreasingSpecificity(constructs: SparqlJs.ConstructQuery[]) {
    let constructByNumOfFreeVariables: SparqlJs.ConstructQuery[][] = [[], [], [], []];
    for (const construct of constructs) {
        const numOfFreeVariables = freeRoles(construct.template[0]).length;
        constructByNumOfFreeVariables[numOfFreeVariables].push(construct);
    }
    return constructByNumOfFreeVariables.flat();
}

export type Replacement = {
    subject?: SparqlJs.Term,
    predicate?: SparqlJs.Term,
    object?: SparqlJs.Term
};

// export type BoundRoles = {
//     subject?: SparqlJs.Term,
//     predicate?: SparqlJs.Term,
//     object?: SparqlJs.Term
// };

export type CompiledRule = {
    construct: SparqlJs.ConstructQuery,
    // bound: BoundRoles,
    replacement?: Replacement
};

export type CompiledViewForPredicate = {
    generic?: CompiledRule,
    byObject?: Record<string, CompiledRule>
};

export type CompiledViewForSubject = CompiledViewForPredicate & {
    byPredicate?: Record<string, CompiledViewForPredicate>
};

export type CompiledView = CompiledViewForSubject & {
    bySubject?: Record<string, CompiledViewForSubject>
};

function compileRule(construct: SparqlJs.ConstructQuery): CompiledRule {
    return {
        construct
    };
}

function createMapping(constructs: SparqlJs.ConstructQuery[]) {
    let mapping: CompiledView = {};

    function addCompiledRuleToPredicateMapping(predicateMapping: CompiledViewForPredicate, compiledRule: CompiledRule) {
        const object = compiledRule.construct.template[0].object;
        if (object.termType !== 'Variable') {
            if (!('byObject' in predicateMapping)) {
                predicateMapping.byObject = {};
            }
            predicateMapping.byObject[JSON.stringify(object)] = compiledRule;
        } else {
            predicateMapping.generic = compiledRule;
        }
    }

    function addCompiledRuleToSubjectMapping(subjectMapping: CompiledViewForSubject, compiledRule: CompiledRule) {
        const predicate: SparqlJs.Term = compiledRule.construct.template[0].predicate as SparqlJs.Term;
        if (predicate.termType !== 'Variable') {
            if (!('byPredicate' in subjectMapping)) {
                subjectMapping.byPredicate = {};
            }
            const predicateTermStr = JSON.stringify(predicate);
            if (!(predicateTermStr in subjectMapping.byPredicate)) {
                subjectMapping.byPredicate[predicateTermStr] = {};
            }
            addCompiledRuleToPredicateMapping(subjectMapping.byPredicate[predicateTermStr], compiledRule);
        } else {
            addCompiledRuleToPredicateMapping(subjectMapping, compiledRule);
        }
    }

    function addCompiledRuleToMapping(compiledRule: CompiledRule) {
        const subject = compiledRule.construct.template[0].subject;
        if (subject.termType !== 'Variable') {
            if (!('bySubject' in mapping)) {
                mapping.bySubject = {};
            }
            const subjectTermStr = JSON.stringify(subject);
            if (!(subjectTermStr in mapping.bySubject)) {
                mapping.bySubject[subjectTermStr] = {};
            }
            addCompiledRuleToSubjectMapping(mapping.bySubject[subjectTermStr], compiledRule);
        } else {
            addCompiledRuleToSubjectMapping(mapping, compiledRule);
        }
    }
    for (const construct of constructs) {
        addCompiledRuleToMapping(compileRule(construct));
    }
    return mapping;
}


export default function compileView(parsedView: ParsedView): CompiledView {
    const baseConstructs = parsedView.flatMap(decomposeConstruct);
    const specializedConstructs = cospecializeAll(baseConstructs);
    const generalizedConstructs = baseConstructs.flatMap(generalize);
    const constructs = merge([
        ...baseConstructs,
        ...specializedConstructs,
        ...generalizedConstructs
    ]);
    return createMapping(constructs);
}

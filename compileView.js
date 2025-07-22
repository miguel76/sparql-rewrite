// Parse a SPARQL query to a JSON object
import { Parser as SparqlParser } from 'sparqljs';
import visitQuery, { COLLAPSED_FALSE } from './visitQuery.js';
import replaceVars from './replaceVars.js';
import { equalTerms } from './match.js';

const DEFAULT_VARS = Object.fromEntries(['subject', 'predicate', 'object'].map(l => [l, {
    termType: 'Variable',
    value: l
}]));

function freeRoles(templateTriple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType === 'Variable'
    );
}

function boundRoles(templateTriple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType !== 'Variable'
    );
}

function subsets([ first, ...rest ]) {
    if (first === undefined)
        return [[]];
    const restSubsets = subsets(rest);
    return [...restSubsets, ...restSubsets.map(restSubset => [first, ...restSubset])];
}

function nonEmptySubsets(items) {
    return subsets(items).slice(1);
}

function decomposeConstruct(construct) {
    return construct.template.map(templateTriple => replaceVars(
        construct,
        Object.fromEntries(
            freeRoles(templateTriple).map(role => 
                [templateTriple[role].value, DEFAULT_VARS[role]]
            )
        )
    ));
}

function generalize(construct) {
    return nonEmptySubsets(boundRoles(construct.template[0])).map(rolesToGeneralize =>
        visitQuery(construct, {
            postVisitQuery: construct => {
                if (rolesToGeneralize.length > 0) {
                    construct.where.push({
                        type: 'values',
                        values: [
                            Object.fromEntries(rolesToGeneralize.map(roleToGeneralize =>
                                [`?${roleToGeneralize}`, construct.template[0][roleToGeneralize]]
                            ))
                        ]
                    });
                    rolesToGeneralize.forEach(roleToGeneralize => {
                        construct.template[0][roleToGeneralize] = DEFAULT_VARS[roleToGeneralize];
                    });
                }
                return construct;
            }
        })
    );
}

function cospecialize(construct, [otherConstruct, ...restOfOtherConstructs] ) {
    const constructFreeRoles = freeRoles(construct.template[0]);
    const constructBoundRoles = boundRoles(construct.template[0]);
    if (otherConstruct === undefined) {
        return [];
    }
    const otherConstructFreeRoles = freeRoles(otherConstruct.template[0]);
    const otherConstructBoundRoles = boundRoles(otherConstruct.template[0]);
    let specializations = [];
    if (
        constructBoundRoles.every(boundRole =>
            otherConstructFreeRoles.indexOf(boundRole) >= 0 ||
            equalTerms(construct.template[0][boundRole], otherConstruct.template[0][boundRole]))
        // && constructBoundRoles.some(boundRole => otherConstructFreeRoles.indexOf(boundRole) >= 0)
        && constructFreeRoles.some(freeRole => otherConstructBoundRoles.indexOf(freeRole) >= 0)
    ) {
        const rolesToSpecialize = boundRoles(otherConstruct.template[0]).filter(role => constructFreeRoles.indexOf(role) >= 0);
        specializations = nonEmptySubsets(rolesToSpecialize).map(rolesToSpecialize =>
            visitQuery(construct, {
                postVisitQuery: construct => {
                    rolesToSpecialize.forEach(roleToSpecialize => {
                        construct.template[0][roleToSpecialize] = otherConstruct.template[0][roleToSpecialize];
                    });
                    construct.where = replaceVars(
                        construct.where,
                        Object.fromEntries(rolesToSpecialize.map(roleToSpecialize =>
                            [roleToSpecialize, otherConstruct.template[0][roleToSpecialize]]
                        ))
                    );
                    return construct;
                }
            })
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

function cospecializeAll([construct, ...otherConstructs]) {
    if (construct === undefined) {
        return [];
    }
    return [
        ...cospecialize(construct, otherConstructs),
        ...cospecializeAll(otherConstructs)
    ];
}

function merge(constructs) {
    let constructByTemplate = {};
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
            where: {
                type: 'union',
                patterns: templateConstructs.map(construct => construct.where)
            },
            type: 'query',
            prefixes: Object.fromEntries(templateConstructs.flatMap(construct => Object.entries(construct.prefixes)))
        };
    })
}

function orderByDecreasingSpecificity(constructs) {
    let constructByNumOfFreeVariables = [[], [], [], []];
    for (const construct of constructs) {
        const numOfFreeVariables = freeRoles(construct.template[0]).length;
        constructByNumOfFreeVariables[numOfFreeVariables].push(construct);
    }
    return constructByNumOfFreeVariables.flat();
}

export default function compileView({
    commonPreamble = '',
    ruleSpecs = []
} = {}) {
    const parser = new SparqlParser();
    function ruleSpecToConstruct(rule) {
        let templateTxt;
        if ('template' in rule) {
            templateTxt = rule.template;
        } else if ('class' in rule) {
            templateTxt = `?${DEFAULT_VARS.subject.value} a ${rule.class}`;
        } else if ('property' in rule) {
            templateTxt = `?${DEFAULT_VARS.subject.value} ${rule.property} ?${DEFAULT_VARS.object.value}`;
        } else {
            templateTxt = `?${DEFAULT_VARS.subject.value} ?${DEFAULT_VARS.predicate.value} ?${DEFAULT_VARS.object.value}`;
        }

        let constructTxt;
        if ('construct' in rule) {
            constructTxt = rule.construct;
        } else {
            if ('pattern' in rule) {
                constructTxt = `CONSTRUCT {${templateTxt}} WHERE {${rule.pattern}}`;
            } else {
                constructTxt = `CONSTRUCT WHERE {${templateTxt}}`;
            }
        } 

        const construct = parser.parse(commonPreamble + ' ' + constructTxt);
        if ('exclude' in rule && rule.exclude) {
            construct.where = [COLLAPSED_FALSE];
        }
        return construct;
    }

    const baseConstructs = ruleSpecs.map(ruleSpecToConstruct).flatMap(decomposeConstruct);
    const specializedConstructs = cospecializeAll(baseConstructs);
    const generalizedConstructs = baseConstructs.flatMap(generalize);
    const constructs = merge([
        ...baseConstructs,
        ...specializedConstructs,
        ...generalizedConstructs
    ]);
    return orderByDecreasingSpecificity(constructs);
}

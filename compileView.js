import visitQuery, { COLLAPSED_FALSE } from './visitQuery.js';
import replaceVars from './replaceVars.js';
import { equalTerms } from './match.js';
import normalizeView, { DEFAULT_VARS } from './normalizeView.js';

function freeRoles(templateTriple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType === 'Variable'
    );
}

// Roles that are bound (not variables) in a template triple
function boundRoles(templateTriple) {
    return Object.keys(DEFAULT_VARS).filter(role =>
        templateTriple[role].termType !== 'Variable'
    );
}

function subsets([first, ...rest]) {
    if (first === undefined)
        return [[]];
    const restSubsets = subsets(rest);
    return [...restSubsets, ...restSubsets.map(restSubset => [first, ...restSubset])];
}

function nonEmptySubsets(items) {
    return subsets(items).slice(1);
}

function replaceTemplate(query, newTemplate) {
    return visitQuery(query, {
        postVisitQuery: pattern => {
            pattern.template = newTemplate
            return pattern;
        }
    });
}

function decomposeConstruct(construct) {
    // Split a CONSTRUCT with multiple template triples into a list of
    // single-triple CONSTRUCTs. For each template triple, replace the free
    // variable role names with the canonical `DEFAULT_VARS` so subsequent
    // comparisons and merging operate on a normalized form.
    return construct.template.map(templateTriple => replaceVars(
        replaceTemplate(construct, [templateTriple]),
        Object.fromEntries(
            freeRoles(templateTriple).map(role =>
                [templateTriple[role].value, DEFAULT_VARS[role]]
            )
        )
    ));
}

function generalize(construct) {
    // For each non-empty subset of bound roles produce a variant where those
    // roles are turned into variables and the original values are provided
    // via a `VALUES` block. This produces more generic forms of the
    // construct which can match when only partial information is present.
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

function cospecialize(construct, [otherConstruct, ...restOfOtherConstructs]) {
    // Co-specialization: if `construct` has roles that are free where
    // `otherConstruct` has bound roles (and vice-versa for compatibility),
    // produce specialized variants of `construct` by copying binding values
    // from `otherConstruct` into the free roles. Recursively propagate
    // specializations across the remaining constructs.
    if (construct.uniqueTemplate || otherConstruct === undefined) {
        return [];
    }
    if (otherConstruct.uniqueTemplate) {
        return cospecialize(construct, restOfOtherConstructs);
    }
    let specializations = [];
    const constructFreeRoles = freeRoles(construct.template[0]);
    const constructBoundRoles = boundRoles(construct.template[0]);
    const otherConstructFreeRoles = freeRoles(otherConstruct.template[0]);
    const otherConstructBoundRoles = boundRoles(otherConstruct.template[0]);
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
    rules,
    defaults = {},
    subViews = []
}) {
    const baseConstructs = normalizeView({ rules, defaults, subViews }).flatMap(decomposeConstruct);
    const specializedConstructs = cospecializeAll(baseConstructs);
    const generalizedConstructs = baseConstructs.flatMap(generalize);
    const constructs = merge([
        ...baseConstructs,
        ...specializedConstructs,
        ...generalizedConstructs
    ]);
    return orderByDecreasingSpecificity(constructs);
}

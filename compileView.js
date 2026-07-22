import { Parser as SparqlParser } from 'sparqljs';
import visitQuery, { COLLAPSED_FALSE } from './visitQuery.js';
import replaceVars from './replaceVars.js';
import { equalTerms } from './match.js';

/**
 * compileView.js
 *
 * This module compiles a flexible, user-provided "view specification" into
 * a strictly structured, ready-to-use list of parsed SPARQL `CONSTRUCT`
 * rules. The input (see `ruleSpecs` below) allows several shorthand forms for
 * expressing constructs (class, property, pattern, or explicit construct
 * text). The main purpose of the compilation is two-fold:
 *
 * 1) Turn the heterogeneous shorthand and explicit inputs into a canonical
 *    list of parsed `CONSTRUCT` query objects (as produced by `sparqljs`).
 *
 * 2) Extend the original set of constructs with additional derived
 *    constructs that capture interactions among rules. These derived rules
 *    handle specialization (making a construct more specific using bindings
 *    from other constructs) and generalization (making a construct more
 *    generic by replacing bound roles with variables plus VALUES blocks).
 *
 * The compilation pipeline (high level):
 * - Parse each rule spec into a `CONSTRUCT` query object.
 * - Decompose multi-triple templates into single-triple constructs.
 * - Produce specialized variants by co-specializing constructs against each
 *   other (to capture interaction-driven bindings).
 * - Produce generalized variants by replacing one or more bound roles with
 *   variables and adding corresponding `VALUES` patterns.
 * - Merge constructs that share the same template triple into a single
 *   construct with a `UNION` over their `WHERE` clauses.
 * - Order the produced constructs by decreasing specificity (fewer free
 *   variables first) so downstream consumers can try the most specific
 *   patterns first.
 *
 * Notes on formats:
 * - `ruleSpecs` is an array where each element can be:
 *
 *   1) A string: A complete SPARQL CONSTRUCT query
 *      'CONSTRUCT { ?p foaf:name ?n } { ?p schema:name ?n; foaf:knows ?other. }'
 *
 *   2) An object with shorthand properties:
 *      { class: '<IRI>' }
 *      { property: '<IRI>' }
 *      { pattern: '... WHERE pattern ...' }
 *      { template: '?s a <Type> . ?s <p> ?o' }
 *      { construct: 'CONSTRUCT { ... } WHERE { ... }' }
 *      { exclude: true } // turns the rule into a construct that never matches
 *
 * - `commonPreamble` is a string that is prefixed to every construct text
 *   before parsing (useful to provide PREFIX declarations shared by all
 *   rules).
 */

const DEFAULT_VARS = Object.fromEntries(['subject', 'predicate', 'object'].map(l => [l, {
    termType: 'Variable',
    value: l
}]));

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
    // Split a CONSTRUCT with multiple template triples into a list of
    // single-triple CONSTRUCTs. For each template triple, replace the free
    // variable role names with the canonical `DEFAULT_VARS` so subsequent
    // comparisons and merging operate on a normalized form.
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

function cospecialize(construct, [otherConstruct, ...restOfOtherConstructs] ) {
    const constructFreeRoles = freeRoles(construct.template[0]);
    const constructBoundRoles = boundRoles(construct.template[0]);
    // Co-specialization: if `construct` has roles that are free where
    // `otherConstruct` has bound roles (and vice-versa for compatibility),
    // produce specialized variants of `construct` by copying binding values
    // from `otherConstruct` into the free roles. Recursively propagate
    // specializations across the remaining constructs.
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

/**
 * Compile a list of rule specifications into normalized CONSTRUCT queries.
 *
 * Parameters:
 * - `commonPreamble` (string): text prefixed to every construct before
 *   parsing (useful for shared PREFIX declarations).
 * - `ruleSpecs` (Array<string|Object>): each element is a rule specification
 *   which can be:
 *     - A string: complete SPARQL CONSTRUCT query
 *     - An object with shorthand properties: `class`, `property`, `pattern`,
 *       `template`, `construct`, and optionally `exclude`.
 *
 * Returns:
 * - An array of parsed `sparqljs` CONSTRUCT query objects, expanded with
 *   specialized and generalized variants, merged by template, and ordered
 *   by decreasing specificity (fewest free variables first).
 */
export default function compileView({
    commonPreamble = '',
    ruleSpecs = []
} = {}) {
    const parser = new SparqlParser();
    function ruleSpecToConstruct(rule) {

        let constructTxt;
        if (typeof rule === "string") {
            constructTxt = rule;
        } else if ('construct' in rule) {
            constructTxt = rule.construct;
        } else {
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

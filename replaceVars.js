import visit, { COLLAPSED_FALSE, COLLAPSED_TRUE } from "./visitQuery.js";
import { equalTerms } from './match.js';

/**
 * replaceVars.js
 *
 * Replace variable occurrences within a parsed SPARQL query structure.
 *
 * Parameters:
 * - `query`: the parsed SPARQL query or pattern to transform.
 * - `replacement`: an object mapping variable names (without `?`) to term
 *   objects. If a variable maps to another variable term, variables are
 *   renamed accordingly.
 * - `defaultPrefix`: a string prefix applied to variables that are left
 *   un-replaced to avoid name collisions (used when inlining subqueries).
 * - `boundVariables`: an array of variable names that are considered bound
 *   (affects handling of `BIND` patterns).
 *
 * The function returns a new query/pattern where variables are replaced and
 * VALUES/BIND patterns are adjusted. It relies on `visitQuery` to traverse
 * the parsed structure and apply the replacements consistently.
 */
export default function replaceVars(query, replacement, defaultPrefix = '', boundVariables = []) {
    return visit(query, {
        postVisitPattern: pattern => {
            if (pattern.type === 'values') {
                let newValues = [];
                pattern.values.forEach((binding) => {
                    let newBinding = {};
                    for (const varnameWithQuestionMark in binding) {
                        const varname = varnameWithQuestionMark.slice(1);
                        if (varname in replacement) {
                            if (replacement[varname].termType === 'Variable') {
                                const newVarname = replacement[varname].value;
                                if (`?${newVarname}` in newBinding) {
                                    if (!equalTerms(newBinding[`?${newVarname}`], binding[`?${varname}`])) {
                                        return;
                                    }
                                } else {
                                    newBinding[`?${newVarname}`] = binding[`?${varname}`]
                                }
                            }
                            if (!equalTerms(binding[`?${varname}`], replacement[varname])) {
                                return;
                            }
                        } else {
                            newBinding[`?${defaultPrefix}${varname}`] = binding[`?${varname}`]
                        }
                    }
                    newValues.push(newBinding);
                });
                if (newValues.length === 0) {
                    return COLLAPSED_FALSE;
                }
                if (newValues.length === 1 && Object.keys(newValues[0]).length === 0) {
                    return COLLAPSED_TRUE;
                }
                return {
                    type: 'values',
                    values: newValues
                };
            }
            // if (pattern.type === 'bind' && pattern.variable.value in replacement) {
            //     if (replacement[pattern.variable.value].termType !== 'Variable') {
            if (pattern.type === 'bind') {
                if (pattern.variable.termType !== 'Variable') {
                    if ('termType' in pattern.expression) {
                        if (equalTerms(replacement[pattern.variable.value], pattern.expression)) {
                            return COLLAPSED_TRUE;
                        }
                        return COLLAPSED_FALSE;
                    }
                    return {
                        type: 'filter',
                        expression: {
                            type: 'operation',
                            operator: '=',
                            args: [pattern.variable, pattern.expression]
                        }
                    };
                }
                if (boundVariables.includes(pattern.variable.value)) {
                    return {
                        type: 'filter',
                        expression: {
                            type: 'operation',
                            operator: '=',
                            args: [pattern.variable.value, pattern.expression]
                        }
                    };
                }
            }
            return pattern;
        },
        visitTerm: term => {
            if (term.termType === 'Variable') {
                if (term.value in replacement) {
                    return replacement[term.value];
                } else {
                    return {
                        termType: 'Variable',
                        value: `${defaultPrefix}${term.value}`
                    }
                }
            }
            if (term.termType === 'BlankNode') {
                return {
                    termType: 'BlankNode',
                    value: `${term.value.slice(0,2)}${defaultPrefix}${term.value.slice(2)}`
                }
            }
            return term;
        }
    });
}


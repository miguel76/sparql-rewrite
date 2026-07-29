import type * as SparqlJs from 'sparqljs';
import visit, { QueryComponent } from "./visitQuery.js";
import { equalTerms } from './match.js';

export default function replaceVars<replacedComponent extends QueryComponent>(
    query: replacedComponent,
    replacement: Record<string, SparqlJs.Term>,
    defaultPrefix = '',
    boundVariables: string[] = []
): replacedComponent {
    return visit(query, {
        postVisitPattern: pattern => {
            if (pattern.type === 'values') {
                let newValues: any[] = [];
                pattern.values.forEach((binding: any) => {
                    let newBinding: any = {};
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
                    return {type: 'values', values: []}; // COLLAPSED_FALSE
                }
                if (newValues.length === 1 && Object.keys(newValues[0]).length === 0) {
                    return {type: 'values', values: [{}]}; // COLLAPSED_TRUE
                }
                return {
                    type: 'values',
                    values: newValues
                };
            }
            if (pattern.type === 'bind') {
                if (pattern.variable.termType !== 'Variable') {
                    if ('termType' in pattern.expression) {
                        if (equalTerms(replacement[pattern.variable.value], pattern.expression)) {
                            return {type: 'values', values: [{}]};
                        }
                        return {type: 'values', values: []};
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

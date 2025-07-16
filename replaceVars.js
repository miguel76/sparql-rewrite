import visit from "./visitQuery.js";

export default function replaceVars(query, replacement, defaultPrefix = '') {
    return visit(query, {
        postVisitQuery: query => {
            if (query.type === 'values') {
                let newValues = [];
                query.values.forEach((binding) => {
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
            if (query.type === 'bind' && query.variable.value in replacement && replacement[query.variable.value].termType !== 'Variable') {
                if ('termType' in query.expression) {
                    if (equalTerms(replacement[query.variable.value], query.expression)) {
                        return COLLAPSED_TRUE;
                    }
                    return COLLAPSED_FALSE;
                }
                return {
                    type: 'filter',
                    expression: {
                        type: 'operation',
                        operator: '=',
                        args: [replacement[query.variable.value], query.expression]
                    }
                };
            }
            return query;
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


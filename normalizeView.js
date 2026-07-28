import { Parser as SparqlParser } from 'sparqljs';
import visitQuery, { COLLAPSED_FALSE } from './visitQuery.js';
import replaceVars from './replaceVars.js';
import { equalTerms } from './match.js';

export const DEFAULT_VARS = Object.fromEntries(['subject', 'predicate', 'object'].map(l => [l, {
    termType: 'Variable',
    value: l
}]));

export function ruleToConstructTxt(rule, defaults) {
    if (typeof rule === "string") {
        rule = { [defaults.key]: rule };
    }
    rule = { ...defaults, ...rule };

    let preambleTxt = '';
    if ('preamble' in rule) {
        preambleTxt = rule.preamble;
    } else {
        if ('base' in rule) {
            preambleTxt += `BASE <${rule.base}> `;
        }
        if ('prefixes' in rule) {
            preambleTxt += Object.entries(rule.prefixes).map(([prefix, iri]) =>
                `PREFIX ${prefix}: <${iri}> `
            ).join('');
        }
    }

    let constructTxt;
    if ('construct' in rule) {
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

        let patternTxt;
        if ('pattern' in rule) {
            patternTxt = rule.pattern;
        } else if ('path' in rule) {
            patternTxt = `?${DEFAULT_VARS.subject.value} ${rule.path} ?${DEFAULT_VARS.object.value}`;
        } else if ('type' in rule) {
            patternTxt = `?${DEFAULT_VARS.subject.value} a ${rule.type}`;
        } else {
            patternTxt = templateTxt;
        }
        if ('graph' in rule) {
            patternTxt = `GRAPH ${rule.graph} { ${patternTxt} }`;
        }
        if ('service' in rule) {
            patternTxt = `SERVICE ${rule.service} { ${patternTxt} }`;
        }
        constructTxt = `CONSTRUCT {${templateTxt}} WHERE {${patternTxt}}`;
    }
    return preambleTxt + ' ' + constructTxt;
}

export function ruleToConstruct(rule, defaults, parser) {
    const construct = parser.parse(ruleToConstructTxt(rule, defaults));
    rule = { ...defaults, ...rule };
    construct.uniqueTemplate = 'uniqueTemplate' in rule && rule.uniqueTemplate;
    return construct;
}

export default function normalizeView({ rules, defaults = {}, subViews = []}, parser = new SparqlParser()) {
    defaults = {key: 'construct', ...defaults};
    return [
        ...rules.map(r => ruleToConstruct(r, defaults, parser)),
        ...subViews.flatMap(subView => normalizeView({...subView, defaults: {...defaults, ...subView.defaults} }, parser ))
    ];
}

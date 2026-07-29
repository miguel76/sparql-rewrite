import type * as SparqlJs from 'sparqljs';
import { Parser as SparqlParser } from 'sparqljs';

type RuleObject = {
    preamble?: string,
    base?: string,
    prefixes?: Record<string, string>,
    construct?: string,
    template?: string,
    class?: string,
    property?: string,
    pattern?: string,
    path?: string,
    type?: string,
    graph?: string,
    service?: string,
    uniqueTemplate?: boolean
};

export type Rule = string | RuleObject;

type Defaults = RuleObject & {
    key?: string,
    inherit?: boolean
};

export type View = {
    rules: Rule[],
    defaults?: Defaults,
    subViews?: View[]
};

type AnnotatedConstructQueryTxt = {
    construct: string,
    uniqueTemplate?: boolean
}

export type AnnotatedConstructQuery = SparqlJs.ConstructQuery & {
    uniqueTemplate?: boolean
};

export type ParsedView = AnnotatedConstructQuery[];

export const DEFAULT_VARS = Object.fromEntries(['subject', 'predicate', 'object'].map((l: any) => [l, {
    termType: 'Variable',
    value: l
}]));

export function ruleToConstructTxt(rule: Rule, defaults: Defaults): AnnotatedConstructQueryTxt {
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

    let constructTxt: any;
    if ('construct' in rule) {
        constructTxt = rule.construct;
    } else {
        let templateTxt: any;
        if ('template' in rule) {
            templateTxt = rule.template;
        } else if ('class' in rule) {
            templateTxt = `?${DEFAULT_VARS.subject.value} a ${rule.class}`;
        } else if ('property' in rule) {
            templateTxt = `?${DEFAULT_VARS.subject.value} ${rule.property} ?${DEFAULT_VARS.object.value}`;
        } else {
            templateTxt = `?${DEFAULT_VARS.subject.value} ?${DEFAULT_VARS.predicate.value} ?${DEFAULT_VARS.object.value}`;
        }

        let patternTxt: any;
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
    return { construct: preambleTxt + ' ' + constructTxt, uniqueTemplate: 'uniqueTemplate' in rule ? rule.uniqueTemplate : undefined };
}

export function ruleToConstruct(rule: Rule, defaults: Defaults, parser: SparqlJs.SparqlParser): AnnotatedConstructQuery {
    const { construct, uniqueTemplate } = ruleToConstructTxt(rule, defaults);
    return {...parser.parse(construct) as SparqlJs.ConstructQuery, uniqueTemplate};
}

export default function parseView(view: View, parser: SparqlJs.SparqlParser = new SparqlParser()): ParsedView {
    let {rules = [], defaults = {}, subViews = []} = view;
    defaults = {key: 'construct', inherit: true, ...defaults};
    return [
        ...rules.map(r => ruleToConstruct(r, defaults, parser)),
        ...subViews.flatMap(subView => parseView({...subView, defaults: {...(defaults.inherit ? defaults : {}), ...subView.defaults} }, parser))
    ];
}

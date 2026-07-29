import { Parser as SparqlParser } from 'sparqljs';
import { Generator as SparqlGenerator } from 'sparqljs';
import queryRewrite from './rewrite.js';
import compileView from './compileView.js';
import viewToUpdate from './viewToUpdate.js';
import parseView from './parseView.js';
import type * as SparqlJs from 'sparqljs';

const parser = new SparqlParser();

const view = {
    defaults: {
        uniqueTemplate: true,
        prefixes: {
            foaf: 'http://xmlns.com/foaf/0.1/',
            schema: 'http://schema.org/',
            ciccio: 'http://ciccio.org/'
        }
    },
    subViews: [
        {
            rules: [
                'CONSTRUCT {?p foaf:name ?n. ?n a foaf:Name} { ?p ciccio:name ?n; foaf:knows ?other. }',
                'CONSTRUCT {?p foaf:knows ?n} { ?p ciccio:knows ?n }'
            ]
        },
        {
            rules: [
                'CONSTRUCT WHERE { ?p ciccio:likes ?n }'
            ]
        }
    ],
    rules: [
        {},
        'CONSTRUCT {?p foaf:name ?n. ?n a foaf:Name} { ?p schema:name ?n; foaf:knows ?other. }',
        'CONSTRUCT {?p foaf:knows ?n} { ?p schema:knows ?n }',
        'CONSTRUCT WHERE { ?p schema:likes ?n }'
    ]
}

const normalizedView = parseView(view);

const query = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>

SELECT *
{
    {
        ?mickey foaf:name "Mickey Mouse"@en;
            foaf:knows ?other.
        ?puffo foaf:knows ?puffetta.
        OPTIONAL {_:a foaf:name _:b2}.
    } UNION {
        ?mickey foaf:name "Mickey Ratoncito"@es
    }.
    VALUES ?puffo {ex:a ex:b}.
    VALUES (?tizio ?caio) {(ex:tc ex:cc) (ex:td ex:cd)}.
    BIND ("youkknow" AS ?sempronio).
    FILTER (?puffetta = "puffa")
}
`;

const parsedQuery: SparqlJs.ConstructQuery = parser.parse(query);

var generator = new SparqlGenerator({});

console.log(
`
## View Specification
${JSON.stringify(view, null, 2)}
`);

const compiledView = compileView(normalizedView);

var ruleCounter = 0;
console.log(`
## Compiled View
${
  compiledView.map(construct =>
`
# Rule ${++ruleCounter}
${generator.stringify(construct)}
`
  ).join('\n')
}
`);

console.log(
`
## Query
${query}
`);

console.log(
`
## RewrittenQuery
${generator.stringify(queryRewrite(parsedQuery, compiledView))}
`);

console.log(
`
## View as Update
${generator.stringify(viewToUpdate(normalizedView, 'http://example.org/graph'))}
`);

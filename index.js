// Parse a SPARQL query to a JSON object
import { Parser as SparqlParser } from 'sparqljs';
import { Generator as SparqlGenerator } from 'sparqljs';
import replaceVars from './replaceVars.js';
import tripleMatch from './match.js';
import queryRewrite from './rewrite.js';
import getOuptutVariables from './getOutputVariables.js';

var parser = new SparqlParser();

const parsedRules = [
    parser.parse(
        'PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
        'PREFIX schema: <http://schema.org/> ' +
        'CONSTRUCT {?p foaf:name ?n} { ?p schema:name ?n; foaf:knows ?other. }'),
    parser.parse(
        'PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
        'PREFIX schema: <http://schema.org/> ' +
        'CONSTRUCT {?p foaf:knows ?n} { ?p schema:knows ?n }'),
];

var parsedQuery = parser.parse(
  'PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
  'PREFIX ex: <http://example.org/> ' +
  'SELECT ' +
  // '?mickey ?puffo (?tizio AS ?grotta) (AVG(?puffetta) + 1 AS ?anvedi) ' +
  '* ' +
  '{ {?mickey foaf:name "Mickey Mouse"@en; foaf:knows ?other. ?puffo foaf:knows ?puffetta. ' +
  'OPTIONAL {_:a foaf:name _:b2}.} ' +
  'UNION {?mickey foaf:name "Mickey Ratoncito"@es }. ' +
  'VALUES ?puffo {ex:a ex:b}. ' +
  'VALUES (?tizio ?caio) {(ex:tc ex:cc) (ex:td ex:cd)}. ' +
  'BIND ("youkknow" AS ?sempronio). ' +
  'FILTER (?puffetta = "puffa")}');

// console.log(parsedQuery.variables[0]);

// console.log(JSON.stringify(parsedQuery));
// console.log(getOuptutVariables(parsedQuery));

var generator = new SparqlGenerator({ /* prefixes, baseIRI, factory, sparqlStar */ });

// console.log(parsedQuery.variables);

console.log(queryRewrite(parsedQuery, parsedRules, true));
console.log(generator.stringify(queryRewrite(parsedQuery, parsedRules, true)));
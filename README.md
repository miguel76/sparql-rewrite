# sparql-rewrite

A library for SPARQL query rewriting based on a set of rules. It enables you to build virtual views over RDF datasets by defining transformation rules that map queries against one schema to queries against another schema.

## Features

- **Query Rewriting**: Transform SPARQL queries using declarative rules
- **View Definitions**: Create virtual views over RDF data using rule specifications

## Installation

```bash
npm install sparql-rewrite
```

## Usage

### Basic Query Rewriting

Here's a simple example of rewriting a SPARQL query using transformation rules:

```javascript
import { Parser as SparqlParser } from 'sparqljs';
import { Generator as SparqlGenerator } from 'sparqljs';
import queryRewrite from 'sparql-rewrite/rewrite.js';
import compileView from 'sparql-rewrite/compileView.js';

const parser = new SparqlParser();
const generator = new SparqlGenerator();

// Define view rules
const viewSpec = {
  commonPreamble: `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX schema: <http://schema.org/>
  `,
  ruleSpecs: [
    'CONSTRUCT { ?p foaf:name ?n } { ?p schema:name ?n; foaf:knows ?other. }',
    'CONSTRUCT { ?p foaf:knows ?n } { ?p schema:knows ?n }'
  ]
};

// Parse a query
const query = parser.parse(`
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  SELECT * WHERE {
    ?person foaf:name ?name;
            foaf:knows ?other.
  }
`);

// Rewrite the query using the view specification
const compiledRules = compileView(viewSpec);
const rewrittenQuery = queryRewrite(query, compiledRules);

// Generate SPARQL string from rewritten query
console.log(generator.stringify(rewrittenQuery));
```

## Documentation

For detailed information about the view specification format and advanced usage, see [VIEW_SPECIFICATION.md](VIEW_SPECIFICATION.md).

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT

# View Specification Format

This document describes the shape of the view specification accepted by `compileView()` in `compileView.js`.

## Overview

A view specification is a JavaScript object that describes one or more transformation rules for rewriting SPARQL queries against a virtual schema.

The implementation does not treat the input as a purely declarative list of finished rules. Instead, it normalizes each rule into parsed SPARQL `CONSTRUCT` query objects, then expands that set into additional derived rules before returning the final compiled rule list.

## Top-level Shape

```javascript
{
  commonPreamble: string,
  ruleSpecs: Array<RuleSpec>
}
```

### `commonPreamble`

A string that is prepended to every rule before parsing.

This is the place to put shared prefix declarations, such as:

```javascript
commonPreamble: `
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX schema: <http://schema.org/>
  PREFIX ex: <http://example.org/>
`
```

The value is concatenated with each rule text and passed to the SPARQL parser.

### `ruleSpecs`

`ruleSpecs` is an array. Each element may be either:

1. A string containing a complete SPARQL `CONSTRUCT` query
2. An object containing shorthand rule fields that are converted into a `CONSTRUCT`

The compiler accepts the following rule forms.

## Rule Forms

### 1. Full `CONSTRUCT` string

```javascript
ruleSpecs: [
  'CONSTRUCT { ?p foaf:name ?n } { ?p schema:name ?n; foaf:knows ?other. }',
  'CONSTRUCT { ?p foaf:knows ?n } { ?p schema:knows ?n }'
]
```

If a rule spec is a plain string, it is used directly as the rule text.

### 2. Object with `construct`

```javascript
{
  construct: 'CONSTRUCT { ?p foaf:name ?n } WHERE { ?p schema:name ?n }'
}
```

When `construct` is present, its value is treated as the full rule text.

### 3. Object shorthand forms

The object form supports shorthand properties that are transformed into a `CONSTRUCT` query internally.

```javascript
{
  template: string,
  pattern?: string,
  path?: string,
  type?: string,
  class?: string,
  property?: string,
  never?: boolean
}
```

#### `template`

A SPARQL template fragment, such as:

```javascript
{
  template: '?s a <http://xmlns.com/foaf/0.1/Person> . ?s <http://xmlns.com/foaf/0.1/knows> ?o'
}
```

If no template/class/property is supplied, the compiler defaults to:

```sparql
?s ?p ?o
```

#### `class`

A class IRI. The template becomes:

```sparql
?s a <class>
```

Example:

```javascript
{
  class: 'foaf:Person'
}
```

#### `property`

A property IRI. The template becomes:

```sparql
?s <property> ?o
```

Example:

```javascript
{
  property: 'foaf:knows'
}
```

#### `pattern`

A SPARQL WHERE pattern. The compiler generates:

```sparql
CONSTRUCT { <template> } WHERE { <pattern> }
```

Example:

```javascript
{
  template: '?s foaf:name ?name',
  pattern: '?s schema:name ?name'
}
```

#### `path`

A SPARQL property path. The compiler generates:

```sparql
CONSTRUCT { <template> } WHERE { ?s <path> ?o }
```

Example:

```javascript
{
  property: 'foaf:knows',
  path: 'foaf:knows/foaf:name'
}
```

#### `type`

A class IRI. The compiler generates:

```sparql
CONSTRUCT { <template> } WHERE { ?s a <type> }
```

Example:

```javascript
{
  class: 'foaf:Person',
  type: 'foaf:Person'
}
```

#### `never`

If `never: true`, the rule is compiled as a collapsed false condition instead of a normal matching rule.

```javascript
{
  property: 'schema:name',
  never: true
}
```

## Practical Examples

### String-based specification

```javascript
const viewSpec = {
  commonPreamble: `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX schema: <http://schema.org/>
  `,
  ruleSpecs: [
    'CONSTRUCT { ?p foaf:name ?n } { ?p schema:name ?n; foaf:knows ?other. }',
    'CONSTRUCT { ?p foaf:knows ?n } { ?p schema:knows ?n }',
    'CONSTRUCT WHERE { ?p schema:likes ?n }'
  ]
};
```

### Object-based shorthand specification

```javascript
const viewSpec = {
  commonPreamble: `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX schema: <http://schema.org/>
  `,
  ruleSpecs: [
    {
      construct: 'CONSTRUCT { ?p foaf:name ?n } { ?p schema:name ?n; foaf:knows ?other. }'
    },
    {
      property: 'foaf:knows',
      path: 'schema:knows'
    },
    {
      class: 'foaf:Person',
      type: 'schema:Person'
    }
  ]
};
```

## Important Behavioral Notes

- `ruleSpecs` entries are not required to be all the same shape.
- String rules remain the most direct and explicit way to express a full `CONSTRUCT`.
- Object shorthand is converted internally into the same normalized `CONSTRUCT` representation.
- `compileView()` may expand the final rule set beyond the original number of entries.
- The compiler intentionally creates additional variants to support more flexible matching and rule interaction.

## Best Practices

- Keep the `commonPreamble` focused on shared prefixes.
- Prefer fully explicit strings when the rule is already written as a `CONSTRUCT`.
- Use shorthand objects when generating simple class/property mappings from data.
- Expect the compiled rule list to be richer than the input list because of specialization, generalization, and merging.
- Treat the returned result as an internal rewrite artifact rather than as a literal copy of the source spec.

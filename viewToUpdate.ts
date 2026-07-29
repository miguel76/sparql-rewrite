import type * as SparqlJs from 'sparqljs';

function constructToUpdate(construct: SparqlJs.ConstructQuery, graphIRI: string) {
    return {
        "updateType": "insertdelete",
        "insert": [
            {
                type: 'graph',
                triples: [...construct.template],
                name: {
                    termType: 'NamedNode',
                    value: graphIRI
                }
            }
        ],
        delete: [],
        "where": construct.where
    } as SparqlJs.UpdateOperation;
}

export default function viewToUpdate(normalizedView: SparqlJs.ConstructQuery[], graphIRI: string) {    
    return {
        "type": "update",
        "updates": normalizedView.map(c => constructToUpdate(c, graphIRI))
    } as SparqlJs.Update;
};

import normalizeView from './normalizeView.js';

function constructToUpdate(construct, graphIRI) {
    console.log(construct);
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
    }
}

export default function viewToUpdate(normalizedView, graphIRI) {    
    return {
        "type": "update",
        "updates": normalizedView.map(c => constructToUpdate(c, graphIRI))
    }
};
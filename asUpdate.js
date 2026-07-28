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

export default function asUpdate({
    rules,
    defaults = {},
    subViews = []
}, graphIRI) {
    const constructs = normalizeView({ rules, defaults, subViews });
    return {
        "type": "update",
        "updates": constructs.map(c => constructToUpdate(c, graphIRI))
    }
};
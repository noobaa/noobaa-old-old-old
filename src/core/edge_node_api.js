// this module is written for both nodejs, or for client with browserify.
'use strict';

var restful_api = require('./restful_api');


module.exports = restful_api.define_api({

    name: 'EdgeNode',

    methods: {

        create_edge_node: {
            method: 'POST',
            path: '/',
            params: {
                // TODO
            },
        },

        read_edge_node: {
            method: 'GET',
            path: '/:node_id',
            params: {
                node_id: {
                    type: String,
                    required: true,
                },
            },
        },

        update_edge_node: {
            method: 'PUT',
            path: '/:node_id',
            params: {
                node_id: {
                    type: String,
                    required: true,
                },
            },
        },

        delete_edge_node: {
            method: 'DELETE',
            path: '/:node_id',
            params: {
                node_id: {
                    type: String,
                    required: true,
                },
            },
        },
    }

});

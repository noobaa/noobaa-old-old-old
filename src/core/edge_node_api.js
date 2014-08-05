// this module is written for both nodejs, or for client with browserify.
'use strict';

var _ = require('underscore');


var node_api = {

    create_node: {
        method: 'POST',
        path: '/',
        params: {},
    },

    read_node: {
        method: 'GET',
        path: '/:node',
        params: {},
    },

    update_node: {
        method: 'PUT',
        path: '/:node',
        params: {},
    },

    delete_node: {
        method: 'DELETE',
        path: '/:node',
        params: {},
    },

};

module.exports = node_api;

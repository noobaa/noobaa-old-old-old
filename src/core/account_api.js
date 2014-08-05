// this module is written for both nodejs, or for client with browserify.
'use strict';

var _ = require('underscore');


var account_api = {

    create_account: {
        method: 'POST',
        path: '/',
        params: {
            name: {
                type: String,
                required: true,
            },
            email: {
                type: String,
                required: true,
            },
            password: {
                type: String,
                required: true,
            },
        },
    },

    read_account: {
        method: 'GET',
        path: '/:account',
        params: {},
    },

    update_account: {
        method: 'PUT',
        path: '/:account',
        params: {},
    },

    delete_account: {
        method: 'DELETE',
        path: '/:account',
        params: {},
    },

};

module.exports = account_api;

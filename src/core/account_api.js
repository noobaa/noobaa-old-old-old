// this module is written for both nodejs, or for client with browserify.
'use strict';

var restful_api = require('./restful_api');


module.exports = restful_api.define_api({

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

});

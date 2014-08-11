// this module is written for both nodejs, or for client with browserify.
'use strict';

var restful_api = require('./restful_api');


module.exports = restful_api.define_api({

    name: 'Account',

    methods: {

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
            reply: {
                
            }
        },

        read_account: {
            method: 'GET',
            path: '/:account_id',
            params: {
                account_id: {
                    type: String,
                    required: true,
                },
            },
        },

        update_account: {
            method: 'PUT',
            path: '/:account_id',
            params: {
                account_id: {
                    type: String,
                    required: true,
                },
            },
        },

        delete_account: {
            method: 'DELETE',
            path: '/:account_id',
            params: {
                account_id: {
                    type: String,
                    required: true,
                },
            },
        },
    }

});

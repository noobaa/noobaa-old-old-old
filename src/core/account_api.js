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
            path: '/',
            reply: {
                email: {
                    type: String,
                    required: true,
                },
            },
        },

        update_account: {
            method: 'PUT',
            path: '/',
            params: {
                email: {
                    type: String,
                    required: true,
                },
            },
        },

        delete_account: {
            method: 'DELETE',
            path: '/',
        },


        authenticate: {
            method: 'POST',
            path: '/auth',
            params: {
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

        logout: {
            method: 'POST',
            path: '/auth/logout',
        },

    }

});

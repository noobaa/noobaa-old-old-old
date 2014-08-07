// this module is written for both nodejs, or for client with browserify.
'use strict';

var restful_api = require('./restful_api');


module.exports = restful_api.define_api({

    // bucket functions

    create_bucket: {
        method: 'POST',
        path: '/',
        params: {},
    },
    read_bucket: {
        method: 'GET',
        path: '/:bucket',
        params: {
            bucket: {
                type: String,
                required: true,
            },
        },
    },
    update_bucket: {
        method: 'PUT',
        path: '/:bucket',
        params: {
            bucket: {
                type: String,
                required: true,
            },
        },
    },
    delete_bucket: {
        method: 'DELETE',
        path: '/:bucket',
        params: {
            bucket: {
                type: String,
                required: true,
            },
        },
    },
    list_objects: {
        method: 'GET',
        path: '/:bucket/list',
        params: {
            bucket: {
                type: String,
                required: true,
            },
        },
    },

    // object functions

    create_object: {
        method: 'POST',
        path: '/:bucket',
        params: {
            bucket: {
                type: String,
                required: true,
            },
        },
    },
    read_object: {
        method: 'GET',
        path: '/:bucket/:key',
        params: {
            bucket: {
                type: String,
                required: true,
            },
            key: {
                type: String,
                required: true,
            },
        },
    },
    update_object: {
        method: 'PUT',
        path: '/:bucket/:key',
        params: {
            bucket: {
                type: String,
                required: true,
            },
            key: {
                type: String,
                required: true,
            },
        },
    },
    delete_object: {
        method: 'DELETE',
        path: '/:bucket/:key',
        params: {
            bucket: {
                type: String,
                required: true,
            },
            key: {
                type: String,
                required: true,
            },
        },
    },
    map_object: {
        method: 'GET',
        path: '/:bucket/:key/map',
        params: {
            bucket: {
                type: String,
                required: true,
            },
            key: {
                type: String,
                required: true,
            },
        },
    },
});

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
        params: {},
    },
    update_bucket: {
        method: 'PUT',
        path: '/:bucket',
        params: {},
    },
    delete_bucket: {
        method: 'DELETE',
        path: '/:bucket',
        params: {},
    },
    list_objects: {
        method: 'GET',
        path: '/:bucket/list',
        params: {},
    },

    // object functions

    create_object: {
        method: 'POST',
        path: '/:bucket',
        params: {},
    },
    read_object: {
        method: 'GET',
        path: '/:bucket/:key',
        params: {},
    },
    update_object: {
        method: 'PUT',
        path: '/:bucket/:key',
        params: {},
    },
    delete_object: {
        method: 'DELETE',
        path: '/:bucket/:key',
        params: {},
    },
    map_object: {
        method: 'GET',
        path: '/:bucket/:key/map',
        params: {},
    },
});

// this module is written for both nodejs, or for client with browserify.
'use strict';

var _ = require('underscore');


var KEY_PATH = '/:bucket/:key';
var BKT_PATH = '/:bucket';

// ObjectRestAPI is the descriptor of NooBaa's Object API as a RESTful API.
// this descriptor is used to generate both client side driver and server side routes.
var object_api = {
    get_object: {
        method: 'GET',
        path: KEY_PATH,
    },
    create_object: {
        method: 'POST',
        path: KEY_PATH,
    },
    update_object: {
        method: 'PUT',
        path: KEY_PATH,
    },
    delete_object: {
        method: 'DELETE',
        path: KEY_PATH,
    },
    map_object: {
        method: 'GET',
        path: KEY_PATH + '/map',
    },
    list_objects: {
        method: 'GET',
        path: BKT_PATH,
    },
};

// exporting the object_api module

module.exports = object_api;

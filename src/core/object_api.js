// this module is written for both nodejs, or for client with browserify.
'use strict';

var _ = require('underscore');


var KEY_PATH = '/:bucket/:key';
var BKT_PATH = '/:bucket';


// object_api is NooBaa's Object API as a RESTful API.
// this info is used to generate both client side driver and server side routes.
var object_api = {
    
    // bucket functions
    
    get_bucket: {
        method: 'GET',
        path: BKT_PATH,
    },
    create_bucket: {
        method: 'POST',
        path: BKT_PATH,
    },
    update_bucket: {
        method: 'PUT',
        path: BKT_PATH,
    },
    delete_bucket: {
        method: 'DELETE',
        path: BKT_PATH,
    },
    list_objects: {
        method: 'GET',
        path: BKT_PATH + '/list',
    },
    
    // object functions
    
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
};

// exporting the object_api module

module.exports = object_api;

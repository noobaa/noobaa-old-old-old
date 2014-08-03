// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var rest_server = require('./rest_server');
var object_api = require('./object_api');

var object_api_impl = {
    create_object: create_object,
    read_object: read_object,
    update_object: update_object,
    delete_object: delete_object,
    map_object: map_object,
    list_objects: list_objects,
};

// exporting all the object_api_impl functions (mostly for testing)
// and also the setup function to be used when creating an express/connect app server.
module.exports = _.extend({}, object_api_impl, {
    setup: setup,
});


// setup the app routes to handle object server on the specified path.
//
// app_router (Object) - see rest_server.setup()
// base_path (String) - rest_server.setup
//
function setup(app_router, base_path) {
    rest_server.setup(app_router, base_path, object_api, object_api_impl);
}


function create_object(params, callback) {
    // TODO
}

function read_object(params, callback) {
    // TODO
}

function update_object(params, callback) {
    // TODO
}

function delete_object(params, callback) {
    // TODO
}

function map_object(params, callback) {
    // TODO
}

function list_objects(params, callback) {
    // TODO
}

// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var rest_server = require('./rest_server');
var object_api = require('./object_api');
// db models
var Account = require('./models/account');
var Bucket = require('./models/bucket');
var ObjectMD = require('./models/object_md');
var ObjectMap = require('./models/object_map');
var EdgeNode = require('./models/edge_node');
var EdgeBlock = require('./models/edge_block');


var object_api_impl = {
    // bucket actions
    get_bucket: get_bucket,
    create_bucket: create_bucket,
    update_bucket: update_bucket,
    delete_bucket: delete_bucket,
    list_objects: list_objects,
    // object actions
    get_object: get_object,
    create_object: create_object,
    update_object: update_object,
    delete_object: delete_object,
    map_object: map_object,
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


function get_bucket(params, callback) {
    // TODO
}

function create_bucket(params, callback) {
    // TODO
}

function update_bucket(params, callback) {
    // TODO
}

function delete_bucket(params, callback) {
    // TODO
}

function list_objects(params, callback) {
    // TODO
}

function get_object(params, callback) {
    // TODO
}

function create_object(params, callback) {
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

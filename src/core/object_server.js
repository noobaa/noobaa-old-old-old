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


function get_bucket(params) {
    var info = {
        name: params.bucket
    };
    return Bucket.findOne(info);
}


function create_bucket(params) {
    var info = {
        name: params.bucket
    };
    var bucket = new Bucket(info);
    return bucket.save();
}


function update_bucket(params) {
    var info = {
        name: params.bucket
    };
    var updates = _.pick(params); // no fields can be updated for now
    return Bucket.findOneAndUpdate(info, updates);
}


function delete_bucket(params) {
    var info = {
        name: params.bucket
    };
    return Bucket.findOneAndDelete(info);
}


function list_objects(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
    };
    var select = {
        map: 0
    };
    return ObjectMD.find(info, select);
}


function get_object(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
    };
    var select = {
        map: 0
    };
    return ObjectMD.findOne(info, select);
}


function create_object(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
        size: params.size,
    };
    var obj = new ObjectMD(info);
    return obj.save();
}


function update_object(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
    };
    var updates = _.pick(params); // no fields can be updated for now
    return Bucket.findOneAndUpdate(info, updates);
}


function delete_object(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
    };
    return Bucket.findOneAndDelete(info);
}


function map_object(params) {
    var info = {
        bucket: params.bucket,
        key: params.key,
    };
    return ObjectMD.findOne(info);
}

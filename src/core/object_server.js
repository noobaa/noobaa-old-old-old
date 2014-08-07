// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var object_api = require('./object_api');
// db models
var Account = require('./models/account');
var Bucket = require('./models/bucket');
var ObjectMD = require('./models/object_md');
var ObjectMap = require('./models/object_map');
var EdgeNode = require('./models/edge_node');
var EdgeBlock = require('./models/edge_block');


module.exports = restful_api.setup_server(object_api, {
    // bucket actions
    create_bucket: create_bucket,
    read_bucket: read_bucket,
    update_bucket: update_bucket,
    delete_bucket: delete_bucket,
    list_objects: list_objects,
    // object actions
    create_object: create_object,
    read_object: read_object,
    update_object: update_object,
    delete_object: delete_object,
    map_object: map_object,
});


function create_bucket(req) {
    var info = {
        name: req.restful_param('bucket')
    };
    var bucket = new Bucket(info);
    return bucket.save();
}


function read_bucket(req) {
    var info = {
        name: req.restful_param('bucket')
    };
    return Bucket.findOne(info);
}


function update_bucket(req) {
    var info = {
        name: req.restful_param('bucket')
    };
    var updates = _.pick(req.body); // no fields can be updated for now
    return Bucket.findOneAndUpdate(info, updates);
}


function delete_bucket(req) {
    var info = {
        name: req.restful_param('bucket')
    };
    return Bucket.findOneAndDelete(info);
}


function list_objects(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    var select = {
        map: 0
    };
    return ObjectMD.find(info, select);
}


function create_object(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
        size: req.restful_param('size'),
    };
    var obj = new ObjectMD(info);
    return obj.save();
}


function read_object(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    var select = {
        map: 0
    };
    return ObjectMD.findOne(info, select);
}


function update_object(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    var updates = _.pick(req.body); // no fields can be updated for now
    return Bucket.findOneAndUpdate(info, updates);
}


function delete_object(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    return Bucket.findOneAndDelete(info);
}


function map_object(req) {
    var info = {
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
        // TODO
    };
    return ObjectMD.findOne(info);
}

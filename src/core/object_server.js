// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var object_api = require('./object_api');
var account_server = require('./account_server');
// db models
var Account = require('./models/account');
var Bucket = require('./models/bucket');
var ObjectMD = require('./models/object_md');
var ObjectMap = require('./models/object_map');
var EdgeNode = require('./models/edge_node');
var EdgeBlock = require('./models/edge_block');


module.exports = new object_api.Server({
    // bucket actions
    create_bucket: create_bucket,
    read_bucket: read_bucket,
    update_bucket: update_bucket,
    delete_bucket: delete_bucket,
    list_bucket_objects: list_bucket_objects,
    // object actions
    create_object: create_object,
    read_object_md: read_object_md,
    update_object_md: update_object_md,
    delete_object: delete_object,
    map_object: map_object,
}, [
    // middleware to verify the account session
    account_server.verify_account_session
]);


function create_bucket(req) {
    var bucket_name = req.restful_param('bucket');
    return Q.fcall(function() {
        var info = {
            account: req.account,
            name: bucket_name,
        };
        return Bucket.create(info);
    }).then(function() {
        return undefined;
    });
}


function read_bucket(req) {
    var bucket_name = req.restful_param('bucket');
    return find_bucket(req.account, bucket_name).then(function(bucket) {
        return _.pick(bucket, 'name');
    });
}


function update_bucket(req) {
    var bucket_name = req.restful_param('bucket');
    return Q.fcall(function() {
        // TODO no fields can be updated for now
        var updates = _.pick(req.restful_params);
        var info = {
            account: req.account,
            name: bucket_name,
        };
        return Bucket.findOneAndUpdate(info, updates).exec();
    }).then(function() {
        return undefined;
    });
}


function delete_bucket(req) {
    var bucket_name = req.restful_param('bucket');
    // TODO mark deleted on objects
    return Q.fcall(function() {
        var info = {
            account: req.account,
            name: bucket_name,
        };
        return Bucket.findOneAndDelete(info).exec();
    }).then(function() {
        return undefined;
    });
}


function list_bucket_objects(req) {
    var bucket_name = req.restful_param('bucket');
    var key = req.restful_param('key');
    return find_bucket(req.account, bucket_name).then(function(bucket) {
        var info = {
            account: req.account,
            bucket: bucket.id,
            key: key,
        };
        return ObjectMD.find(info).exec();
    }).then(function(objects) {
        return _.map(objects, function(o) {
            return _.pick(0, 'key', 'size', 'create_time');
        });
    });
}


function create_object(req) {
    var bucket_name = req.restful_param('bucket');
    var key = req.restful_param('key');
    var size = req.restful_param('size');
    return find_bucket(req.account, bucket_name).then(function(bucket) {
        var info = {
            account: req.account,
            bucket: bucket.id,
            key: key,
            size: size,
        };
        return ObjectMD.create(info);
    }).then(function() {
        return undefined;
    });
}


function read_object_md(req) {
    var info = {
        account: req.account,
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    return Q.fcall(function() {
        return ObjectMD.findOne(info).exec();
    }).then(function() {
        return undefined;
    });
}


function update_object_md(req) {
    var info = {
        account: req.account,
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    // TODO no fields can be updated for now
    var updates = _.pick(req.restful_params);
    return Q.fcall(function() {
        return Bucket.findOneAndUpdate(info, updates).exec();
    }).then(function() {
        return undefined;
    });
}


function delete_object(req) {
    var info = {
        account: req.account,
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
    };
    return Q.fcall(function() {
        return Bucket.findOneAndDelete(info).exec();
    }).then(function() {
        return undefined;
    });
}


function map_object(req) {
    var info = {
        account: req.account,
        bucket: req.restful_param('bucket'),
        key: req.restful_param('key'),
        // TODO
    };
    return Q.fcall(function() {
        return ObjectMD.findOne(info).populate('map').exec();
    }).then(function(object) {
        return _.pick(object, 'key', 'size', 'create_time', 'map');
    });
}

// 10 minutes expiry
var buckets_lru = new LRU(200, 600000, 'buckets_lru');

function find_bucket(account, bucket_name) {
    var info = {
        account: account,
        name: bucket_name,
    };
    return Q.fcall(function() {
        return Bucket.findOne(info).exec();
    }).then(function(bucket) {
        if (!bucket) {
            throw new Error('NO BUCKET ' + bucket_name);
        }
        return bucket;
    });
}

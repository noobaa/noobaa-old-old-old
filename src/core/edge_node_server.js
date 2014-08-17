// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var edge_node_api = require('./edge_node_api');
var account_server = require('./account_server');
// db models
var Account = require('./models/account');
var EdgeNode = require('./models/edge_node');
var EdgeBlock = require('./models/edge_block');


module.exports = new edge_node_api.Server({
    create_edge_node: create_edge_node,
    read_edge_node: read_edge_node,
    update_edge_node: update_edge_node,
    delete_edge_node: delete_edge_node,
}, [
    // middleware to verify the account session before any of this server calls
    account_server.verify_account_session
]);


function create_edge_node(req) {
    var info = _.pick(req.restful_params, 'node');
    info.account = req.account;
    return EdgeNode.create(info);
}


function read_edge_node(req) {
    var info = _.pick(req.restful_params, 'node');
    return EdgeNode.findOne(info);
}


function update_edge_node(req) {
    var info = _.pick(req.restful_params, 'node');
    var updates = _.pick(req.body); // no fields can be updated for now
    return EdgeNode.findOneAndUpdate(info, updates);
}


function delete_edge_node(req) {
    var info = _.pick(req.restful_params, 'node');
    return EdgeNode.findOneAndDelete(info);
}

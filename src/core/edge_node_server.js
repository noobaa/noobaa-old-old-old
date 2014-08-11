// this module is written for both nodejs.
'use strict';

var _ = require('underscore');
var Q = require('q');
var restful_api = require('./restful_api');
var edge_node_api = require('./edge_node_api');
// db models
var Account = require('./models/account');
var EdgeNode = require('./models/edge_node');
var EdgeBlock = require('./models/edge_block');


module.exports = new edge_node_api.Server({
    create_edge_node: create_edge_node,
    read_edge_node: read_edge_node,
    update_edge_node: update_edge_node,
    delete_edge_node: delete_edge_node,
});


function create_edge_node(req) {
    var info = {
        name: req.restful_param('node')
    };
    var node = new EdgeNode(info);
    return node.save();
}


function read_edge_node(req) {
    var info = {
        name: req.restful_param('node')
    };
    return EdgeNode.findOne(info);
}


function update_edge_node(req) {
    var info = {
        name: req.restful_param('node')
    };
    var updates = _.pick(req.body); // no fields can be updated for now
    return EdgeNode.findOneAndUpdate(info, updates);
}


function delete_edge_node(req) {
    var info = {
        name: req.restful_param('node')
    };
    return EdgeNode.findOneAndDelete(info);
}

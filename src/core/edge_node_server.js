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


var edge_node_api_impl = {
    create_edge_node: create_edge_node,
    read_edge_node: read_edge_node,
    update_edge_node: update_edge_node,
    delete_edge_node: delete_edge_node,
};

// exporting all the edge_node_api_impl functions (mostly for testing)
// and also the setup function to be used when creating an express/connect app server.
module.exports = _.extend({}, edge_node_api_impl, {
    setup: setup,
});


// setup the app routes to handle object server on the specified path.
// see restful_api.setup_server() for details about the arguments
function setup(app_router, base_path) {
    restful_api.setup_server(app_router, base_path, edge_node_api, edge_node_api_impl);
}


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



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
    connect_edge_node: connect_edge_node,
    delete_edge_node: delete_edge_node,
}, [
    // middleware to verify the account session before any of this server calls
    account_server.verify_account_session
]);


function connect_edge_node(req) {
    console.log('CONNECT EDGE NODE', req.restful_params);
    var info = _.pick(req.restful_params, 'name', 'ip', 'port');
    info.account = req.account;
    return EdgeNode.create(info).then(function() {
        return undefined;
    });
}


function delete_edge_node(req) {
    var info = _.pick(req.restful_params, 'name');
    return EdgeNode.findOneAndDelete(info).then(function() {
        return undefined;
    });
}

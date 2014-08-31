// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var utilitest = require('../utils/utilitest');

var account_api = require('./account_api');
var account_server = require('./account_server');
var account_client = new account_api.Client({
    path: '/account_api/',
});

var edge_node_api = require('./edge_node_api');
var edge_node_server = require('./edge_node_server');
var edge_node_client = new edge_node_api.Client({
    path: '/edge_node_api/',
});

var DEFAULT_EMAIL = 'coretest@core.test';
var DEFAULT_PASSWORD = 'coretest';

before(function(done) {
    Q.fcall(function() {
        account_server.set_logging();
        account_server.install_routes(utilitest.router, '/account_api/');
        account_client.set_param('port', utilitest.http_port());

        edge_node_server.set_logging();
        edge_node_server.install_routes(utilitest.router, '/edge_node_api/');
        edge_node_client.set_param('port', utilitest.http_port());

        return account_client.create_account({
            email: DEFAULT_EMAIL,
            password: DEFAULT_PASSWORD,
        });
    }).nodeify(done);
});

after(function() {
    account_server.disable_routes();
    edge_node_server.disable_routes();
});

function login_default_account() {
    return account_client.login_account({
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASSWORD,
    });
}

module.exports = {
    login_default_account: login_default_account,
    account_client: account_client,
    edge_node_client: edge_node_client,
};

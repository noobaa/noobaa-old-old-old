// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var utilitest = require('../utils/utilitest');

describe('account_api', function() {

    var account_api = require('./account_api');
    var account_server = require('./account_server');
    var account_client;

    var EMAIL = 'bla@bla.blabla';
    var PASSWORD = 'supersecret';

    before(function() {
        account_server.install_routes(utilitest.router, '/account_api/');
        account_server.set_logging();
        account_client = new account_api.Client({
            port: utilitest.http_port(),
            path: '/account_api/',
        });
    });

    describe('account full flow', function() {

        it('should work', function(done) {
            Q.when().then(function() {
                return account_client.create_account({
                    email: EMAIL,
                    password: PASSWORD,
                });
            }).then(function() {
                return account_client.read_account().then(function(res) {
                    assert.strictEqual(res.data.email, EMAIL);
                });
            }).then(function() {
                return account_client.logout();
            }).then(function() {
                return account_client.authenticate({
                    email: EMAIL,
                    password: PASSWORD,                	
                });
            }).then(function() {
                return account_client.delete_account();
            }).nodeify(done);
        });

    });

});

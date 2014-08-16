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

    describe('create_account', function() {

        it('should work', function(done) {
            account_client.create_account({
                email: EMAIL,
                password: PASSWORD,
            }).nodeify(done);
        });

    });

    describe('read_account', function() {

        it('should work', function(done) {
            account_client.read_account().then(function(res) {
            	assert.strictEqual(res.data.email, EMAIL);
            }).nodeify(done);
        });

    });

});

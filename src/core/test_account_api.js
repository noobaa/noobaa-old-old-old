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

    before(function() {
        account_server.install_routes(utilitest.router, '/account_api');
        account_client = new account_api.Client({
            port: utilitest.http_server.address().port,
            path: '/account_api',
        });
    });

    describe('create_account', function() {

        it('should work', function(done) {
            account_client.create_account({
                email: 'bla bla',
                password: 'tralalala',
            }).then(function(res) {
                console.log('REPLY', res.data);
            }).nodeify(done);
        });

    });

});

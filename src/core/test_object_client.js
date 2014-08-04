// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var assert = require('assert');
var http = require('http');
var express = require('express');


describe('object_client', function() {

    var object_client = require('./object_client');
    var object_api = require('./object_api');
    var rest_server = require('./rest_server');

    // we create a single express app and server to make the test faster,
    // but there's a caveat - setting up routes on the same app has the issue
    // that there is no way to remove/replace middlewares in express, and adding
    // just adds to the end of the queue.
    // do a test that installs impl routes do impl._removed=true to bypass its routes.
    var app = express();
    var server = http.createServer(app);

    before(function(done) {
        server.listen(done);
    });

    after(function() {
        server.close();
    });


    describe('setup', function() {
        it('should work', function() {
            var client = new object_client.ObjectClient();
            assert(client, 'expected a valid client');
        });
    });

    describe('api', function() {

        var BASE_PATH = '/1_base_path';
        var BKT = '1_bucket';
        var KEY = '1_key';
        var PARAMS = {
            bucket: BKT,
            key: KEY
        };
        var REPLY = {
            api: ['IS', {
                fucking: 'aWeSoMe'
            }]
        };
        var ERROR_REPLY = {
            data: 'testing error',
            status: 404,
        };

        // for every api function create a test
        _.each(object_api, function(func_info, func_name) {
            describe(func_name, function() {

                var reply_error = false;
                var impl = {};
                var client;

                before(function() {
                    // init an impl for the currently tested func.
                    // we use a dedicated impl per func so that all the other funcs 
                    // of the impl return error in order to detect calling confusions.
                    impl[func_name] = function(params, callback) {
                        if (reply_error) {
                            callback(ERROR_REPLY);
                        } else {
                            callback(null, REPLY);
                        }
                    };
                    rest_server.fill_impl(object_api, impl);

                    // setup the impl on a server route - 
                    // need a unique route per func because we can't update middlewares, only add.
                    var path = BASE_PATH; // + '_' + func_name;
                    var app_router = new express.Router();
                    rest_server.setup(app_router, '', object_api, impl);
                    app.use(path, app_router);

                    // create a client
                    client = new object_client.ObjectClient({
                        port: server.address().port,
                        path: path,
                    });
                });

                after(function() {
                    // mark the impl removed to bypass its routes
                    impl._removed = true;
                });

                it('should call and get reply', function(done) {
                    reply_error = false;
                    client[func_name](PARAMS).then(function(res) {
                        assert.deepEqual(res.data, REPLY);
                    }).nodeify(done);
                });

                it('should call and get error', function(done) {
                    reply_error = true;
                    client[func_name](PARAMS).then(function(res) {
                        console.log(res);
                        throw 'unexpected';
                    }, function(err) {
                        assert.deepEqual(err.data, ERROR_REPLY.data);
                    }).nodeify(done);
                });

            });
        });
    });


    describe.skip('open_read_stream', function() {
        it('should read object data', function(done) {
            var BASE_PATH = '/1_base_path';
            var BKT = '1_bucket';
            var KEY = '1_key';
            var REPLY = {
                api: ['IS', {
                    fucking: 'aWeSoMe'
                }]
            };
            // TODO
            var client;
            var server;
            var data = '';
            client.open_read_stream({
                bucket: BKT,
                key: KEY,
                start: 0,
                count: 10,
            }).on('data', function(chunk) {
                data += chunk;
            }).on('end', function() {
                assert.deepEqual(data, REPLY);
                server.close();
                done();
            }).on('error', function(err) {
                server.close();
                done(err);
            });
        });
    });


});

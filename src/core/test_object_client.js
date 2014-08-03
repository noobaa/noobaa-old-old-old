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

    describe('setup', function() {
        it('should work', function() {
            var client = new object_client.ObjectClient();
            assert(client, 'expected a valid client');
        });
    });


    // for every api function create a test
    _.each(object_api, function(func_info, func_name) {
        describe(func_name, function() {
            it('should pass the call to the server', test_api_func(func_name));
        });
    });


    function test_api_func(func_name) {
        return function(done) {
            var BASE_PATH = '/1_base_path';
            var BKT = '1_bucket';
            var KEY = '1_key';
            var REPLY = {
                api: ['IS', {
                    fucking: 'aWeSoMe'
                }]
            };
            var impl = {};
            impl[func_name] = function(params, callback) {
                callback(null, REPLY);
            };
            mock_server(BASE_PATH, impl, function(client, server) {
                client[func_name]({
                    bucket: BKT,
                    key: KEY
                }).then(function(res) {
                    assert.deepEqual(res.data, REPLY);
                }).fin(function() {
                    server.close();
                }).nodeify(done);
            });
        };
    }

    function api_not_implemented(params, callback) {
        callback(new Error('api_not_implemented'));
    }

    function mock_server(path, impl, client_callback) {
        // create a mock api impl, add all the functions, either from given impl, 
        // or as unimplemented throwing funcs.
        var api_impl = {};
        _.each(object_api, function(v, k) {
            api_impl[k] = impl[k] || api_not_implemented;
        });
        // setup the server router
        var app_router = express();
        rest_server.setup(app_router, path, object_api, api_impl);
        // create http server and start it
        var server = http.createServer(app_router);
        server.listen(function() {
            // initialize the client to the server's port
            var client = new object_client.ObjectClient({
                port: server.address().port,
                path: path,
            });
            // run the client callback function which should call server.close when done
            client_callback(client, server);
        });
        return server;
    }


    describe.skip('create_object', function() {
        it('should send http request', function(done) {
            var BASE_PATH = '/1_base_path';
            var BKT = '1_bucket';
            var KEY = '1_key';
            var REPLY = {
                api: ['WORKS', {
                    just: 'PERFECTLY'
                }]
            };
            // setup a simple http server and check for the request it receives
            var server = http.createServer(function(req, res) {
                assert.strictEqual(req.method, 'POST'); // create_object is POST
                assert.strictEqual(req.url, BASE_PATH + '/' + BKT + '/' + KEY);
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(REPLY));
            });
            // start the server
            server.listen(function() {
                // create client with the server port
                var client = new object_client.ObjectClient({
                    port: server.address().port,
                    path: BASE_PATH
                });
                // call api
                client.create_object({
                    bucket: BKT,
                    key: KEY
                }).then(function(res) {
                    assert.deepEqual(res.data, REPLY);
                }).fin(function() {
                    server.close();
                }).nodeify(done);
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
            mock_server(BASE_PATH, {
                map_object: function(params, callback) {
                    callback(null, REPLY);
                }
            }, function(client, server) {
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


});

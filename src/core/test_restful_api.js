// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var http = require('http');
var express = require('express');
var express_body_parser = require('body-parser');


describe('restful_api', function() {

    var restful_api = require('./restful_api');

    var test_params_info = {
        param1: {
            type: String,
            required: true,
        },
        param2: {
            type: Number,
            required: true,
        },
        param3: {
            type: String,
            required: true,
        },
        param4: {
            type: Number,
            required: false,
        },
    };
    var test_api = restful_api.define_api({
        get: {
            method: 'GET',
            path: '/:param1/and/also/:param2',
            params: test_params_info,
        },
        post: {
            method: 'POST',
            path: '/:param1/and/also/:param2',
            params: test_params_info,
        },
        put: {
            method: 'PUT',
            path: '/:param1/and/also/:param3',
            params: test_params_info,
        },
        delete: {
            method: 'DELETE',
            path: '/all/:param2',
            params: test_params_info,
        },
    });

    describe('define_api', function() {

        it('should detect api with collision paths', function() {
            assert.throws(function() {
                restful_api.define_api({
                    a: {
                        method: 'GET',
                        path: '/'
                    },
                    b: {
                        method: 'GET',
                        path: '/'
                    }
                });
            });
        });

    });

    describe('setup_server', function() {

        it('should work on server inited properly', function() {
            // init the server and add extra propoerty and check that it works
            var server = {};
            restful_api.init_server(test_api, server);
            restful_api.setup_server(test_api, server);
            server.bla_bla = 1;
            server.router(new express.Router());
        });

        it('should detect missing api func', function() {
            // check that missing functions are detected
            assert.throws(function() {
                var server = restful_api.setup_server(test_api, {});
                server.router(new express.Router());
            }, Error);
        });

    });


    describe('test_api round trip', function() {

        // we create a single express app and server to make the test faster,
        // but there's a caveat - setting up routes on the same app has the issue
        // that there is no way to remove/replace middlewares in express, and adding
        // just adds to the end of the queue.
        // do a test that installs server_impl routes do server_impl._removed=true 
        // to bypass its routes.
        var app = express();
        // must install a body parser for restful server to work
        app.use(express_body_parser());
        var http_server = http.createServer(app);

        var BASE_PATH = '/test/base/path';
        var PARAMS = {
            param1: '1',
            param2: 2,
            param3: '3', //new Date(),
            param4: 4,
        };
        var REPLY = {
            rest: ['IS', {
                fucking: 'aWeSoMe'
            }]
        };
        var ERROR_REPLY = {
            data: 'testing error',
            status: 404,
        };

        var client = {};
        restful_api.setup_client(client, test_api);

        before(function(done) {
            http_server.listen(done);
        });

        after(function() {
            http_server.close();
        });


        // create a test for every api function
        _.each(test_api, function(func_info, func_name) {

            describe(func_name, function() {

                var reply_error = false;
                var server_impl;

                before(function() {
                    // init a server_impl for the currently tested func.
                    // we use a dedicated server_impl per func so that all the other funcs 
                    // of the server_impl return error in order to detect calling confusions.
                    server_impl = restful_api.init_server(test_api, {});
                    server_impl[func_name] = function(req) {
                        _.each(PARAMS, function(param, name) {
                            assert.deepEqual(param, req.restful_param(name));
                        });
                        if (reply_error) {
                            return Q.reject(ERROR_REPLY);
                        } else {
                            return Q.when(REPLY);
                        }
                    };

                    // setup the server_impl on a server route - 
                    // need a unique route per func because we can't update middlewares, only add.
                    var path = BASE_PATH; // + '_' + func_name;
                    restful_api.setup_server(test_api, server_impl);
                    app.use(path, server_impl.router(new express.Router()));

                    // init the client params
                    restful_api.init_client(client, {
                        port: http_server.address().port,
                        path: path,
                    });
                });

                after(function() {
                    // mark the server_impl removed to bypass its routes,
                    // so that the next api function can put its routes too.
                    server_impl._removed = true;
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

});

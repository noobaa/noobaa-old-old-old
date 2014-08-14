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
            type: Boolean,
            required: true,
        },
        param4: {
            type: Date,
            required: true,
        },
        param5: {
            type: Array,
            required: false,
        },
    };
    var test_reply_info = {
        rest: {
            type: Array,
            required: true,
        }
    };
    var BASE_PATH = '/test/base/path';
    var PARAMS = {
        param1: '1',
        param2: 2,
        param3: true,
        param4: new Date(),
        param5: [1, 2, 3],
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
    var test_api = restful_api.define_api({
        name: 'Test',
        methods: {
            get: {
                method: 'GET',
                path: '/:param1/and/also/:param2',
                params: test_params_info,
                reply: test_reply_info,
            },
            post: {
                method: 'POST',
                path: '/:param1/and/also/:param2',
                params: test_params_info,
                reply: test_reply_info,
            },
            put: {
                method: 'PUT',
                path: '/:param1/and/also/:param3',
                params: test_params_info,
                reply: test_reply_info,
            },
            delete: {
                method: 'DELETE',
                path: '/all/:param2',
                params: test_params_info,
                reply: test_reply_info,
            },
        }
    });


    describe('define_api', function() {

        it('should detect api with collision paths', function() {
            assert.throws(function() {
                restful_api.define_api({
                    methods: {
                        a: {
                            method: 'GET',
                            path: '/'
                        },
                        b: {
                            method: 'GET',
                            path: '/'
                        }
                    }
                });
            });
        });

    });

    describe('Server', function() {

        it('should work on server inited properly', function() {
            // init the server and add extra propoerty and check that it works
            var router = new express.Router();
            var server = new test_api.Server({}, 'allow_missing_methods');
            server.install_routes(router);
        });

        it('should detect missing api func', function() {
            // check that missing functions are detected
            assert.throws(function() {
                var server = new test_api.Server({});
            }, Error);
        });

    });


    describe('test_api round trip', function() {

        // we create a single express app and server to make the test faster,
        // but there's a caveat - setting up routes on the same app has the issue
        // that there is no way to remove/replace middlewares in express, and adding
        // just adds to the end of the queue.
        var app = express();
        // must install a body parser for restful server to work
        app.use(express_body_parser());
        var http_server = http.createServer(app);

        before(function(done) {
            http_server.listen(done);
        });

        after(function() {
            http_server.close();
        });


        // create a test for every api function
        _.each(test_api.methods, function(func_info, func_name) {

            describe(func_name, function() {

                var reply_error = false;
                var server;
                var client;

                before(function() {
                    // init a server for the currently tested func.
                    // we use a dedicated server per func so that all the other funcs 
                    // of the server return error in order to detect calling confusions.
                    var methods = {};
                    methods[func_name] = function(req) {
                        // console.log('TEST SERVER REQUEST');
                        _.each(PARAMS, function(param, name) {
                            assert.deepEqual(param, req.restful_param(name));
                        });
                        if (reply_error) {
                            return Q.reject(ERROR_REPLY);
                        } else {
                            return Q.when(REPLY);
                        }
                    };
                    server = new test_api.Server(methods, 'allow_missing_methods');
                    var router = new express.Router();
                    server.install_routes(router);
                    app.use(BASE_PATH, router);
                    // server.install_routes(app, BASE_PATH);
                    // server.set_logging();

                    client = new test_api.Client({
                        port: http_server.address().port,
                        path: BASE_PATH,
                    });
                });

                after(function() {
                    // disable the server to bypass its routes,
                    // so that the next api function can put its routes too.
                    server.disable_routes();
                });

                it('should call and get reply', function(done) {
                    reply_error = false;
                    client[func_name](PARAMS).then(function(res) {
                        assert.deepEqual(res.data, REPLY);
                    }, function(err) {
                        console.log('UNEXPECTED ERROR', err, err.stack);
                        throw 'UNEXPECTED ERROR';
                    }).nodeify(done);
                });

                it('should call and get error', function(done) {
                    reply_error = true;
                    client[func_name](PARAMS).then(function(res) {
                        console.log('UNEXPECTED REPLY', res);
                        throw 'UNEXPECTED REPLY';
                    }, function(err) {
                        assert.deepEqual(err.data, ERROR_REPLY.data);
                    }).nodeify(done);
                });

            });
        });
    });

});

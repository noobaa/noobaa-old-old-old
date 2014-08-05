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
    var account_api = require('./account_api');
    var object_api = require('./object_api');
    var edge_node_api = require('./edge_node_api');

    describe('setup_server', function() {

        it('should detect mismatch impl', function() {
            var app_router = new express.Router();
            var server_impl = {};
            // check that missing functions are detected
            assert.throws(function() {
                restful_api.setup_server(app_router, '', object_api, server_impl);
            }, Error);
            // init the server_impl and add extra propoerty and check that it works
            restful_api.init_server(object_api, server_impl);
            server_impl.bla_bla = 1;
            assert.doesNotThrow(function() {
                restful_api.setup_server(app_router, '', object_api, server_impl);
            }, Error);
        });

    });

    describe('apis', function() {
        var VALID_METHODS = {
            GET: 1,
            PUT: 1,
            POST: 1,
            DELETE: 1
        };
        var PATH_ITEM_NORMAL = /^\S*$/;
        var PATH_ITEM_PARAM = /^:\S*$/;

        _.each({
            account_api: account_api,
            object_api: object_api,
            edge_node_api: edge_node_api,
        }, function(api, api_name) {

            describe(api_name, function() {

                it('should contain api functions with valid method and path', function() {
                    var method_and_path_collide = {};

                    _.each(api, function(v, k) {

                        assert(v.method in VALID_METHODS,
                            'unexpected method: ' + k + ' -> ' + v);

                        assert.strictEqual(typeof(v.path), 'string',
                            'unexpected path type: ' + k + ' -> ' + v);

                        var path_items = v.path.split('/');

                        _.each(path_items, function(p) {
                            assert(PATH_ITEM_PARAM.test(p) || PATH_ITEM_NORMAL.test(p),
                                'invalid path item: ' + k + ' -> ' + v);
                        });

                        // test for colliding method+path
                        var collision = method_and_path_collide[v.method + v.path];
                        assert(!collision, 'collision of method+path: ' + k + ' ~ ' + collision);
                        method_and_path_collide[v.method + v.path] = k;
                    });
                });
            });
        });
    });



    describe('object_api round trip', function() {
        // we create a single express app and server to make the test faster,
        // but there's a caveat - setting up routes on the same app has the issue
        // that there is no way to remove/replace middlewares in express, and adding
        // just adds to the end of the queue.
        // do a test that installs server_impl routes do server_impl._removed=true 
        // to bypass its routes.
        var app = express();
        // must install a body parser for restful server to work
        app.use(express_body_parser());
        var server = http.createServer(app);

        var BASE_PATH = '/1_base_path';
        var PARAMS = {
            bucket: '1_bucket',
            key: '1_key'
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
        restful_api.setup_client(client, object_api);

        before(function(done) {
            server.listen(done);
        });

        after(function() {
            server.close();
        });


        // create a test for every api function
        _.each(object_api, function(func_info, func_name) {

            describe(func_name, function() {

                var reply_error = false;
                var server_impl = {
                    // skip validations because the test sends extra params automatically
                    _skip_api_params_validation: true,
                };

                before(function() {
                    // init a server_impl for the currently tested func.
                    // we use a dedicated server_impl per func so that all the other funcs 
                    // of the server_impl return error in order to detect calling confusions.
                    server_impl[func_name] = function(req) {
                        var params = _.extend({}, req.query, req.body, req.params);
                        assert.deepEqual(params, PARAMS);
                        if (reply_error) {
                            return Q.reject(ERROR_REPLY);
                        } else {
                            return Q.when(REPLY);
                        }
                    };
                    restful_api.init_server(object_api, server_impl);

                    // setup the server_impl on a server route - 
                    // need a unique route per func because we can't update middlewares, only add.
                    var path = BASE_PATH; // + '_' + func_name;
                    var app_router = new express.Router();
                    restful_api.setup_server(app_router, '', object_api, server_impl);
                    app.use(path, app_router);

                    // init the client params
                    restful_api.init_client(client, {
                        port: server.address().port,
                        path: path,
                        // skip validations because the test sends extra params automatically
                        _skip_api_params_validation: true,
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

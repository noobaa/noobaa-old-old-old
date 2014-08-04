// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var assert = require('assert');
var express = require('express');


describe('object_server', function() {

    var object_server = require('./object_server');
    var object_api = require('./object_api');
    var rest_server = require('./rest_server');

    describe('setup', function() {

        it('should work on mock router', function() {
            var app_router = {
                all: function() {},
                get: function() {},
                put: function() {},
                post: function() {},
                delete: function() {},
            };
            object_server.setup(app_router, '/');
            assert(app_router);
        });

        it('should work on express app', function() {
            var app = express();
            object_server.setup(app, '/');
            assert(app);
        });

    });

    describe('rest_server', function() {

        it('should detect mismatch impl', function() {
            var app_router = new express.Router();
            var impl = {};
            _.each(object_api, function(v, k) {
                impl[k] = function(params, callback) {};
            });
            impl.bla_bla = 1;
            assert.throws(function() {
                rest_server.setup(app_router, '', object_api, impl);
            }, Error);
        });

    });

});

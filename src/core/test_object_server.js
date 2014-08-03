// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var assert = require('assert');
var express = require('express');

describe('object_server', function() {

    var object_server = require('./object_server');

    it('should setup on mock router', function() {
        var app_router = {
            get: function() {},
            put: function() {},
            post: function() {},
            delete: function() {},
        };
        object_server.setup(app_router, '/');
        assert(app_router);
    });

    it('should not fail to run setup on express app', function() {
        var app = express();
        object_server.setup(app, '/');
        assert(app);
    });

});

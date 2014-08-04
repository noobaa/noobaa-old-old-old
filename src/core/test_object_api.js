// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var assert = require('assert');


describe('object_api', function() {

    var object_api = require('./object_api');

    it('should contain api functions with valid method and path', function() {
        var VALID_METHODS = {
            GET: 1,
            PUT: 1,
            POST: 1,
            DELETE: 1
        };
        var PATH_ITEM_NORMAL = /^\S*$/;
        var PATH_ITEM_PARAM = /^:\S*$/;
        var method_and_path_collide = {};
        _.each(object_api, function(v, k) {

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

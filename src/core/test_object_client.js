// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var http = require('http');
var express = require('express');


describe('object_client', function() {

    var object_client = require('./object_client');
    var object_api = require('./object_api');

    describe('setup', function() {
        it('should work', function() {
            var client = new object_client.ObjectClient();
            assert(client, 'expected a valid client');
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
            var client = new object_client.ObjectClient();
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
                done();
            }).on('error', function(err) {
                done(err);
            });
        });
    });


});

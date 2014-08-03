// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var assert = require('assert');

describe('object_client', function() {

    var object_client = require('./object_client');

    it('should run setup without failing', function() {
        var client_params = {};
        var client = new object_client.ObjectClient(client_params);
        assert(client, 'expected a valid client');
    });

});

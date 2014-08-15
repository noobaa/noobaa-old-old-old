// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var http = require('http');
var express = require('express');
var express_body_parser = require('body-parser');
var mongoose = require('mongoose');

// we create a single express app and server to make the test faster,
// but there's a caveat - setting up routes on the same app has the issue
// that there is no way to remove/replace middlewares in express, and adding
// just adds to the end of the queue.
var app = express();
// must install a body parser for restful server to work
app.use(express_body_parser()); 
var router = new express.Router();
app.use('/', router);

var http_server = http.createServer(app);

before(function(done) {
    Q.when().then(function() {
        console.log('HAHA');
        var defer = Q.defer();
        mongoose.connection.on('open', defer.resolve);
        mongoose.connect('mongodb://localhost/test');
        return defer.promise;
    }).then(function() {
        console.log('HAHA2');
        // dropDatabase to clear the previous test
        return Q.npost(mongoose.connection.db, 'dropDatabase');
    }).then(function() {
        console.log('HAHA3');
        return Q.npost(http_server, 'listen');
    }).then(function() {
        console.log('HAHA4', http_server.address());
    }).nodeify(done);
});

after(function() {
    console.log('HAHA AFTER');
    mongoose.disconnect();
    http_server.close();
});

module.exports = {
    router: router,
    app: app,
    http_server: http_server,
};

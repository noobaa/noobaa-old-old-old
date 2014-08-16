// make jshint ignore mocha globals
/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

var _ = require('underscore');
var Q = require('q');
var assert = require('assert');
var http = require('http');
var express = require('express');
var express_body_parser = require('body-parser');
var express_cookie_parser = require('cookie-parser');
var express_cookie_session = require('cookie-session');
var express_method_override = require('method-override');
var mongoose = require('mongoose');

// we create a single express app and server to make the test faster,
// but there's a caveat - setting up routes on the same app has the issue
// that there is no way to remove/replace middlewares in express, and adding
// just adds to the end of the queue.
var app = express();
var COOKIE_SECRET = 'utilitest cookie secret';
app.use(express_cookie_parser(COOKIE_SECRET));
// must install a body parser for restful server to work
app.use(express_body_parser());
app.use(express_method_override());
app.use(express_cookie_session({
    key: 'utilitest_session',
    secret: COOKIE_SECRET,
    maxage: 356 * 24 * 60 * 60 * 1000 // 1 year
}));
var router = new express.Router();
app.use(router);

var http_server = http.createServer(app);

// initlizations before the tests
before(function(done) {
    Q.when().then(function() {
        var defer = Q.defer();
        mongoose.connection.on('open', defer.resolve);
        mongoose.connect('mongodb://localhost/test');
        return defer.promise;
    }).then(function() {
        // dropDatabase to clear the previous test
        return Q.npost(mongoose.connection.db, 'dropDatabase');
    }).then(function() {
        return Q.npost(http_server, 'listen');
    }).then(function() {
        console.log('* utilitest server listening on port ', http_server.address().port);
        console.log();
    }, function(err) {
        console.error('utilitest ERROR', err);
    }).nodeify(done);
});

after(function() {
    mongoose.disconnect();
    http_server.close();
});

module.exports = {
    http_port: function() {
        return http_server.address().port;
    },
    router: router,
    app: app,
};

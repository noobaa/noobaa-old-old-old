'use strict';
var mongoose = require('mongoose');
var events = require('events');
var _ = require('lodash');

var ev = new events.EventsEmitter();

process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';

mongoose.connection.on('open', function() {
	ev.emit('open');
});
mongoose.connection.on('close', function() {
	ev.emit('close');
});

var db;

exports.setup = function(callback) {
	// return callback();
	try {
		ev.once('open', function() {
			console.log('connection open');
			callback();
		});

		db = mongoose.connect(process.env.MONGOHQ_URL);
		console.log('Started connection, waiting for it to open');
	} catch (err) {
		console.log('Setting up failed:', err.message);
		// test.done();
		callback(err);
	}
};

exports.teardown = function(callback) {
	console.log('In tearDown');
	try {
		ev.once('close', function() {
			console.log('connection closed');
			callback();
		});
		console.log('Closing connection');

		// Disconnects all connections.
		mongoose.disconnect();
	} catch (err) {
		console.log('Tearing down failed:', err.message);
		callback(err);
	}
};
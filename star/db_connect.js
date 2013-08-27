var mongoose = require('mongoose');

var Backbone = require('backbone');
var _ = require('underscore');

var ev = _.clone(Backbone.Events);

process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';

mongoose.connection.on('open', function() {
	ev.trigger('open');
});
mongoose.connection.on('close', function() {
	ev.trigger('close');
});

var db;

exports.setup = function(callback) {
	// return callback();
	try {
		var cb = function() {
			console.log('connection open');
			ev.off('open', cb);
			callback();
		};
		ev.on('open', cb);

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
		var cb = function() {
			console.log('connection closed');
			ev.off('close', cb);
			callback();
		};
		ev.on('close', cb);
		console.log('Closing connection');

		// Disconnects all connections.
		mongoose.disconnect();
	} catch (err) {
		console.log('Tearing down failed:', err.message);
		callback(err);
	}
};
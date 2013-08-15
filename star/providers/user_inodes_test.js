/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
var User = require('../models/user').User;
var user_inodes = require('./user_inodes');


var db;

process.env.FACEBOOK_APP_ID = '123';
process.env.FACEBOOK_SECRET = 'sec';
process.env.FACEBOOK_AUTHORIZED_URL = 'callback';
process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';

var rand_fb_id = Math.floor((Math.random() * 100000) + 1);

exports.test_user_inodes = {
	setUp: function(callback) {
		try {
			//db.connection.on('open', function() {
			mongoose.connection.on('open', function() {
				console.log('Opened connection');
				callback();
			});

			db = mongoose.connect(process.env.MONGOHQ_URL);
			console.log('Started connection, waiting for it to open');
		} catch (err) {
			console.log('Setting up failed:', err.message);
		}
	},

	'get yuvals quota': function(test) {
		User.findOne({
			'fb.first_name': 'Yuval'
		}, function(err, user) {
			if (err) {
				console.log('error' + err);
				test.ifError(err);
				return test.done();
			}
			console.log(user.id);
			user_inodes.get_user_usage_bytes(user.id, function(err, result) {
				console.log(result);
				test.notEqual(result, 0, 'Quota for user was zero');
				test.ifError(err);
				test.done();
			});
		});
	},

	tearDown: function(callback) {
		console.log('In tearDown');
		try {
			console.log('Closing connection');
			db.disconnect();
			callback();
		} catch (err) {
			console.log('Tearing down failed:', err.message);
		}
	},

};
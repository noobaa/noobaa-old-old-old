/*jslint node: true */
'use strict';

var db_connect = require('../db_connect');
var User = require('../models/user').User;
var user_inodes = require('./user_inodes');


process.env.FACEBOOK_APP_ID = '123';
process.env.FACEBOOK_SECRET = 'sec';
process.env.FACEBOOK_AUTHORIZED_URL = 'callback';

var rand_fb_id = Math.floor((Math.random() * 100000) + 1);

exports.test_user_inodes = {
	setUp: db_connect.setup,
	tearDown: db_connect.teardown,

	'get yuvals quota': function(test) {
		User.findOne({
			'fb.first_name': 'Yuval'
		}, function(err, user) {
			if (err) {
				console.log('error' + err);
				test.ifError(err);
				return test.done();
			}
			// console.log(user.id);
			user_inodes.get_user_usage_bytes(user.id, function(err, result) {
				// console.log(result);
				test.notEqual(result, 0, 'Quota for user was zero');
				test.ifError(err);
				test.done();
			});
		});
	},

};
/*jslint node: true */
'use strict';

process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err + err.stack);
});

var async = require('async');
var db_connect = require('../db_connect');
var test_common = require('../test_common');
var User = require('../models/user').User;
var Inode = require('../models/inode').Inode;
var user_inodes = require('./user_inodes');

exports.test_user_inodes = {
	setUp: db_connect.setup,
	tearDown: db_connect.teardown,

	'get random user quota': function(test) {
		async.waterfall([
			//get random file to copy.
			//no ghost ref - curretnly 
			function(next) {
				return test_common.get_rand_entry(Inode, {
					isdir: false
				}, next);
			},
			function(inode, next) {
				return user_inodes.get_user_usage_bytes(inode.owner, next);
			},
		], function(err, result) {
			// console.log(result);
			test.notEqual(result, 0, 'Quota for user was zero');
			test.ifError(err);
			test.done();
		});
	},
};
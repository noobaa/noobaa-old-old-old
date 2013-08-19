/*jslint node: true */
'use strict';


process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err + err.stack);
});

process.env.FACEBOOK_APP_ID = '123';
process.env.FACEBOOK_SECRET = 'sec';
process.env.FACEBOOK_AUTHORIZED_URL = 'callback';
process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';


var mongoose = require('mongoose');
var User = require('../models/user').User;
var Inode = require('../models/inode').Inode;
var inode_api = require('./inode_api');
//var user_inodes = require('./user_inodes');
var async = require('async');

var db;

var rand_fb_id = Math.floor((Math.random() * 100000) + 1);

function get_rand_entry(model, selection, callback) {
	async.waterfall([
		//there doens't sees to be a good way to get a random record. 
		//http://stackoverflow.com/questions/2824157/random-record-from-mongodb
		function(next) {
			model.find(selection, {
				_id: 1
			}, next);
		},
		function(ids, next) {
			// console.log(ids);
			var rand_id = ids[Math.floor(Math.random() * ids.length)];
			// console.log(rand_id);
			model.findById(rand_id._id, next);
		},
/*		// the following functin is really not requried but is useful for debug.
		function(entry, next) {
			console.log(entry);
			next(null, user);
		},
*/	], callback);

}

exports.test_inodes_api = {
	setUp: function(callback) {
		try {
			//db.connection.on('open', function() {
			mongoose.connection.on('open', function() {
				console.log('Opened connection');
				callback();
			});

			db = mongoose.connect(process.env.MONGOHQ_URL);
			console.log('\nStarted connection, waiting for it to open');
		} catch (err) {
			console.log('Setting up failed:', err.message);
		}
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

	'testing folder creation ': function(test) {
		console.log('111111111111111');
		test.done();
		/*

		var inode_id;
		var luser;
		async.waterfall([
				//get random user
				function(next) {
					get_rand_entry(User, {}, next);
				},
				//get random dir of that user
				function(user, next) {
					luser = user;

					get_rand_entry(Inode, {
						isdir: true,
						owner: user._id,
						name: {
							$exists: true
						},
					}, next);
				},
				function(parent_dir, next) {
					//no clear why I couldn't set the lenght of the string to be variable
					// var rand_len = Math.floor(Math.random() * 255) + 1;
					// console.log(rand_len);
					var inode = new Inode({
						owner: luser._id,
						parent: parent_dir._id,
						//TODO add a random name
						// name: 'RandomName',	
						name: Math.random().toString(36).substring(7),
						isdir: true,
					});
					inode_id = inode._id;
					return inode_api.inode_create_action(inode, null, luser, null, next);
				},
				function(inode, next) {
					// remove the crated directory
					return inode_api.inode_delete_action(inode_id, luser._id, next);
				}
			],

			function(err, result) {
				console.log(result);
				test.ifError(err);
				test.done();
			});
*/
	},

};
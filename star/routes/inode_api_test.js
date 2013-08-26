/*jslint node: true */
'use strict';

process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err + err.stack);
});

var db_connect = require('../db_connect');
var test_common = require('../test_common');

// process.env.FACEBOOK_APP_ID = '123';
// process.env.FACEBOOK_SECRET = 'sec';
// process.env.FACEBOOK_AUTHORIZED_URL = 'callback';
// process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';

var User = require('../models/user').User;
var Inode = require('../models/inode').Inode;
var inode_api = require('./inode_api');
var async = require('async');

exports.test_inodes_api = {
	setUp: db_connect.setup,
	tearDown: db_connect.teardown,

	'testing inode copy with no ghosts': function(test) {
		test.expect(1);
		async.waterfall([
			//get random file to copy.
			//no ghost ref - curretnly 
			function(next) {
				return test_common.get_rand_entry(Inode, {
					name: {
						$ne: 'Shared With Me'
					},
					ghost_ref: {
						$exists: false
					}
				}, next);
			},

			//get random folder to copy the file to.
			//it needs to be a directory
			//not the SWM directory
			//no ghost ref
			function(inode, next) {
				test_common.get_rand_entry(Inode, {
					isdir: true,
					name: {
						$ne: 'Shared With Me'
					},
					ghost_ref: {
						$exists: false
					}
				}, function(err, new_parent) {
					return next(null, inode, new_parent);
				});
			},
			function(inode, new_parent, next) {
				console.log('Orig inode: \n', inode);
				console.log('New parent: \n', new_parent);
				// return next(null);
				// return inode_api.create_inode_copy(inode, new_parent, new_name, next);
				return inode_api.create_inode_copy(inode, new_parent, '', next);

			}

		], function(err, result) {
			test.ifError(err);
			console.log('new inode: \n', result);
			test.done();
		});

	},


	'testing inode copy with ghosts should fail': function(test) {
		test.expect(1);
		async.waterfall([
			//get random file to copy.
			//no ghost ref - curretnly 
			function(next) {
				return test_common.get_rand_entry(Inode, {
					name: {
						$ne: 'Shared With Me'
					},
					ghost_ref: {
						$exists: true
					}
				}, next);
			},

			//get random folder to copy the file to.
			//it needs to be a directory
			//not the SWM directory
			//no ghost ref
			function(inode, next) {
				test_common.get_rand_entry(Inode, {
					isdir: true,
					name: {
						$ne: 'Shared With Me'
					},
					ghost_ref: {
						$exists: false
					}
				}, function(err, new_parent) {
					return next(null, inode, new_parent);
				});
			},
			function(inode, new_parent, next) {
				console.log('Orig inode: \n', inode);
				console.log('New parent: \n', new_parent);
				// return next(null);
				// return inode_api.create_inode_copy(inode, new_parent, new_name, next);
				return inode_api.create_inode_copy(inode, new_parent, '', next);

			}

		], function(err, result) {
			test.deepEqual(err, inode_api.ERR_CANT_COPY_SWM);
			console.log('new inode: \n', result);
			test.done();
		});

	},

	'testing folder creation ': function(test) {
		var inode_id;
		var luser;
		async.waterfall([
			//get random user
			function(next) {
				test_common.get_rand_entry(User, {}, next);
			},
			//get random dir of that user
			function(user, next) {
				luser = user;

				test_common.get_rand_entry(Inode, {
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
		], function(err, result) {
			// console.log(result);
			test.ifError(err);
			test.done();
		});
	},
};
/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var Inodes = require('../models/inode').Inode;
var Device = require('../models/device.js').Device;
var user_inodes = require('../providers/user_inodes');
var email = require('./email');
var mongoose = require('mongoose');

function fetch_users_and_devices(callback) {
	return async.parallel({
			//get all users
			users: User.find.bind(User, {
				$query: {},
				$orderby: {
					'_id': -1
				}
			}),
			//get all devices
			devices: Device.find.bind(Device, {}, {
				updates_stats: 0
			}),
			//get the number of files (pointing at fobj) per user
			files: function(cb) {
				Inodes.aggregate(
					[{
						$match: {
							fobj: {
								$exists: true
							}
						}
					}, {
						$group: {
							_id: "$owner",
							num: {
								$sum: 1
							}
						}
					}], cb);
			},
		},
		callback);
}

function merge_users_and_devices(result, callback) {
	var user_plain_obj;
	var merge_users = {};
	return async.waterfall([
		function(next) {
			async.eachSeries(result.users, function(u, cb) {
				// use toObject to convert from mongoose doc
				// which restricts the toJSON() properties to the schema only
				user_plain_obj = u.toObject();
				user_plain_obj.name = u.get_name();
				user_inodes.get_user_usage_bytes(user_plain_obj._id, function(err, bytes) {
					if (!err) {
						user_plain_obj.consumption = bytes;
						merge_users[u._id] = user_plain_obj;
						return cb(null);
					}
					return cb(err);
				});
			}, next);
		},
		function(next) {
			_.each(result.devices, function(d) {
				var u = merge_users[d.owner];
				if (!u) {
					u = merge_users[d.owner] = {};
				}
				u.devices = u.devices || {};
				u.devices[d._id] = d.toObject();
			});

			_.each(result.files, function(f) {
				var u = merge_users[f._id]; //currenlty _id is the file owner. Didn't manage to do it differently in the aggregate
				if (u) {
					u.files = f.num;
				}
			});
			next(null, merge_users);
		},
	], callback);
}

exports.admin_view = function(req, res, next_err_handler) {
	async.waterfall([

		fetch_users_and_devices,

		function(result, next) {
			var ctx = common_api.page_context(req);
			ctx.users = merge_users_and_devices(result);
			return merge_users_and_devices(result, function(err, users) {
				ctx.users = users;
				return next(null, res.render('adminoobaa.html', ctx));
			});
			// on successful render, stop and don't call next
			// to allow using this as route handler.
		}
	], next_err_handler);
};

exports.admin_update = function(req, res) {
	// receiving array of updates and running them all in parallel
	async.each(req.body.updates, function(data, next) {
		// for now only supported updates are user alpha_tester change
		var user_id = data.user_id;
		var args = _.pick(data.args, 'alpha_tester', 'quota');
		console.log('ADMIN UPDATE', user_id, args);
		return User.findByIdAndUpdate(user_id, args, function(err, user) {
			if (args.alpha_tester) {
				return email.send_alpha_approved_notification(user, function(err, rejection) {
					if (err) {
						console.log(err);
					}
					return next(null);
				});
			} else {
				return next(null);
			}

		});
	}, common_api.reply_callback(req, res, 'ADMIN UPDATE'));
};
/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var Inodes = require('../models/inode').Inode;
var Device = require('../models/device.js').Device;
var TrackEvent = require('../models/track_event').TrackEvent;
var user_inodes = require('./user_inodes');
var email = require('./email');
var mongoose = require('mongoose');


exports.admin_get_users = function(req, res) {

	return async.waterfall([

		function(next) {
			return async.parallel({
				// get all users
				users: User.find.bind(User, {
					$query: {},
					$orderby: {
						'_id': -1
					}
				}),
				// get all devices
				devices: Device.find.bind(Device, {}, {
					updates_stats: 0
				}),
				// get the number of files (pointing at fobj) per user
				files: function(cb) {
					Inodes.aggregate([{
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
			}, next);
		},

		function(result, next) {
			var merge_users = {};
			_.each(result.users, function(u) {
				// use toObject to convert from mongoose doc
				// which restricts the toJSON() properties to the schema only
				var user_plain_obj = u.toObject();
				user_plain_obj.name = u.get_name();
				merge_users[u._id] = user_plain_obj;
			});
			_.each(result.devices, function(d) {
				var u = merge_users[d.owner];
				if (!u) {
					u = merge_users[d.owner] = {};
				}
				u.devices = u.devices || {};
				u.devices[d._id] = d.toObject();
			});
			_.each(result.files, function(f) {
				// currenlty _id is the file owner. 
				// didn't manage to do it differently in the aggregate
				var u = merge_users[f._id];
				if (u) {
					u.files = f.num;
				}
			});
			return next(null, merge_users);
		}

	], common_api.reply_callback(req, res, 'ADMIN GET USERS'));
};


exports.admin_get_user_usage = function(req, res) {

	var user_id = req.params.user_id;
	return async.waterfall([

		function(next) {
			user_inodes.get_user_usage_bytes(user_id, next);
		},

		function(usage, next) {
			return next(null, {
				usage: usage
			});
		}

	], common_api.reply_callback(req, res, 'ADMIN GET USAGE'));
};


exports.admin_update = function(req, res) {
	// receiving array of updates and running them all in parallel
	async.each(req.body.updates, function(data, next) {
		// for now only supported updates are user alpha_tester change
		var user_id = data.user_id;
		var args = _.pick(data.args, 'alpha_tester', 'quota', 'email_policy');
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


exports.admin_get_tracks = function(req, res) {
	var match1;

	var project1 = {
		_id: 0,
		event: 1,
		time: 1,
		ml: {
			$millisecond: '$time'
		}
	};

	var project2 = {
		event: 1,
		time: {
			$subtract: ['$time', {
				$add: ['$ml']
			}]
		}
	};

	var group1;

	var group2 = {
		_id: {
			event: '$event',
			time: '$time',
		},
		count: {
			$sum: 1
		}
	};

	if (req.body.from) {
		match1 = {
			time: {
				$gte: new Date(req.body.from)
			}
		};
	}
	if (req.body.till) {
		match1 = match1 || {
			time: {}
		};
		match1.time.$lt = new Date(req.body.till);
	}

	if (req.body.uniq_user) {
		project1.user = '$user.id';
		project2.user = 1;
		group1 = {
			_id: {
				event: '$event',
				time: '$time',
				user: '$user'
			}
		};
	}
	if (req.body.uniq_ip) {
		project1.ip = '$req.ip';
		project2.ip = 1;
		group1 = group1 || {
			_id: {
				event: '$event',
				time: '$time'
			}
		};
		group1._id.ip = '$ip';
	}
	if (group1) {
		group2._id.event = '$_id.event';
		group2._id.time = '$_id.time';
	}

	var resolutions = {
		second: 1,
		minute: 2,
		hour: 3,
		day: 4,
		week: 5,
		month: 6
	};
	var resolution = resolutions[req.body.resolution] || 4; // days by default
	if (resolution > 1) {
		// truncate seconds
		project1.s = {
			$second: '$time'
		};
		project2.time.$subtract[1].$add.push({
			$multiply: ['$s', 1000]
		});
	}
	if (resolution > 2) {
		// truncate minute
		project1.m = {
			$minute: '$time'
		};
		project2.time.$subtract[1].$add.push({
			$multiply: ['$m', 60000]
		});
	}
	if (resolution > 3) {
		// truncate hours
		project1.h = {
			$hour: '$time'
		};
		project2.time.$subtract[1].$add.push({
			$multiply: ['$h', 3600000]
		});
	}
	if (resolution > 4) {
		// truncate week days
		project1.dw = {
			$subtract: [{
					$dayOfWeek: '$time'
				},
				1
			]
		};
		project2.time.$subtract[1].$add.push({
			$multiply: ['$dw', 24, 3600000]
		});
	}
	if (resolution > 5) {
		// truncate month days
		project1.dm = {
			$subtract: [{
					$dayOfMonth: '$time'
				},
				1
			]
		};
		project2.time.$subtract[1].$add.push({
			$multiply: ['$dm', 24, 3600000]
		});
	}

	return async.waterfall([
		function(next) {
			var agg = TrackEvent.aggregate();
			if (match1) {
				agg.match(match1);
			}
			agg.project(project1);
			agg.project(project2);
			if (group1) {
				agg.group(group1);
			}
			agg.group(group2);
			agg.exec(next);
		}
	], common_api.reply_callback(req, res, 'ADMIN GET TRACKS'));
};

function escape_csv_string(str) {
	if (!str) {
		return '';
	}
	str = str.replace('"', '""');
	if (/[,"\n]/.test(str)) {
		return '"' + str + '"';
	} else {
		return str;
	}
}

exports.admin_get_tracks_csv = function(req, res) {
	return async.waterfall([
		function(next) {
			res.set('Content-Type', 'text/csv');
			res.set('Content-Disposition', 'inline;filename=nbtracks.csv');
			res.write([
				'track_id',
				'event',
				'time',
				'user_id',
				'user_name',
				'fbid',
				'googleid',
				'ip'
			].join(',') + '\n');
			var stream = TrackEvent.find().stream();
			stream.on('error', function(err) {
				return next(err);
			});
			stream.on('close', function() {
				res.end();
			});
			stream.on('data', function(t) {
				res.write([
					t.id,
					t.event,
					t.time,
					t.user.id,
					escape_csv_string(t.user.name),
					t.user.fbid,
					t.user.googleid,
					t.req.ip
				].join(',') + '\n');
			});
		}
	], common_api.reply_callback(req, res, 'ADMIN GET TRACKS CSV'));
};

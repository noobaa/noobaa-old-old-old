/* jshint node:true */
'use strict';

var _ = require('lodash');
var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var Inode = require('../models/inode').Inode;
var Device = require('../models/device.js').Device;
var TrackEvent = require('../models/track_event').TrackEvent;
var user_inodes = require('./user_inodes');
var email = require('./email');
var auth = require('./auth');
var mongoose = require('mongoose');
var mime = require('mime');


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
					Inode.aggregate([{
						$group: {
							_id: '$owner',
							my: {
								$sum: {
									$cond: ['$ref_owner', 0, 1]
								}
							},
							swm: {
								$sum: {
									$cond: ['$ref_owner', 1, 0]
								}
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
					u.files = f.my;
					u.files_swm = f.swm;
					// console.log('MY', f.my, 'SWM', f.swm, u.name);
				}
			});
			return next(null, merge_users);
		}

	], common_api.reply_callback(req, res, 'ADMIN GET USERS'));
};


exports.admin_get_user_usage = function(req, res) {
	var user_id = req.params.user_id;
	var usage;

	return async.waterfall([

		function(next) {
			user_inodes.get_user_usage_bytes(user_id, next);
		},

		function(usage1, next) {
			usage = usage1;
			User.findByIdAndUpdate(user_id, {
				usage: usage
			}, next);
		},

		function(user, next) {
			return next(null, {
				usage: usage
			});
		}

	], common_api.reply_callback(req, res, 'ADMIN GET USAGE ' + user_id));
};


exports.admin_user_notify_by_email = function(req, res) {
	var user_id = req.params.user_id;

	return async.waterfall([

		function(next) {
			return User.findById(user_id, next);
		},

		function(user, next) {
			return user_inodes.user_notify_by_email(user, next);
		},

	], common_api.reply_callback(req, res, 'ADMIN USER NOTIFY BY EMAIL ' + user_id));
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
		match1 = match1 || {};
		match1.time = match1.time || {};
		match1.time.$gte = new Date(req.body.from);
	}
	if (req.body.till) {
		match1 = match1 || {};
		match1.time = match1.time || {};
		match1.time.$lt = new Date(req.body.till);
	}
	if (!req.body.mgmt) {
		match1 = match1 || {};
		match1['user.fbid'] = {
			$nin: auth.adminoobaa_fbid_list
		};
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


function async_repeat_limit(fn, limit, callback) {
	var count = 0;
	var done = false;
	async.whilst(
		function() {
			console.log('REPEAT', done, count, limit);
			return !done && count < limit;
		},
		function(callback) {
			fn(function(err, result) {
				if (!err) {
					if (result) {
						count += result;
					} else {
						done = true;
					}
				}
				callback(err);
			});
		},
		function(err) {
			return callback(err, '' + count);
		}
	);
}

exports.admin_pull_inodes_fobj = function(req, res) {
	async_repeat_limit(pull_inodes_fobj, Number(req.query.limit) || 1000,
		common_api.reply_callback(req, res, 'ADMIN PULL INODES FOBJ'));
};

function pull_inodes_fobj(callback) {
	return async.waterfall([
		function(next) {
			return Inode.find({
				fobj: {
					$exists: true
				},
				$or: [{
					size: {
						$exists: false
					}
				}, {
					content_type: {
						$exists: false
					}
				}]
			}).limit(100).populate('fobj').exec(next);
		},

		function(inodes, next) {
			var updates_list = _.map(inodes, function(inode) {
				return function(next) {
					var fobj = inode.fobj;
					var save_fobj = false;
					if (typeof(fobj.size) !== 'number') {
						fobj.size = 0;
						save_fobj = true;
					}
					if (!fobj.content_type) {
						fobj.content_type = mime.lookup(inode.name) || 'application/octet-stream';
						save_fobj = true;
					}
					inode.size = fobj.size;
					inode.content_type = fobj.content_type;
					var series = [];
					if (save_fobj) {
						series.push(fobj.save.bind(fobj));
					}
					series.push(inode.save.bind(inode));
					return async.series(series, function(err) {
						return next(err);
					});
				};
			});
			async.parallelLimit(updates_list, 10, function(err, results) {
				// _.map(inodes, function(inode) {
				// return _.pick(inode, '_id', 'name', 'size', 'content_type', 'fobj');
				// });
				return next(err, inodes.length);
			});
		}
	], callback);
}

exports.admin_pull_inodes_ref = function(req, res) {
	async_repeat_limit(pull_inodes_ref, Number(req.query.limit) || 1000,
		common_api.reply_callback(req, res, 'ADMIN PULL INODES REF'));
};

function pull_inodes_ref(callback) {
	return async.waterfall([
		function(next) {
			return Inode.find({
				ghost_ref: {
					$exists: true
				},
				$or: [{
					ref_owner: {
						$exists: false
					}
				}, {
					isdir: false,
					size: {
						$gt: 0
					},
					fobj: {
						$exists: false
					}
				}]
			}).limit(100).populate('ghost_ref').exec(next);
		},

		function(inodes, next) {
			var updates_list = _.map(inodes, function(inode) {
				return function(next) {
					if (!inode.ghost_ref) {
						inode.ghost_ref = undefined;
					} else {
						inode.ref_owner = inode.ghost_ref.owner;
						inode.fobj = inode.ghost_ref.fobj;
					}
					return inode.save(function(err) {
						return next(err);
					});
				};
			});
			async.parallelLimit(updates_list, 10, function(err, results) {
				// _.map(inodes, function(inode) {
				// return _.pick(inode, '_id', 'name', 'fobj', 'ref_owner', 'ghost_ref');
				// });
				return next(err, inodes.length);
			});
		}
	], callback);
}


exports.admin_pull_inodes_shr = function(req, res) {
	async_repeat_limit(pull_inodes_shr, Number(req.query.limit) || 1000,
		common_api.reply_callback(req, res, 'ADMIN PULL INODES SHR'));
};

function pull_inodes_shr(callback) {
	return async.waterfall([
		function(next) {
			return Inode.find({
				num_refs: {
					$exists: true
				},
				shr: {
					$exists: false
				}
			}).limit(100).exec(next);
		},

		function(inodes, next) {
			var updates_list = _.map(inodes, function(inode) {
				return function(next) {
					inode.shr = 'r';
					inode.num_refs = undefined;
					return inode.save(function(err) {
						return next(err);
					});
				};
			});
			async.parallelLimit(updates_list, 10, function(err, results) {
				return next(err, inodes.length);
			});
		}
	], callback);
}

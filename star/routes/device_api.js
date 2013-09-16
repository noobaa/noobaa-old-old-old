/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var Device = require('../models/device').Device;
var User = require('../models/user').User;
var common_api = require('./common_api');


var MILLIS_IN_HOUR = 1000 * 60 * 60;

function push_update(date, dev, next) {
	// prepare the change set assuming the update will be pushed
	var changes = {
		// TODO: remove this temporary removal of old updates_log
		$unset: {
			updates_log: 1
		},
		$inc: {
			total_updates: 1
		},
		$set: {
			last_update: date
		},
		$push: {
			updates_stats: {
				start: date,
				end: date,
				count: 1
			}
		}
	};
	if (dev.updates_stats.length) {
		// check if the current update is close enough (1 hour diff)
		// to the last update record, and if so update
		// the last record instead of pushing new one.
		var last = dev.updates_stats.length - 1;
		var stat = dev.updates_stats[last];
		var start = stat.start.getTime();
		var end = stat.end.getTime();
		var curr = date.getTime();
		if (curr <= end || curr <= start) {
			console.error('ignoring early date', stat, date);
			changes = {};
		} else if (curr - start <= MILLIS_IN_HOUR) {
			// remove the $push and update the last element instead
			delete changes.$push;
			changes.$set['updates_stats.' + last + '.end'] = date;
			changes.$inc['updates_stats.' + last + '.count'] = 1;
		}
	}
	console.log('DEVICE UPDATE:', dev.id);
	return dev.update(changes, function(err, num, raw) {
		return next(err, dev);
	});
}


// DEVICE CRUD - CREATE

exports.device_create = function(req, res) {
	// create args are passed in post body
	var args = req.body;
	var remote_ip = req.get('X-Forwarded-For') || req.socket.remoteAddress;

	// prepare the device object (auto generate id).
	var new_dev = new Device({
		owner: req.user.id,
		name: args.name || 'MyDevice',
		host_info: args.host_info,
		ip_address: remote_ip,
		srv_port: args.srv_port,
		total_updates: 0,
		last_update: Date.now()
	});
	console.log('DEVICE CREATE', new_dev);

	async.waterfall([
		// lookup the device by owner and name
		function(next) {
			return Device.findOne({
				owner: new_dev.owner,
				name: new_dev.name
			}, {
				updates_stats: 0 // dont fetch all the stats
			}, next);
		},

		// if found pass it, otherwise save the new device
		function(dev, next) {
			if (dev) {
				return next(null, dev);
			} else {
				return new_dev.save(function(err) {
					return next(err, new_dev);
				});
			}
		},

		// make the reply
		function(dev, next) {
			return next(null, {
				reload: false,
				device: dev
			});
		}
	], common_api.reply_callback(req, res, 'DEVICE CREATE ' + new_dev.name));
};

// DEVICE CRUD - UPDATE

exports.device_update = function(req, res) {
	// the device_id param is parsed as url param (/path/to/api/:device_id/...)
	var dev_id = req.params.device_id;
	var remote_ip = req.get('X-Forwarded-For') || req.socket.remoteAddress;

	// pick valid updates
	var updates = _.pick(req.body, 'coshare_space', 'srv_port');

	if (updates.coshare_space) {
		var GB = 1024 * 1024 * 1024;
		var valid_values = [GB, 10 * GB, 100 * GB];
		if (typeof updates.coshare_space !== 'number' || !_.contains(valid_values, updates.coshare_space)) {
			console.error('invalid coshare_space', updates.coshare_space);
			delete updates.coshare_space;
		}
	}

	async.waterfall([

		// pass the id
		function(next) {
			return next(null, dev_id);
		},

		// find the device in the db
		Device.findById.bind(Device),

		// check device ownership
		common_api.req_ownership_checker(req),

		function(dev, next) {
			if (dev.srv_port === updates.srv_port) {
				delete updates.srv_port;
			}
			if (dev.ip_address !== remote_ip) {
				updates.ip_address = remote_ip;
			}
			if (_.isEmpty(updates)) {
				return next(null, dev);
			}
			console.log(updates);
			return dev.update(updates, function(err) {
				return next(err, dev);
			});
		},

		function(dev, next) {
			if (!updates.coshare_space) {
				return next(null, dev);
			}
			// TODO we assume here that there is single device per user for now
			return User.findByIdAndUpdate(req.user.id, {
				quota: updates.coshare_space
			}, function(err) {
				return next(err, dev);
			});
		},

		// update the device
		push_update.bind(null, new Date()),

		// make the reply
		function(dev, next) {
			_.extend(dev, updates); // TODO: not deep!
			dev.updates_stats = null; // dont return all the stats
			return next(null, {
				reload: false,
				device: dev
			});
		}
	], common_api.reply_callback(req, res, 'DEVICE UPDATE ' + dev_id, 'skip_starlog'));
};

exports.device_list = function(req, res) {
	console.log('DEVICE LIST');
	async.waterfall([
		// lookup devices by owner
		function(next) {
			return Device.find({
				owner: req.user.id
			}, {
				owner: 0,
				updates_stats: 0 // dont fetch all the stats
			}, next);
		}
	], common_api.reply_callback(req, res, 'DEVICE LIST ' + req.user.id));
};

exports.device_current = function(req, res) {
	var remote_ip = req.get('X-Forwarded-For') || req.socket.remoteAddress;
	console.log('DEVICE CURRENT', remote_ip);
	async.waterfall([
		// lookup devices by owner
		function(next) {
			return Device.find({
				owner: req.user.id,
				ip_address: remote_ip,
			}, {
				owner: 0,
				updates_stats: 0 // dont fetch all the stats
			}, next);
		},

		function(devices, next) {
			console.log('CURRENT DEVICES', devices);
			var dev = devices.length ? devices[0] : null;
			return next(null, {
				device: dev
			});
		}

	], common_api.reply_callback(req, res, 'DEVICE CURRENT ' + req.user.id));
};
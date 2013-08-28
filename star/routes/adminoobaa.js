/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var Device = require('../models/device.js').Device;


function fetch_users_and_devices(callback) {
	return async.parallel({
		users: User.find.bind(User),
		devices: Device.find.bind(Device, {}, {
			updates_stats: 0
		})
	}, callback);
}

function merge_users_and_devices(result) {
	var users = {};
	_.each(result.users, function(u) {
		// use toObject to convert from mongoose doc
		// which restricts the toJSON() properties to the schema only
		users[u._id] = u.toObject();
	});
	_.each(result.devices, function(d) {
		var u = users[d.owner];
		if (!u) {
			u = users[d.owner] = {};
		}
		u.devices = u.devices || {};
		u.devices[d._id] = d.toObject();
	});
	return users;
}

exports.admin_view = function(req, res, next_err_handler) {
	async.waterfall([
		fetch_users_and_devices,

		function(result, next) {
			var ctx = common_api.page_context(req);
			ctx.users = merge_users_and_devices(result);
			return res.render('adminoobaa.html', ctx);
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
		var args = _.pick(data.args, 'alpha_tester');
		console.log('ADMIN UPDATE', user_id, args);
		return User.findByIdAndUpdate(user_id, args, next);
	}, common_api.reply_callback(req, res, 'ADMIN UPDATE'));
};
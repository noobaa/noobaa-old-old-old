/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var Device = require('../models/device.js').Device;


exports.admin_view = function(req, res) {
	async.parallel({
		users: User.find.bind(User),
		devices: Device.find.bind(Device, {}, {
			updates_stats: 0
		})
	}, function(err, result) {
		if (err) {
			return res.send(500, err);
		} else {
			var users = {};
			_.each(result.users, function(u) {
				users[u._id] = u;
			});
			_.each(result.devices, function(d) {
				var u = users[d.owner];
				if (!u) {
					u = users[d.owner] = {};
				}
				u.devices = u.devices || {};
				u.devices[d._id] = d;
			});
			var ctx = common_api.page_context(req);
			ctx.users = users;
			return res.render('adminoobaa.html', ctx);
		}
	});
};
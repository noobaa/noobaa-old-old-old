/* jshint node:true */
'use strict';

var async = require('async');
var Device = require('../models/device.js').Device;
var common_api = require('./common_api');


// DEVICE CRUD - CREATE

exports.device_create = function(req, res) {
	// create args are passed in post body
	var args = req.body;

	// prepare the device object (auto generate id).
	var new_dev = new Device({
		owner: req.user.id,
		name: args.name || 'MyDevice',
		host_info: args.host_info,
		updates_log: []
	});
	console.log('DEVICE CREATE', new_dev);

	async.waterfall([
		// lookup the device by owner and name
		function(next) {
			return Device.findOne({
				owner: new_dev.owner,
				name: new_dev.name
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
	], common_api.reply_callback.bind(res, 'DEVICE CREATE ' + new_dev.name));
};

// DEVICE CRUD - UPDATE

exports.device_update = function(req, res) {
	// the device_id param is parsed as url param (/path/to/api/:device_id/...)
	var id = req.params.device_id;

	async.waterfall([

		// pass the id
		function(next) {
			return next(null, id);
		},

		// find the device in the db
		Device.findById.bind(Device),

		// check device ownership
		common_api.check_ownership.bind(req),

		// update the device
		function(dev, next) {
			console.log('DEVICE UPDATE:', id);
			return dev.update({
				$push: {
					updates_log: Date.now()
				}
			}, function(err) {
				return next(err, dev);
			});
		},

		// TODO: merge updates_log into statistics to reduce size

		// make the reply
		function(dev, next) {
			return next(null, {
				reload: false
			});
		}
	], common_api.reply_callback.bind(res, 'DEVICE UPDATE ' + id));
};

exports.device_read = function(req, res) {
	console.log('TODO: DEVICE READ', req.params, req.query);
	return res.json(200, {});
};

exports.device_list = function(req, res) {
	console.log('TODO: DEVICE LIST', req.query);
	return res.json(200, {});
};
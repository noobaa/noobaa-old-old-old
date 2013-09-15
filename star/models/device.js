/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var device_schema = new mongoose.Schema({
	// user ownership
	owner: types.ObjectId,
	name: String,
	host_info: {},
	ip_address: String,
	srv_port: Number,
	coshare_space: Number,
	total_updates: Number,
	last_update: Date,
	updates_stats: [{
		start: Date,
		end: Date,
		count: Number
	}],
	updates_log: [Date] // TODO: remove
});

// create a unique index on owner + name
device_schema.index({
	owner: 1,
	name: 1
}, {
	unique: true
});

exports.Device = mongoose.model('Device', device_schema);
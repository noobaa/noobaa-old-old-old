/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var device_schema = new mongoose.Schema({
	// user ownership
	owner: {
		type: types.ObjectId,
		ref: 'User'
	},
	name: String,
	ip_address: String,
	srv_port: Number,
	coshare_space: Number,

	host_info: {},
	drives_info: {},

	total_updates: Number,
	last_update: Date,
	updates_stats: [{
		start: Date,
		end: Date,
		count: Number
	}],
});

// create a unique index on owner + name
device_schema.index({
	owner: 1,
	name: 1
}, {
	// we don't force index uniqueness because it doesn't allow
	// to create multiple devices with owner=null which is needed
	// for devices that create before the user is logged in.
	unique: false,
});

exports.Device = mongoose.model('Device', device_schema);

/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var device_schema = new mongoose.Schema({
	// user ownership
	owner: types.ObjectId,
	name: String,
	host_info: {},
	updates_log: [Date]
});

// create a unique index on owner + name
device_schema.index({
	owner: 1,
	name: 1
}, {
	unique: true
});

exports.Device = mongoose.model('Device', device_schema);
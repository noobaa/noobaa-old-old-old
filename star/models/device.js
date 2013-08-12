/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var device_schema = new mongoose.Schema({
	// user ownership
	owner: types.ObjectId,
	name: String,
});

exports.Device = mongoose.model('Device', device_schema);
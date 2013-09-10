/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

// free form log entry
var star_log_schema = new mongoose.Schema({
	req: {},
	err: {},
	log: {}
});

exports.StarLog = mongoose.model('StarLog', star_log_schema);
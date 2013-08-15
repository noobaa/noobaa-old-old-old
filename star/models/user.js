/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Device = require('./device');

var user_schema = new mongoose.Schema({
	fb: {}, // facebook info has free form
	email: String, //this is used when the user updates a different email than the one in FB.
	quota: { type: Number, default: Math.pow(1024,3) }, //default quota is 1GB for now
	alpha_tester: Boolean // true to allow login to alpha testing
});

// create a unique index on the facebook id field
user_schema.index({
	'fb.id': 1
}, {
	unique: true
});

exports.User = mongoose.model('User', user_schema);
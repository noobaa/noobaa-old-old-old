/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

//constants to be used in the privileges array of a user
var CONST_PRIVILEGES = {
	'LOGIN': 2,
};
exports.CONST_PRIVILEGES = CONST_PRIVILEGES;

var user_schema = new mongoose.Schema({
	// facebook info has free form
	// _id - is suggested from mongose
	fb: {}, //fb information		
	privileges: [Number], //see CONST_PRIVILEGES
	email: String, //this is used when the user updates a different email than the one in FB.
});

// create a unique index on the facebook id field
user_schema.index({
	'fb.id': 1
}, {
	unique: true
});

exports.User = mongoose.model('User', user_schema);
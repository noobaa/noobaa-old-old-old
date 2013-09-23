/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var Device = require('./device');
var _ = require('underscore');

var providers = ['fb', 'google', 'local'];

var user_schema = new mongoose.Schema({
	fb: {}, // facebook info has free form
	google: {},
	local: {},
	email: String, //this is used when the user updates a different email than the one in FB.
	quota: {
		type: Number,
		default: Math.pow(1024, 3)
	}, //default quota is 1GB for now
	alpha_tester: Boolean // true to allow login to alpha testing
});

// create a unique index on the facebook id field
user_schema.index({
	'fb.id': 1
}, {
	unique: true,
	//sparse option explained:
	//since we might have users who logged in via google, they won't have the FB
	//http://docs.mongodb.org/manual/tutorial/create-a-unique-index/
	sparse: true,
});

user_schema.index({
	'google.id': 1
}, {
	unique: true,
	//sparse option - same as the above only for google users.
	sparse: true,
});

user_schema.methods.get_used_provider = function() {
	var me = this;
	return _.find(providers, function(provider) {
		return ( !! me[provider]);
	});
};

user_schema.methods.get_provider_field = function(field) {
	var me = this;
	var lprov = this.get_used_provider();
	if (lprov && me[lprov][field]) {
		return me[lprov][field];
	}
	return null;
};

user_schema.methods.get_email = function() {
	return this.email || this.get_provider_field('email');
};

user_schema.methods.get_name = function() {
	return this.get_provider_field('name');
};

user_schema.methods.get_provider_id = function() {
	return this.get_provider_field('id');
};

user_schema.methods.get_first_name = function() {
	return this.get_name().split(" ")[0];
};

user_schema.methods.get_last_name = function() {
	return _.last(this.get_name().split(" "));
};

user_schema.methods.assign_ids_to_object = function(object) {
	var me = this;
	providers.forEach(function(provider){
		if (!! me[provider]){
			object[provider+'id']=me[provider].id;
		}
	});
};

var User = mongoose.model('User', user_schema);
exports.User = User;
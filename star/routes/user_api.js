/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var user_inodes = require('../providers/user_inodes');
var User = require('../models/user').User;
var email = require('./email');

// USER CRUD - READ

exports.user_read = function(req, res) {

	var user_id = req.user.id;

	return async.waterfall([

		// find the user - the quota is stored in the user
		function(next) {
			return User.findById(user_id, next);
		},

		//get the user's current usage
		function(user, next) {
			return user_inodes.get_user_usage_bytes(user_id, function(err, usage) {
				if (err) {
					return next(err);
				}
				return next(null, {
					quota: user.quota,
					usage: usage
				});
			});
		},
	], common_api.reply_callback(req, res, 'USER READ ' + user_id));
};


// USER CRUD - UPDATE

exports.user_update = function(req, res) {

	var user_id = req.user.id;

	// pick valid updates
	var user_args = _.pick(req.body, 'email');

	return async.waterfall([

		function(next) {
			User.findByIdAndUpdate(user_id, user_args, next);
		},

		function(user, next) {
			// need to update the session info as well for email
			if (user_args.email) {
				req.user.email = user_args.email;
			}
			return next(null, user);
		},

		email.send_mail_changed,

	], common_api.reply_callback(req, res, 'USER UPDATE ' + user_id));
};
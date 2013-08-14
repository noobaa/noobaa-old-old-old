/* jshint node:true */
'use strict';

var async = require('async');
var common_api = require('./common_api');
var User = require('../models/user').User;
var email = require('./email');

// USER CRUD - UPDATE

exports.user_update = function(req, res) {
	// the user_id param is parsed as url param (/path/to/api/:user_id/...)
	var id = req.params.user_id;

	//currently we only allow to add email to a user
	//var user_args = _.pick(req.body, 'new_email');
	var new_email = req.body.new_email;
	async.waterfall([

		function(next) {
			User.findOne({
				'_id': id
			}, function(err, user) {
				if (err || !user) {
					console.error('ERROR - FIND USER FAILED:', err);
					return next(err, null);
				}
				return next(null, user);
			});
		},

		function(user, next) {
			if (user.email == new_email) {
				return next(null, user);
			}
			user.email = new_email;
			user.save(function(err, user, num) {
				if (err) {
					console.error('ERROR - UPDATE USER FAILED:', err);
					return next(err, null);
				}
				console.log('USER updated: ', user);
				return next(null, user);
			});
		},

		email.send_mail_changed,

	], common_api.reply_callback.bind(res, 'USER UPDATE ' + id));
};
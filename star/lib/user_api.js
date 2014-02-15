/* jshint node:true */
'use strict';

var _ = require('underscore');
var async = require('async');
var common_api = require('./common_api');
var user_inodes = require('./user_inodes');
var User = require('../models/user').User;
var email = require('./email');
var auth = require('./auth');

// USER CRUD - READ

exports.user_read = function(req, res) {

	var user_id = req.user.id;
	var user;
	var usage;

	return async.waterfall([

		// find the user - the quota is stored in the user
		function(next) {
			return User.findById(user_id, next);
		},

		//get the user's current usage
		function(user1, next) {
			user = user1;
			return user_inodes.get_user_usage_bytes(user_id, next);
		},

		function(usage1, next) {
			usage = usage1;
			if (user.usage === usage &&
				(!req.query.tz_offset || (req.query.tz_offset === user.tz_offset)) &&
				(user.last_access_time && (Date.now() - user.last_access_time.getTime()) < 600000)) {
				return next();
			}
			// save a cached value of the usage in the user
			user.usage = usage;
			// save last access time with some resolution (10 mins)
			user.last_access_time = new Date();
			// save client timezone
			if (req.query.tz_offset) {
				user.tz_offset = req.query.tz_offset;
			}
			return user.save(function(err) {
				return next(err);
			});
		},

		function(next) {
			return next(null, {
				quota: user.quota,
				usage: usage
			});
		}
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


exports.user_get_friends = function(req, res) {
	var user_id = req.user.id;

	return async.waterfall([

		auth.get_friends_list.bind(null, req.session.tokens),

		function(friends, next) {
			return auth.find_users_from_friends(friends, function(err, users) {
				return next(err, friends, users);
			});
		},

		function(friends, users, next) {
			var res_users = new Array(users.length);
			var users_fbids = {};
			var users_googleids = {};
			for (var i = 0; i < users.length; i++) {
				var u = users[i];
				res_users[i] = {
					id: u.id
				};
				if (u.google) {
					res_users[i].googleid = u.google.id;
					res_users[i].name = u.google.name;
					users_googleids[u.google.id] = true;
				}
				if (u.fb) {
					res_users[i].fbid = u.fb.id;
					res_users[i].name = u.fb.name;
					users_fbids[u.fb.id] = true;
				}
			}
			var res_fb = _.map(_.filter(friends.fb, function(friend) {
				return !users_fbids[friend.id];
			}), function(friend) {
				return {
					name: friend.name,
					fbid: friend.id
				};
			});
			var res_google = _.map(_.filter(friends.google, function(friend) {
				return !users_googleids[friend.id];
			}), function(friend) {
				return {
					name: friend.displayName,
					googleid: friend.id
				};
			});
			return next(null, {
				users: res_users,
				fb: res_fb,
				google: res_google
			});
		}

	], common_api.reply_callback(req, res, 'USER FRIENDS ' + user_id));
};

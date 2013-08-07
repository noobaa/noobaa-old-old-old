/* jshint node:true */
'use strict';

var async = require('async');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var user_model = require('../models/user');
var User = user_model.User;
var fbapi = require('facebook-api');
var _ = require('underscore');
var user_inodes = require('../providers/user_inodes');
var user_invitations = require('../providers/user_invitations');

// Gets the FB profile and current user DB appearance and makes sure we the uptodate details
// mainly - email, privilages and the likes which are important for our communication 
// with the user.
var user_details_update = function(profile, user, callback) {
	async.waterfall([
		function(next) {
			next(null, profile, user, false);
		},

		//check the profile
		function(profile, user, modified, next) {
			if (_.isEqual(user.fb, profile._json)) {
				return next(null, profile, user, modified);
			}
			modified = true;
			user.fb = profile._json;
			return next(null, profile, user, modified);
		},

	], function(err, profile, user, modified) {
		if (err) {
			return callback(err);
		}
		if (!modified) {
			return callback(null, user);
		}
		user.save(function(err, user, num) {
			if (err) {
				console.error('ERROR - UPDATE USER FAILED:', err);
				return callback(err);
			}
			console.log('USER updated: ', user);
			callback(null, user);
		});
	});
};

// setup passport with facebook backend
var create_user = function(profile, callback) {
	async.waterfall([
		function(next) {
			return next(null, profile);
		},

		function(profile, next) {
			return user_invitations.was_user_invited(profile, next);
		},

		function(fb_profile, invited, next) {
			var user = new User();
			user.privileges = [];
			if (invited) {
				user.privileges.push(user_model.CONST_PRIVILEGES.LOGIN);
			}
			user.fb = profile._json;
			user.save(function(err, user, num) {
				if (err) {
					console.error('ERROR - CREATE USER FAILED:', err);
					return next(err, null);
				}
				console.log('CREATED USER:', user);
				next(null, user);
			});
		},

		user_inodes.verify_and_create_base_folders,

	], callback);
};

var user_login = function(req, accessToken, refreshToken, profile, done) {
	async.waterfall([
		//find the user in the DB
		function(next) {
			User.findOne({
				'fb.id': profile.id
			}, function(err, user) {
				if (err) {
					console.error('ERROR - FIND USER FAILED:', err);
					return next(err);
				}
				if (!user) {
					return create_user(profile, next);
				}
				return next(null, user);
			});
		},
		user_details_update.bind(null, profile),
	], done);
};

passport.use(new facebook_passport.Strategy({
	clientID: process.env.FACEBOOK_APP_ID,
	clientSecret: process.env.FACEBOOK_SECRET,
	callbackURL: process.env.FACEBOOK_AUTHORIZED_URL,
	passReqToCallback: true
}, user_login));

// define what kind of info will be saved in the session.
// this info will be encoded inside a cookie,
// but can't keep the entire facebook info because 
// it might be too big for the cookie size limits.
// so keep only what is must.
// if we will need more info, deserialize can fetch from the database
// or cache it in memory store.
passport.serializeUser(function(user, done) {
	var user_info = {
		id: user._id,
		fbid: user.fb.id,
		name: user.fb.name,
		username: user.fb.username,
		privileges: user.privileges,
		email: null,
	};

	//fill in the email. The user fed email takes presidence over FB's so we do it last.
	if (user.fb.email) {
		user_info.email = user.fb.email;
	}
	if (user.email) {
		user_info.email = user.email;
	}
	done(null, user_info);
});

passport.deserializeUser(function(user_info, done) {
	done(null, user_info);
});

// facebook login is handled by passport
exports.facebook_login = function(req, res, next) {
	passport.authenticate('facebook', {
		// display: 'popup',
		scope: ['email', 'publish_actions'],
		// passing the query state to next steps to allow custom redirect
		state: req.query.state
	})(req, res, next);
};

function redirection(state) {
	return (state === 'auth.html' ? '/auth.html' : '/');
}

// when authorization is complete (either success/failed)
// facebook will redirect here.
exports.facebook_authorized = function(req, res, next) {
	// we handle the error of "sandbox app" specifically
	// we defined in facebook exactly who can join for private beta,
	// so for all the rest, we redirect back to the welcome page
	// but with specific tag to cause the request invite pop out immediately.
	if (req.query.error_code == 901) {
		res.redirect('/#join');
		return;
	}
	var redirect = redirection(req.query.state);
	passport.authenticate('facebook', {
		successRedirect: redirect,
		failureRedirect: redirect + '#failed'
	})(req, res, next);
};

exports.facebook_channel = function(req, res) {
	res.send('<script src="//connect.facebook.net/en_US/all.js"></script>');
};

exports.logout = function(req, res) {
	var redirect = redirection(req.query.state);
	delete req.session.fbAccessToken;
	req.logout();
	res.redirect(redirect);
};

exports.viewback = function(err, data) {
	if (err) {
		console.log("Error: " + JSON.stringify(err));
	} else {
		console.log("Data: " + JSON.stringify(data));
	}
};

var get_friends_list = function(fbAccessToken, next) {
	console.log("in auth::get_friends_list");
	var client = fbapi.user(fbAccessToken); // needs a valid access_token
	client.me.friends(next);
};
exports.get_friends_list = get_friends_list;

exports.get_noobaa_friends_list = function(fbAccessToken, next) {
	async.waterfall([
		function(next) {
			return next(null, fbAccessToken);
		},
		get_friends_list,
		function(fb_friends_list, next) {
			var fb_friends_id_list = _.pluck(fb_friends_list, 'id');
			User.find({
					"fb.id": {
						"$in": fb_friends_id_list
					}
				},
				next);
		},
	], next);
};

exports.can_login = function(user) {
	return _.contains(user.privileges, user_model.CONST_PRIVILEGES.LOGIN);
};
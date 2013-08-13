/* jshint node:true */
'use strict';

var URL = require('url');
var async = require('async');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var fbapi = require('facebook-api');
var _ = require('underscore');

var User = require('../models/user').User;
var email = require('./email');
var user_inodes = require('../providers/user_inodes');


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


function create_user(profile, callback) {
	console.log("CREATE USER", profile);
	async.waterfall([
		function(next) {
			var user = new User();
			// user.alpha_tester = false; // will be changed manually for alpha users
			user.fb = profile._json;
			user.save(function(err, user, num) {
				if (err) {
					console.error('ERROR - CREATE USER FAILED:', err);
					return next(err, null);
				}
				console.log('CREATED USER:', user);
				return next(null, user);
			});
		},

		user_inodes.verify_and_create_base_folders,

		email.send_welcome,

	], callback);
}

function user_login(req, accessToken, refreshToken, profile, done) {
	console.log("USER LOGIN");
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
}

// setup passport with facebook backend
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
		first_name: user.fb.first_name,
		username: user.fb.username,
		alpha_tester: user.alpha_tester,
		// user custom fed email takes presidence over FB's email
		email: user.email || user.fb.email
	};
	done(null, user_info);
});

passport.deserializeUser(function(user_info, done) {
	done(null, user_info);
});

// facebook login is handled by passport
exports.facebook_login = function(req, res, next) {
	console.log("auth.facebook_login");
	passport.authenticate('facebook', {
		// display: 'popup',
		scope: ['email'],
		// passing the query state to next steps to allow custom redirect
		state: req.query.state
	})(req, res, next);
};

// when authorization is complete (either success/failed)
// facebook will redirect here.
exports.facebook_authorized = function(req, res, next) {
	// allow to pass in req.query.state the url to redirect
	var redirect_url = req.query.state || '/';
	var failure_url = (function() {
		// for failure, add the #login_failed hash to the url
		var u = URL.parse(redirect_url);
		u.hash = 'login_failed';
		return URL.format(u);
	})();

	// let passport complete the authentication
	passport.authenticate('facebook', {
		successRedirect: redirect_url,
		failureRedirect: failure_url
	})(req, res, next);
};

exports.facebook_channel = function(req, res) {
	res.send('<script src="//connect.facebook.net/en_US/all.js"></script>');
};

exports.logout = function(req, res) {
	delete req.session.fbAccessToken;
	req.logout();
	// allow to pass in req.query.state the url to redirect
	var redirect_url = req.query.state || '/';
	res.redirect(redirect_url);
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
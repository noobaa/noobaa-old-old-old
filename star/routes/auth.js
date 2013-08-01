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

// setup passport with facebook backend
passport.use(new facebook_passport.Strategy({
	clientID: process.env.FACEBOOK_APP_ID,
	clientSecret: process.env.FACEBOOK_SECRET,
	callbackURL: process.env.FACEBOOK_AUTHORIZED_URL,
	passReqToCallback: true,
}, function(req, accessToken, refreshToken, profile, done) {
	// when user connects with facebook,
	// try to find his facebook-id in the database,
	// if not found, create a new user.
	User.findOne({
		'fb.id': profile.id
	}, function(err, user) {
		if (err) {
			console.error('ERROR - FIND USER FAILED:', err);
			return done(err);
		}
		if (!user) {
			user = new User();
			user.fb = profile._json;
			user.save(function(err, user, num) {
				if (err) {
					console.error('ERROR - CREATE USER FAILED:', err);
					return done(err, null);
				}
				console.log('CREATED USER:', user);
				// put the accessToken in the session
				console.log('Saved user token in session', accessToken);
				req.session.fbAccessToken = accessToken;
				//					done(null, user);
				return user_inodes.verify_and_create_base_folders(user, done);
			});
		}
		console.log('FOUND USER:', user);
		// put the accessToken in the session
		console.log('Saved user token in session', accessToken);
		req.session.fbAccessToken = accessToken;
		return user_inodes.verify_and_create_base_folders(user, done);
	});
}));

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
		username: user.fb.username
	};
	done(null, user_info);
});

passport.deserializeUser(function(user_info, done) {
	done(null, user_info);
});

// facebook login is handled by passport
exports.facebook_login = passport.authenticate('facebook');

exports.facebook_planet = function(req, res) {
	req.session.planet = true;
	return exports.facebook_login(req, res);
};

function redirection(req) {
	return (req.session.planet ? '/planet.html' : '/');
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
	var redirect = redirection(req);
	passport.authenticate('facebook', {
		successRedirect: redirect,
		failureRedirect: redirect,
		failureFlash: true
	})(req, res, next);
};

exports.facebook_channel = function(req, res) {
	res.send('<script src="//connect.facebook.net/en_US/all.js"></script>');
};

exports.logout = function(req, res) {
	var redirect = redirection(req);
	delete req.session.fbAccessToken;
	delete req.session.planet;
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
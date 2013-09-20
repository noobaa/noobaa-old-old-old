/* jshint node:true */
'use strict';

var URL = require('url');
var async = require('async');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var fbapi = require('facebook-api');
var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;
var _ = require('underscore');


var User = require('../models/user').User;
var email = require('./email');
var user_inodes = require('../providers/user_inodes');


// Gets the FB profile and current user DB appearance and makes sure we the uptodate details
// mainly - email, privilages and the likes which are important for our communication 
// with the user.
var user_details_update = function(profile, user, callback) {
	console.log('user_details_update');
	if (_.isEqual(user[provider_to_db_map[profile.provider]], profile._json)) {
		console.log('no update required');
		return callback(null, user);
	}
	user[provider_to_db_map[profile.provider]] = profile._json;
	user.save(function(err, user, num) {
		if (err) {
			console.error('ERROR - UPDATE USER FAILED:', err);
			return callback(err);
		}
		console.log('USER updated: ', user);
		callback(null, user);
	});
};

exports.create_user = create_user;

function create_user(profile, callback) {
	console.log("CREATE USER", profile);

	async.waterfall([
		function(next) {
			var user = new User();
			// user.alpha_tester = false; // will be changed manually for alpha users
			user[provider_to_db_map[profile.provider]] = profile._json;
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

		email.send_alpha_welcome,

	], callback);
}

var provider_to_db_map = {
	'facebook': 'fb',
	'google': 'google'
};

function user_login(req, accessToken, refreshToken, profile, done) {
	console.log("USER LOGIN");
	console.log('refreshToken: ', refreshToken);
	// console.log(arguments);
	console.log('------------------------------------------');
	console.log(profile.provider);
	console.log('------------------------------------------');

	// console.log('profile.provider_to_internal_user_map[profile.provider]: ', profile.provider_to_internal_user_map[profile.provider]);
	// var key = profile.provider_to_internal_user_map[profile.provider] + '.id';
	// console.log('key: ', key);
	// var xxx = {
	// profile.provider_to_internal_user_map[profile.provider] + '.id': profile.id
	// };
	// console.log('xxx: ',xxx);
	// return done(null, user);

	async.waterfall([
			//find the user in the DB
			function(next) {
				if (!provider_to_db_map[profile.provider]) {
					return next(new Error('Unknown provider: ' + profile.provider));
				}
				//the two lines below will get {fb.id:'xxx'} or {google.id:'xxx'} based on the provider
				var find_options = {};
				find_options[provider_to_db_map[profile.provider] + '.id'] = profile.id;
				console.log('find_options: ', find_options);
				User.findOne(find_options, function(err, user) {
					if (err) {
						console.error('ERROR - FIND USER FAILED:', err);
						return next(err);
					}

					console.log('yd 1609: ', user);

					if (!user) {
						return create_user(profile, next);
					}
					return next(null, user);
				});
			},

			user_details_update.bind(null, profile),

		],

		function(err, user) {
			if (err) {
				console.log(err, err.stack);
				delete req.session.accessToken;
				delete req.session.tokens;
				return done(err);
			}

			req.session.accessToken = accessToken;
			if (!req.session.tokens) {
				req.session.tokens = {};
			}
			// req.session.tokens[profile.provider] = accessToken;
			req.session.tokens[profile.provider] = {
				access_token: accessToken,
				refresh_token: refreshToken
			};
			console.log('in login - setting tokens:');
			console.log('profile.provider: ', profile.provider);
			console.log('req.session.tokens[profile.provider]: ', req.session.tokens[profile.provider]);

			return done(null, user);
		});
}

// setup passport with facebook backend
passport.use(new facebook_passport.Strategy({
	clientID: process.env.FACEBOOK_APP_ID,
	clientSecret: process.env.FACEBOOK_SECRET,
	callbackURL: process.env.FACEBOOK_AUTHORIZED_URL,
	passReqToCallback: true
}, user_login));

passport.use(new GoogleStrategy({
	clientID: process.env.GOOGLE_APP_ID,
	clientSecret: process.env.GOOGLE_SECRET,
	callbackURL: process.env.GOOGLE_AUTHORIZED_URL,
	passReqToCallback: true
}, user_login));

var adminoobaa_fbid_list = [
	'532326962', // guy
	'100000601353304' // yuval
];

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
		name: user.get_name(),
		first_name: user.get_first_name(),
		email: user.get_email(),
		alpha_tester: user.alpha_tester,
	};
	if (user.fb) {
		user_info.fbid = user.fb.id;
	}
	if (user.google) {
		user_info.googleid = user.google.id;
	}

	// insert the adminoobaa field only if admin user,
	// and avoid exposing it (even with false value) when not.
	if (user.fb && _.contains(adminoobaa_fbid_list, user.fb.id)) {
		user_info.adminoobaa = true;
	}
	done(null, user_info);
});

passport.deserializeUser(function(user_info, done) {
	done(null, user_info);
});

// third party login is handled by passport
exports.third_party_login = function(provider, req, res, next) {
	var auth_provider_conf = {
		'facebook': {
			scope: ['email']
		},
		'google': {
			scope: ['https://www.googleapis.com/auth/userinfo.profile',
				'https://www.googleapis.com/auth/userinfo.email',
				'https://www.googleapis.com/auth/plus.login',
				'https://www.googleapis.com/auth/plus.me'
			]
		}
	};

	console.log("Third party login: " + provider);
	passport.authenticate(provider, {
		// passing the query state to next steps to allow custom redirect
		state: req.query.state,
		// display: 'popup',
		scope: auth_provider_conf[provider].scope,
	})(req, res, next);
};

// when authorization is complete (either success/failed)
// facebook will redirect here.
exports.third_party_authorized = function(provider, req, res, next) {
	// allow to pass in req.query.state the url to redirect
	var redirect_url = req.query.state || '/';
	var failure_url = (function() {
		// for failure, add the #login_failed hash to the url
		var u = URL.parse(redirect_url);
		u.hash = 'login_failed';
		return URL.format(u);
	})();

	// let passport complete the authentication
	passport.authenticate(provider, {
		successRedirect: redirect_url,
		failureRedirect: failure_url
	})(req, res, next);
};

exports.facebook_channel = function(req, res) {
	res.send('<script src="//connect.facebook.net/en_US/all.js"></script>');
};

exports.logout = function(req, res) {
	console.log('auth.logout');
	delete req.session.accessToken;
	delete req.session.tokens;
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

exports.get_friends_list = get_friends_list;

function get_friends_list(tokens, callback) {
	async.parallel({
		fb_friends_list: function(cb) {
			if (!tokens.facebook) {
				return cb(null, []);
			}
			var client = fbapi.user(tokens.facebook.access_token);
			client.me.friends(cb);
		},
		google_friends_list: function(cb) {
			console.log('in google get friends list');
			if (!tokens.google) {
				console.log('No google token found.');
				return cb(null, []);
			}
			console.log('Google token was found. Expected to get some info on the userinfo');
			var oauth2Client =
				new OAuth2Client(process.env.GOOGLE_APP_ID, process.env.GOOGLE_SECRET, process.env.GOOGLE_AUTHORIZED_URL);

			googleapis.discover('plus', 'v1').execute(function(err, client) {
				console.log('tokens.google: ', tokens.google);
				oauth2Client.credentials = tokens.google;
				client
					.plus.people.list({
						'userId': 'me',
						'collection': 'visible'
					})
					.withAuthClient(oauth2Client)
				// .execute(cb);
				.execute(function(err, resutls) {
					cb(err, resutls.items);
				});
			});
		}
	}, callback);
}

exports.get_noobaa_friends_list = get_noobaa_friends_list;

function get_noobaa_friends_list(tokens, callback) {
	if (!tokens) {
		var err = new Error("the accessToken was not supplied");
		return callback(err);
	}

	async.waterfall([

		// get_friends_list.bind(null, accessToken),
		get_friends_list.bind(null, tokens),

		function(friends, next) {
			// console.log('---------------------------------------friends: ', friends);
			var fb_friends_id_list = _.pluck(friends.fb_friends_list, 'id');
			var google_friends_id_list = _.pluck(friends.google_friends_list, 'id');
			console.log('fb_friends_id_list: ', fb_friends_id_list);
			console.log('google_friends_id_list: ', google_friends_id_list);
			User.find({
					$or: [{
						"fb.id": {
							"$in": fb_friends_id_list
						}
					}, {
						"google.id": {
							"$in": google_friends_id_list
						}
					}]
				},
				next);
		},
	], callback);
}
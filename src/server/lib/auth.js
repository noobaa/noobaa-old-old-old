/* jshint node:true */
'use strict';

var URL = require('url');
var async = require('async');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var LocalStrategy = require('passport-local').Strategy;
var fbapi = require('facebook-api');
var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;
var _ = require('underscore');
var bcrypt = require('bcrypt');

var User = require('../models/user').User;
var email = require('./email');
var user_inodes = require('./user_inodes');
var track_api = require('./track_api');


var provider_to_db_map = {
    'facebook': 'fb',
    'google': 'google'
};

function clear_session(req) {
    delete req.session.tokens;
    delete req.session.singin;
    delete req.session.singup;
}


function sign_in_user(req, params, done) {
    var user;
    var is_new;

    var provider = params.profile ? provider_to_db_map[params.profile.provider] : '';
    if (provider) {
        console.log('SIGNIN:', provider, params.profile._json);
    } else {
        console.log('SIGNIN:', 'email', params.email);
    }

    async.waterfall([

        // query to find if user exists
        function(next) {
            var query = {};
            // build query by params: {'fb.id':'xxx'} or {'google.id':'xxx'} or {email:'x@x.x'}
            if (provider) {
                query[provider + '.id'] = params.profile.id;
            } else {
                query.email = String(params.email);
            }
            // TODO what about email duplicates?
            return User.findOne(query, next);
        },

        function(user_arg, next) {
            // new user
            if (!user_arg) {
                req.session.signup = true;
                is_new = true;
                user = new User();
                return next();
            }
            // user exists
            user = user_arg;
            // if already authenticated by provider signin then no need to check password
            if (params.tokens) return next();
            // authenticate signin with password
            user.verify_password(params.password, function(err, matching) {
                if (err) return next(err);
                if (!matching) {
                    console.error('INCORRECT PASSWORD', user.get_name());
                    return next(new Error('INCORRECT PASSWORD'));
                }
                return next();
            });
        },

        function(next) {
            if (is_new && !provider) {
                user.name = params.email;
                user.email = params.email;
                user.password = params.password;
            }
            if (provider) {
                if (_.isEqual(user[provider], params.profile._json)) {
                    console.log('profile info is up-to-date', user.get_name());
                } else {
                    user[provider] = params.profile._json;
                }
            }
            if (is_new && req.cookies && req.cookies.refid) {
                user.refid = req.cookies.refid;
            }
            return user.save(function(err) {
                return next(err);
            });
        },

        function(next) {
            return user_inodes.verify_and_create_base_folders(user, function(err) {
                return next(err);
            });
        },

        function(next) {
            if (!is_new) return next();
            // track the signup event, don't wait for ack
            track_api.track_event('auth.signup', null, user, req);
            // send emails
            return email.send_alpha_welcome(user, function(err) {
                if (err) return next(err);
                return email.send_alpha_approved_notification(user, function(err) {
                    return next(err);
                });
            });
        }

    ], function(err) {
        if (err) {
            console.log(err, err.stack);
            clear_session(req);
            return done(err);
        }
        if (params.tokens) {
            if (!req.session.tokens) {
                req.session.tokens = {};
            }
            req.session.tokens[params.profile.provider] = params.tokens;
        }
        req.session.signin = true;
        return done(null, user);
    });

}

function sign_in_by_provider(req, accessToken, refreshToken, profile, done) {
    return sign_in_user(req, {
        profile: profile,
        tokens: {
            access_token: accessToken,
            refresh_token: refreshToken
        }
    }, done);
}

function sign_in_by_email(req, email, password, done) {
    return sign_in_user(req, {
        email: email,
        password: password
    }, done);
}

// setup passport with facebook backend
passport.use(new facebook_passport.Strategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: process.env.FACEBOOK_AUTHORIZED_URL,
    passReqToCallback: true
}, sign_in_by_provider));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_APP_ID,
    clientSecret: process.env.GOOGLE_SECRET,
    callbackURL: process.env.GOOGLE_AUTHORIZED_URL,
    passReqToCallback: true
}, sign_in_by_provider));

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true
}, sign_in_by_email));

var adminoobaa_fbid_list = [
    '532326962', // guy
    '100000601353304' // yuval
];

exports.adminoobaa_fbid_list = adminoobaa_fbid_list;

// define what kind of info will be saved in the session.
// this info will be encoded inside a cookie,
// but can't keep the entire facebook info because 
// it might be too big for the cookie size limits.
// so keep only what is must.
// if we will need more info, deserialize can fetch from the database
// or cache it in memory store.
passport.serializeUser(function(user, done) {
    var user_info = user.get_user_identity_info();
    user_info.email = user.get_email(); // TODO really needed in the session cookie?
    user_info.alpha_tester = user.alpha_tester;

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
exports.provider_login = function(provider, req, res, next) {
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
        },
        'local': {}
    };

    var auth_options = {
        // passing the query state to next steps to allow custom redirect
        state: req.query.state,
        scope: auth_provider_conf[provider].scope
    };

    if (auth_options.state && auth_options.state.indexOf('planet') != -1) {
        auth_options.display = 'popup';
    }

    passport.authenticate(provider, auth_options)(req, res, next);
};

// when authorization is complete (either success/failed)
// facebook will redirect here.
exports.provider_authorized = function(provider, req, res, next) {
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
    clear_session(req);
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


function get_friends(tokens, callback) {
    if (!tokens) {
        return callback(null, {});
    }
    return async.parallel({
        fb: function(cb) {
            if (!tokens.facebook) {
                return cb(null, []);
            }
            var client = fbapi.user(tokens.facebook.access_token);
            client.me.friends(cb);
        },
        google: function(cb) {
            if (!tokens.google) {
                return cb(null, []);
            }
            var oauth2Client =
                new OAuth2Client(process.env.GOOGLE_APP_ID, process.env.GOOGLE_SECRET, process.env.GOOGLE_AUTHORIZED_URL);
            googleapis.discover('plus', 'v1').execute(function(err, client) {
                console.log('tokens.google: ', tokens.google);
                oauth2Client.credentials = tokens.google;
                client.plus.people.list({
                    'userId': 'me',
                    'collection': 'visible'
                }).withAuthClient(oauth2Client).execute(function(err, results) {
                    cb(err, results && results.items);
                });
            });
        }
    }, callback);
}

function find_users_from_friends(friends, callback) {
    var fb_friends_id_list = _.pluck(friends.fb, 'id');
    var google_friends_id_list = _.pluck(friends.google, 'id');
    return User.find({
        $or: [{
            "fb.id": {
                "$in": fb_friends_id_list
            }
        }, {
            "google.id": {
                "$in": google_friends_id_list
            }
        }]
    }, callback);
}

exports.get_friends_and_users = get_friends_and_users;

function get_friends_and_users(tokens, callback) {
    return async.waterfall([

        function(next) {
            return get_friends(tokens, next);
        },
        function(friends, next) {
            return find_users_from_friends(friends, function(err, users) {
                return next(err, friends, users);
            });
        }
    ], callback);
}

exports.get_friends_user_ids = get_friends_user_ids;

function get_friends_user_ids(tokens, callback) {
    return async.waterfall([

        function(next) {
            return get_friends(tokens, next);
        },
        function(friends, next) {
            return find_users_from_friends(friends).select('_id').exec(function(err, users) {
                return next(err, _.pluck(users, '_id'));
            });
        }
    ], callback);
}

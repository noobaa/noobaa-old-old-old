var path = require('path');
var util = require('util');
var fs = require('fs');
var http = require('http');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var mongoose = require('mongoose');

// setup database

mongoose.connect(process.env.MONGOHQ_URL);
var users = require('./lib/users');

// setup express app
// configure app handlers in the order to use them

var app = express();
var server = http.createServer(app);
var web_port = process.env.PORT || 5000;
// TODO: randomize a secret
var COOKIE_SESSION_SECRET = 'noobaabaaloobaaissosecretyouwillneverguessit';
app.set('port', web_port);
app.set('env', 'development'); // TODO: temporary
app.use(express.favicon());
app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieSession({secret: COOKIE_SESSION_SECRET}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use('/public/', express.static(path.join(__dirname, 'public')));

// setup view template engine

var dot_emc_app = dot_emc.init({app: app});
dot.templateSettings.strip = false;
dot.templateSettings.cache = ('development' != app.get('env'));
app.set('views', path.join(__dirname, 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);

// setup auth with passport

passport.use(new facebook_passport.Strategy({
	clientID: process.env.FACEBOOK_APP_ID,
	clientSecret: process.env.FACEBOOK_SECRET,
	callbackURL: process.env.FACEBOOK_AUTHORIZED_URL
}, function (accessToken, refreshToken, profile, done) {
	users.User.findOne({'fb.id': profile.id}, function (err, user) {
		if (err) {
			console.error('ERROR - FIND USER FAILED:',err);
			done(err);
			return;
		}
		if (!user) {
			user = new users.User;
			user.fb = profile._json;
			user.save(function (err, user, num) {
				if (err) {
					console.error('ERROR - CREATE USER FAILED:', err);
					done(err);
					return;
				}
				console.log('CREATED USER:', user);
				done(null, user);
			});
			return;
		}
		console.log('FOUND USER:', user);
		done(null, user);
	});
}));

passport.serializeUser(function (user, done) {
	var user_info = {
		id: user._id,
		fbid: user.fb.id,
		name: user.fb.name,
		username: user.fb.username
	};
	done(null, user_info);
});

passport.deserializeUser(function (user_info, done) {
	done(null, user_info);
});

app.get('/facebook_login/', 
	passport.authenticate('facebook')
);

app.get('/facebook_authorized/', function (req, res, next) {
	if (req.query.error_code == 901) {
		res.redirect('/#?nonlisteduser=true');
		return;
	}
	passport.authenticate('facebook', {
		successRedirect: '/',
		failureRedirect: '/',
		failureFlash: true
	})(req, res, next);
});

app.get('/logout/', function (req, res) {
	req.logout();
	res.redirect('/');
});

function context(req) {
	return {
		user: req.user,
		app_id: process.env.FACEBOOK_APP_ID,
		channel_url: '', // TODO
		planet_api: 'http://localhost:9888/planet_api/'
	};
}

// setup content routes

app.get('/getstarted.html', function (req, res) {
	if (req.user) {
		res.render('getstarted.html', context(req));
	} else {
		res.redirect('/');
	}
});

app.get('/', function (req, res) {
	if (req.user) {
		res.render('mydata.html', context(req));
	} else {
		res.render('welcome.html', context(req));
	}
});


// errorHandler should be last handler
if ('development' == app.get('env')) {
	app.use(express.errorHandler());
}

// start the default http server
server.listen(web_port, function () {
	console.log('Web server on port ' + web_port);
});

var http = require('http');
var path = require('path');
var util = require('util');
var fs = require('fs');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var facebook_passport = require('passport-facebook');
var app = express();
var server = http.createServer(app);


// setup express app
// configure app handlers in the order to use them

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

function context() {
	return {
		user: {}, // TODO
		app_id: process.env.FACEBOOK_APP_ID,
		channel_url: '', // TODO
		planet_api: 'http://localhost:9888/planet_api/'
	};
}

// setup auth with passport

passport.use(new facebook_passport.Strategy({
	clientID: process.env.FACEBOOK_APP_ID,
	clientSecret: process.env.FACEBOOK_SECRET,
	callbackURL: process.env.FACEBOOK_AUTHORIZED_URL
}, function(accessToken, refreshToken, profile, done) {
	console.log('LOGIN:', profile.id, profile.username);
	done(null, profile);
	/*
	User.findOrCreate(..., function(err, user) {
		if (err) {
			return done(err);
		}
		done(null, user);
	});
	*/
}));

passport.serializeUser(function(user, done) {
	done(null, user.id);
});

passport.deserializeUser(function(id, done) {
	done(null, id);
	/*
	User.findById(id, function(err, user) {
		done(err, user);
	});
	*/
});

app.get('/facebook_login/', passport.authenticate('facebook'));

app.get('/facebook_authorized/',
	passport.authenticate('facebook', {
		failureRedirect: '/'
	}), function(req, res) {
		// Successful authentication
		req.session.user = 1;
		res.redirect('/');
	}
);

app.get('/logout/', function (req, res) {
	delete req.session.user;
	res.redirect('/');
});


// setup content routes

app.get('/getstarted.html', function (req, res) {
	res.render('getstarted.html', context());
});

app.get('/', function (req, res) {
	if (req.session.user) {
		res.render('mydata.html', context());
	} else {
		res.render('welcome.html', context());
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

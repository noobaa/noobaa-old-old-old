/* jshint node:true */
'use strict';

var path = require('path');
var http = require('http');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var mongoose = require('mongoose');
var fbapi = require('facebook-api');


// replace dot regexp to use <% %> to avoid collision with angular {{ }}
for (var i in dot.templateSettings) {
	var reg = dot.templateSettings[i];
	if (!(reg instanceof RegExp)) {
		continue;
	}
	var pattern = reg.source;
	pattern = pattern.replace(/\\\{\\\{/, '\\<\\?');
	pattern = pattern.replace(/\\\}\\\}/, '\\?\\>');
	var flags = '';
	if (reg.global) {
		flags += 'g';
	}
	if (reg.ignoreCase) {
		flags += 'i';
	}
	if (reg.multiline) {
		flags += 'm';
	}
	dot.templateSettings[i] = new RegExp(pattern, flags);
}


// connect to the database
mongoose.connect(process.env.MONGOHQ_URL);

// create express app
var app = express();
var server = http.createServer(app);
var web_port = process.env.PORT || 5000;
app.set('port', web_port);
app.set('env', 'development'); // TODO: temporary

// setup view template engine with doT
var dot_emc_app = dot_emc.init({
	app: app
});
dot.templateSettings.strip = false;
dot.templateSettings.cache = ('development' != app.get('env'));
app.set('views', path.join(__dirname, 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);


// setup express app
// configure app handlers in the order to use them
app.use(express.favicon('/public/nblib/img/noobaa_icon.ico'));
app.use(express.logger());
var SECRET = '.9n>(3(Tl.~8Q4mL9fhzqFnD;*vbd\\8cI!&3r#I!y&kP>PkAksV4&SNLj+iXl?^{O)XIrRDAFr+CTOx1Gq/B/sM+=P&j)|X|cI}c>jmEf@2TZmQJhEMk_WZMT:l6Z(4rQK$\\NT*Gcnv.0F9<c<&?E>Uj(x!z_~%075:%DHRhL"3w-0W+r)bV!)x)Ya*i]QReP"T+e@;_';
app.use(express.cookieParser(SECRET));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieSession({
	// no need for secret since itsw signed by cookieParser
	cookie: {
		// TODO: setting max-age for all sessions although we prefer only for /auth.html
		// but express/connect seems broken to accept individual session maxAge,
		// although documented to work. people also report it fails.
		maxAge: 356 * 24 * 60 * 60 * 1000 // 1 year
	}
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(function(req, res, next) {
	/* TODO: REMOVE COOKIE SHIT
	// middleware to receive a user also from the noobaa_auth_cookie
	// see route for auth.html below
	if (!req.user && req.signedCookies.noobaa_auth_cookie) {
		req.user = req.signedCookies.noobaa_auth_cookie.user;
	}
	*/
	return next();
});
app.use('/star_api/', function(req, res, next) {
	// general validations preceding all the star api functions
	if (!req.user) {
		console.log('/star_api/', 'User Not Authenticated');
		return res.send(403, "User Not Authenticated");
	}
	return next();
});
app.use(app.router);


// setup static files

// use public star files
app.use('/public/', express.static(path.join(__dirname, 'public')));
// use vendor content which is loaded by npm
app.use('/vendor/blueimp-file-upload/', express.static(
	path.join(__dirname, '..', 'node_modules', 'blueimp-file-upload')
));
// add vendor content loaded by bower
app.use('/vendor/', express.static(path.join(__dirname, '..', 'bower_components')));
// add static vendor content
app.use('/vendor/', express.static(path.join(__dirname, '..', 'vendor')));


// setup auth routes

var auth = require('./routes/auth');
app.get('/auth/facebook/login/', auth.facebook_login);
app.get('/auth/facebook/authorized/', auth.facebook_authorized);
app.get('/auth/facebook/channel.html', auth.facebook_channel);
app.get('/auth/logout/', auth.logout);


// setup email routes

var email = require('./routes/email');
app.post('/email/request_invite/', email.request_invite);


// setup star API routes

var star_api = require('./routes/star_api');
app.post('/star_api/inode/', star_api.inode_create);
app.get('/star_api/inode/:inode_id', star_api.inode_read);
app.put('/star_api/inode/:inode_id', star_api.inode_update);
app.del('/star_api/inode/:inode_id', star_api.inode_delete);
app.get('/star_api/inode/:inode_id/share_list', star_api.inode_get_share_list);
app.put('/star_api/inode/:inode_id/share_list', star_api.inode_set_share_list);


// setup pages

function page_context(req) {
	return {
		user: req.user,
		app_id: process.env.FACEBOOK_APP_ID,
		// TODO: channel_url expects absolute/relative/even needed?
		channel_url: '/auth/facebook/channel.html',
		planet_api: 'http://localhost:9888/planet_api/'
	};
}

// the auth.html route is used for planet login
// it allows the planet to get a cookie that
// can be used to pass the user credentials.
// this is instead of the session which is defined as httpOnly
// and therefore not allowing to fetch on client javascript.
app.get('/auth.html', function(req, res) {
	console.log('USER:', req.user);
	/* TODO: REMOVE COOKIE SHIT
	if (req.user) {
		// return a custom cookie
		res.cookie('noobaa_auth_cookie', {
			user: req.user,
			planet_id: req.query.planet_id
		}, {
			signed: true // make it signed
		});
	}
	*/
	// This user won't have to log in for a year
	console.log(req.session.cookie);
	res.render('auth.html', page_context(req));
});

app.get('/getstarted.html', function(req, res) {
	if (req.user) {
		res.render('getstarted.html', page_context(req));
	} else {
		res.redirect('/');
	}
});

app.get('/', function(req, res) {
	if (req.user) {
		res.render('mydata.html', page_context(req));
	} else {
		res.render('welcome.html', page_context(req));
	}
});


// errorHandler should be last handler
if ('development' == app.get('env')) {
	app.use(express.errorHandler({
		showStack: true,
		dumpExceptions: true
	}));
}

// start the default http server
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});
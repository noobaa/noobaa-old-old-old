/* jshint node:true */
'use strict';

process.on('uncaughtException', function(err) {
	console.log(err.stack);
});

if (process.env.NODETIME_ACCOUNT_KEY) {
	require('nodetime').profile({
		accountKey: process.env.NODETIME_ACCOUNT_KEY,
		appName: process.env.NODETIME_APP_DESC
	});
}

var path = require('path');
var URL = require('url');
var http = require('http');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var mongoose = require('mongoose');
var User = require('./models/user').User;

// var fbapi = require('facebook-api');
var common_api = require('./lib/common_api');

// connect to the database
mongoose.connect(process.env.MONGOHQ_URL);

// create express app
var app = express();
var web_port = process.env.PORT || 5000;
app.set('port', web_port);
app.set('env', 'development'); // TODO: temporary

// setup view template engine with doT
var dot_emc_app = dot_emc.init({
	app: app
});
dot.templateSettings.strip = false;
dot.templateSettings.cache = true; // ('development' != app.get('env'));
// replace dot regexp to use <? ?> to avoid collision with angular {{ }}
for (var i in dot.templateSettings) {
	var reg = dot.templateSettings[i];
	if (!(reg instanceof RegExp)) {
		continue;
	}
	var pattern = reg.source;
	pattern = pattern.replace(/\\\{\\\{/g, '\\<\\?');
	pattern = pattern.replace(/\\\}\\\}/g, '\\?\\>');
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
app.set('views', path.join(__dirname, 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);



////////////////
// MIDDLEWARE //
////////////////

// configure app middleware handlers in the order to use them

app.use(express.favicon('/public/images/noobaa_icon16.ico'));
app.use(express.logger());
app.use(function(req, res, next) {
	// HTTPS redirect:
	// since we want to provide secure and certified connections 
	// for the entire application, so once a request for http arrives,
	// we redirect it to https.
	// it was suggested to use the req.secure flag to check that.
	// however our nodejs server is always http so the flag is false,
	// and on heroku only the router does ssl,
	// so we need to pull the heroku router headers to check.
	var fwd_proto = req.get('X-Forwarded-Proto');
	// var fwd_port = req.get('X-Forwarded-Port');
	// var fwd_from = req.get('X-Forwarded-For');
	// var fwd_start = req.get('X-Request-Start');
	if (fwd_proto === 'http') {
		var host = req.get('Host');
		return res.redirect('https://' + host + req.url);
	}
	return next();
});
var COOKIE_SECRET =
	'.9n>(3(Tl.~8Q4mL9fhzqFnD;*vbd\\8cI!&3r#I!y&kP>' +
	'PkAksV4&SNLj+iXl?^{O)XIrRDAFr+CTOx1Gq/B/sM+=P&' +
	'j)|X|cI}c>jmEf@2TZmQJhEMk_WZMT:l6Z(4rQK$\\NT*G' +
	'cnv.0F9<c<&?E>Uj(x!z_~%075:%DHRhL"3w-0W+r)bV!)x)Ya*i]QReP"T+e@;_';
app.use(express.cookieParser(COOKIE_SECRET));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieSession({
	// no need for secret since its signed by cookieParser
	key: 'noobaa_session',
	cookie: {
		// TODO: setting max-age for all sessions although we prefer only for /auth.html
		// but express/connect seems broken to accept individual session maxAge,
		// although documented to work. people also report it fails.
		maxAge: 356 * 24 * 60 * 60 * 1000 // 1 year
	}
}));
app.use(passport.initialize());
app.use(passport.session());
app.use('/api/', function(req, res, next) {
	// general validations preceding all the star api functions
	if (!req.user) {
		return error_403(req, res, next);
	}
	return next();
});
app.use('/adminoobaa/', function(req, res, next) {
	// admin validation
	// to make sure admin url cannot be spotted from outside,
	// we skip the route as if it was never defined.
	if (!req.user || !req.user.adminoobaa) {
		console.error('SECURITY ERROR:',
			'User Not Admin', req.user,
			'Headers', req.headers);
		return error_404(req, res, next);
	}
	return next();
});

// using router before static files is optimized
// since we have less routes then files, and the routes are in memory.
app.use(app.router);

// setup static files
app.use(express.compress());
app.use('/public/', express.static(path.join(__dirname, 'public')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'vendor')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'bower_components')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'node_modules')));
app.use('/', express.static(path.join(__dirname, 'public', 'google')));
// app.use('/2FE5F0A5036CF33C937D0E26CE9B0B10.txt', express.static(path.join(__dirname, 'public', 'js')));


// error handlers should be last
// roughly based on express.errorHandler from connect's errorHandler.js
app.use(error_404);
app.use(function(err, req, res, next) {
	console.error('ERROR:', err);
	var e = {};
	if (app.get('env') === 'development') {
		// show internal info only on development
		e = err;
	}
	e.data = e.data || e.message;
	e.status = err.status || res.statusCode;
	if (e.status < 400) {
		e.status = 500;
	}
	res.status(e.status);

	if (req.xhr) {
		return res.json(e);
	} else if (req.accepts('html')) {
		return res.render('error.html', {
			data: e.data,
			status: e.status,
			stack: e.stack
		});
	} else if (req.accepts('json')) {
		return res.json(e);
	} else {
		return res.type('txt').send(e.data || e.toString());
	}
});

function error_404(req, res, next) {
	next({
		status: 404, // not found
		data: 'We dug the earth, but couldn\'t find ' + req.originalUrl
	});
}

function error_403(req, res, next) {
	if (req.accepts('html')) {
		return res.redirect(URL.format({
			pathname: '/auth/facebook/login/',
			query: {
				state: req.originalUrl
			}
		}));
	}
	next({
		status: 403, // forbidden
		data: 'Forgot to login?'
	});
}

function error_501(req, res, next) {
	next({
		status: 501, // not implemented
		data: 'Working on it... ' + req.originalUrl
	});
}



////////////
// ROUTES //
////////////


// setup auth routes

var auth = require('./lib/auth');

var facebook_auth_path = URL.parse(process.env.FACEBOOK_AUTHORIZED_URL).path;
var google_auth_path = URL.parse(process.env.GOOGLE_AUTHORIZED_URL).path;

app.get(facebook_auth_path, auth.provider_authorized.bind(null, 'facebook'));
app.get(google_auth_path, auth.provider_authorized.bind(null, 'google'));


app.get('/auth/facebook/channel.html', auth.facebook_channel);
app.get('/auth/logout/', auth.logout);

app.get('/auth/facebook/login/', auth.provider_login.bind(null, 'facebook'));
app.get('/auth/google/login/', auth.provider_login.bind(null, 'google'));


// setup star API routes

var inode_api = require('./lib/inode_api');
app.post('/api/inode/', inode_api.inode_create);
app.get('/api/inode/:inode_id', inode_api.inode_read);
app.put('/api/inode/:inode_id', inode_api.inode_update);
app.put('/api/inode/:inode_id/copy', inode_api.inode_copy);
app.del('/api/inode/:inode_id', inode_api.inode_delete);

app.get('/api/inode/src_dev/:device_id', inode_api.inode_source_device);
app.post('/api/inode/:inode_id/multipart/', inode_api.inode_multipart);

app.get('/api/inode/:inode_id/share_list', inode_api.inode_get_share_list);
app.put('/api/inode/:inode_id/share_list', inode_api.inode_set_share_list);

app.post('/api/inode/:inode_id/link', inode_api.inode_mklink);
app.del('/api/inode/:inode_id/link', inode_api.inode_rmlinks);

var user_api = require('./lib/user_api');
app.get('/api/user/', user_api.user_read);
app.put('/api/user/', user_api.user_update);

var email = require('./lib/email');
app.post('/api/user/feedback/', email.user_feedback);

var device_api = require('./lib/device_api');
app.post('/api/device/', device_api.device_create);
app.get('/api/device/', device_api.device_list);
app.put('/api/device/:device_id', device_api.device_update);
app.get('/api/device/current/', device_api.device_current);


// setup admin pages

var adminoobaa = require('./lib/adminoobaa');
app.get('/adminoobaa/', adminoobaa.admin_view);
app.put('/adminoobaa/', adminoobaa.admin_update);

// setup planet pages

app.get('/planet', function(req, res) {
	return res.render('planet_boot.html', common_api.page_context(req));
});
app.get('/planet/window', function(req, res) {
	// return res.render('home.html', common_api.page_context(req));
	return res.render('planet.html', common_api.page_context(req));
});
app.get('/planet/auth', function(req, res) {
	return res.render('planet_auth.html', common_api.page_context(req));
});


// setup user pages

function redirect_no_user(req, res, next) {
	if (!req.user) {
		res.redirect('/welcome');
		return;
	}
	if (!req.session.accessToken || !req.session.tokens) {
		console.log('NO TOKENS FORCE LOGOUT', req.user);
		res.redirect('/auth/logout/?state=/welcome#join');
		return;
	}
	if (req.user.alpha_tester) {
		return next();
	}

	//in case the user is not an alpha tester - we want to validate in the DB if this is still the case.
	User.findById(req.user.id, function(err, user) {
		if (err) {
			return next(err);
		}
		if (!user) {
			res.redirect('/auth/logout/');
			return;
		}
		if (!user.alpha_tester) {
			res.redirect('/thankyou');
			return;
		}
		//user is an approved user
		return next();
	});
}

app.get('/welcome', function(req, res) {
	return res.render('welcome.html', common_api.page_context(req));
});

app.get('/thankyou', function(req, res) {
	if (!req.user) {
		return res.redirect('/welcome');
	}
	return res.render('thankyou.html', common_api.page_context(req));
});

app.get('/help', function(req, res) {
	return res.redirect('/welcome#faq');
	// return res.render('help.html', common_api.page_context(req));
});

app.get('/settings', redirect_no_user, function(req, res) {
	return res.render('settings.html', common_api.page_context(req));
});

app.get('/home*', redirect_no_user, function(req, res) {
	return res.render('home.html', common_api.page_context(req));
});

app.get('/', redirect_no_user, function(req, res) {
	return res.redirect('/home');
});


// start http server
var server = http.createServer(app);
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});

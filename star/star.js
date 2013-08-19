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
var common_api = require('./routes/common_api');

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
dot.templateSettings.cache = ('development' != app.get('env'));
// replace dot regexp to use <% %> to avoid collision with angular {{ }}
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

app.use(express.favicon('/public/images/noobaa_icon.ico'));
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
	// TODO: redirecting to http till we have ssl certificate
	if (fwd_proto === 'https' /*&& req.url !== '/' && req.url !== '/welcome'*/ ) {
		var host = req.get('Host');
		return res.redirect('http://' + host + req.url);
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
app.use('/star_api/', function(req, res, next) {
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
app.use('/public/', express.static(path.join(__dirname, 'public')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'vendor')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'bower_components')));
app.use('/vendor/', express.static(path.join(__dirname, '..', 'node_modules')));
app.use('/', express.static(path.join(__dirname, 'public', 'google')));


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
	e.status = err.status || res.statusCode;
	if (e.status < 400) {
		e.status = 500;
	}
	res.status(e.status);

	if (req.xhr) {
		return res.json(e);
	} else if (req.accepts('html')) {
		return res.render('error.html', {
			err: e,
			req: req
		});
	} else if (req.accepts('json')) {
		return res.json(e);
	} else {
		return res.type('txt').send(e.message || e.toString());
	}
});

function error_404(req, res, next) {
	next({
		status: 404, // not found
		message: 'We dug the earth, but couldn\'t find ' + req.originalUrl
	});
}

function error_403(req, res, next) {
	next({
		status: 403, // forbidden
		message: 'Forgot to login?'
	});
}

function error_501(req, res, next) {
	next({
		status: 501, // not implemented
		message: 'Working on it... ' + req.originalUrl
	});
}



////////////
// ROUTES //
////////////


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

var inode_api = require('./routes/inode_api');
app.post('/star_api/inode/', inode_api.inode_create);
app.get('/star_api/inode/:inode_id', inode_api.inode_read);
app.put('/star_api/inode/:inode_id', inode_api.inode_update);
app.del('/star_api/inode/:inode_id', inode_api.inode_delete);
app.get('/star_api/inode/:inode_id/share_list', inode_api.inode_get_share_list);
app.put('/star_api/inode/:inode_id/share_list', inode_api.inode_set_share_list);

var user_api = require('./routes/user_api');
app.put('/star_api/user/:user_id', user_api.user_update);

var device_api = require('./routes/device_api');
app.post('/star_api/device/', device_api.device_create);
app.get('/star_api/device/', device_api.device_list);
app.get('/star_api/device/:device_id', device_api.device_read);
app.put('/star_api/device/:device_id', device_api.device_update);


// setup admin pages

var adminoobaa = require('./routes/adminoobaa');
app.get('/adminoobaa/', adminoobaa.admin_view);
app.put('/adminoobaa/', adminoobaa.admin_update);

// setup planet pages

app.get('/planet', function(req, res) {
	res.write('<html><body><script>');
	res.write(' var gui = require("nw.gui");');
	res.write(' gui.Window.open("planet/window",');
	res.write(JSON.stringify({
		icon: "noobaa_icon.ico",
		toolbar: false,
		frame: false,
		resizable: false,
		position: "mouse",
		width: 550,
		height: 300
	}));
	res.write(');');
	res.write('</script></body></html>');
	res.end();
});
app.get('/planet/window', function(req, res) {
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
	// NOTE: this check uses the session, and not the DB.
	// so in order to notice a db change it requires logout & login 
	// which will create a new session.
	if (!req.user.alpha_tester) {
		res.redirect('/thankyou');
		return;
	}
	next();
}

app.get('/welcome', function(req, res) {
	return res.render('welcome.html', common_api.page_context(req));
});

app.get('/thankyou', function(req, res) {
	if (!req.user) {
		return res.redirect('/welcome');
	}
	// TODO: uncomment this redirect
	// if (req.user.alpha_tester) {
	// return res.redirect('/mydata');
	// }
	return res.render('thankyou.html', common_api.page_context(req));
});

app.get('/help', redirect_no_user, function(req, res, next) {
	return error_501(req, res, next);
});

app.get('/settings', redirect_no_user, function(req, res, next) {
	return error_501(req, res, next);
});

app.get('/mydevices', redirect_no_user, function(req, res) {
	return res.render('mydevices.html', common_api.page_context(req));
});

app.get('/mydata', redirect_no_user, function(req, res) {
	return res.render('mydata.html', common_api.page_context(req));
});

app.get('/', redirect_no_user, function(req, res) {
	return res.redirect('/mydata');
});


// start http server
var server = http.createServer(app);
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});
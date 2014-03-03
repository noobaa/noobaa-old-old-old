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

// important - dot settings should run before any require() that might use dot
// or else the it will get mess up (like the email.js code)
var dot = require('dot');
dot.templateSettings.strip = false;
dot.templateSettings.cache = true;
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

var path = require('path');
var URL = require('url');
var http = require('http');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var mongoose = require('mongoose');
var express_minify = require('express-minify');
var uglifyjs = require('uglify-js');
var fs = require('fs');
var mime = require('mime');
// var fbapi = require('facebook-api');
var User = require('./models/user').User;
var common_api = require('./lib/common_api');
var auth = require('./lib/auth');
var inode_api = require('./lib/inode_api');
var user_inodes = require('./lib/user_inodes');
var message_api = require('./lib/message_api');
var user_api = require('./lib/user_api');
var email = require('./lib/email');
var device_api = require('./lib/device_api');
var track_api = require('./lib/track_api');
var adminoobaa = require('./lib/adminoobaa');


var nb_debug = (process.env.NB_DEBUG === 'true');

// connect to the database
mongoose.connect(process.env.MONGOHQ_URL);
mongoose.set('debug', nb_debug);

// create express app
var app = express();
var web_port = process.env.PORT || 5000;
app.set('port', web_port);

// setup view template engine with doT
var dot_emc_app = dot_emc.init({
	app: app
});
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

app.use(express.compress());

// using router before static files is optimized
// since we have less routes then files, and the routes are in memory.
app.use(app.router);

function cache_control(seconds) {
	var millis = 1000 * seconds;
	return function(req, res, next) {
		res.setHeader("Cache-Control", "public, max-age=" + seconds);
		res.setHeader("Expires", new Date(Date.now() + millis).toUTCString());
		return next();
	};
}

// setup static files
if (!nb_debug) {
	// setup caching
	app.use(cache_control(10 * 60)); // 10 minutes
	app.use('/public/images/', cache_control(24 * 60 * 60)); // 24 hours
}

function static_files(src) {
	src = path.resolve(src);
	var cache = {};
	var negative_cache = {};
	var express_static = express.static(src);
	return function(req, res, next) {
		// use express static file server for anything that we don't want to minify
		if (!req.path.match(/\.js$/)) {
			return express_static(req, res, next);
		}
		var file_path = path.resolve(path.join(src, req.path));
		// verify that we don't allow to access behind the src dir
		if (file_path.indexOf(src) !== 0) {
			console.error('UNSAFE STATIC FILE PATH', src, file_path);
			return next();
		}
		// fast negative cache
		if (negative_cache[file_path]) {
			console.log('STATIC NEGATIVE CACHE', file_path);
			return next();
		}
		var send_entry = function(entry) {
			res.set('Content-Type', entry.content_type);
			res.removeHeader('Set-Cookie');
			if (req.method === 'GET') {
				res.send(entry.data);
			}
			res.end();
		};
		var entry = cache[file_path];
		if (entry) {
			console.log('STATIC CACHE HIT', file_path);
			send_entry(entry);
			return;
		}
		console.log('STATIC CACHE MISS', file_path);
		fs.readFile(file_path, function(err, data) {
			if (err) {
				console.log('STATIC READ FAILED', file_path, err);
				if (err.code === 'ENOENT' || err.code === 'EISDIR') {
					negative_cache[file_path] = true;
					return next();
				}
				return next(err);
			}
			entry = {
				content_type: mime.lookup(file_path),
				data: data
			};
			// TODO minify also CSS, more?
			if (file_path.match(/\.js$/)) {
				entry.data = uglifyjs.minify(data.toString(), {
					fromString: true,
					mangle: false // TODO mangling fails angular...
				}).code;
			}
			if (entry.data.length < 1024 * 1024) {
				cache[file_path] = entry;
			} else {
				console.log('FILE TOO BIG FOR CACHING', file_path);
			}
			send_entry(entry);
		});
	};
}

app.use('/public/', static_files(path.join(__dirname, 'public')));
app.use('/vendor/', static_files(path.join(__dirname, '..', 'vendor')));
app.use('/vendor-b/', static_files(path.join(__dirname, '..', 'bower_components')));
app.use('/vendor-n/', static_files(path.join(__dirname, '..', 'node_modules')));
app.use('/', express.static(path.join(__dirname, 'public', 'google')));
// app.use('/2FE5F0A5036CF33C937D0E26CE9B0B10.txt', express.static(path.join(__dirname, 'public', 'js')));


// error handlers should be last
// roughly based on express.errorHandler from connect's errorHandler.js
app.use(error_404);
app.use(function(err, req, res, next) {
	console.error('ERROR:', err);
	var e = {};
	if (nb_debug) {
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

var facebook_auth_path = URL.parse(process.env.FACEBOOK_AUTHORIZED_URL).path;
var google_auth_path = URL.parse(process.env.GOOGLE_AUTHORIZED_URL).path;

app.get(facebook_auth_path, auth.provider_authorized.bind(null, 'facebook'));
app.get(google_auth_path, auth.provider_authorized.bind(null, 'google'));


app.get('/auth/facebook/channel.html', auth.facebook_channel);
app.get('/auth/logout/', auth.logout);

app.get('/auth/facebook/login/', auth.provider_login.bind(null, 'facebook'));
app.get('/auth/google/login/', auth.provider_login.bind(null, 'google'));


// setup star API routes

app.post('/api/inode/', inode_api.inode_create);
app.get('/api/inode/', inode_api.inode_query);
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

app.get('/api/inode/:inode_id/message/', message_api.get_inode_messages);
app.post('/api/inode/:inode_id/message/', message_api.post_inode_message);
app.del('/api/inode/:inode_id/message/:message_id', message_api.delete_inode_message);

app.get('/api/user/', user_api.user_read);
app.put('/api/user/', user_api.user_update);
app.get('/api/user/friends/', user_api.user_get_friends);
app.post('/api/user/add_ghosts/', user_api.add_ghosts);

app.post('/api/user/feedback/', email.user_feedback);
app.get('/api/emailtest/', email.test_email_templates);

app.post('/api/device/', device_api.device_create);
app.get('/api/device/', device_api.device_list);
app.put('/api/device/:device_id', device_api.device_update);
app.get('/api/device/current/', device_api.device_current);

app.all('/track/', track_api.track_event_api);
app.all('/track/pixel/', track_api.track_event_pixel);

// setup admin pages

app.get('/adminoobaa/', function(req, res) {
	return res.render('adminoobaa.html', common_api.page_context(req));
});
app.get('/adminoobaa/user/', adminoobaa.admin_get_users);
app.get('/adminoobaa/user/:user_id/usage/', adminoobaa.admin_get_user_usage);
app.all('/adminoobaa/user/:user_id/recent_swm/', adminoobaa.admin_user_notify_by_email);
app.all('/adminoobaa/track/', adminoobaa.admin_get_tracks);
app.all('/adminoobaa/track/csv/', adminoobaa.admin_get_tracks_csv);
app.put('/adminoobaa/', adminoobaa.admin_update);

// setup planet pages

app.get('/planet', function(req, res) {
	return res.render('planet_boot.html', common_api.page_context(req));
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

app.get('/info', function(req, res) {
	return res.render('info.html', common_api.page_context(req));
});

app.get('/home/*', function(req, res) {
	var ctx = common_api.page_context(req);
	if (req.session.signup) {
		ctx.signup = req.session.signup;
		delete req.session.signup;
	}
	if (req.session.signin) {
		ctx.signin = req.session.signin;
		delete req.session.signin;
	}
	return res.render('home.html', ctx);
});
app.get('/home', function(req, res) {
	return res.redirect('/home/');
});

app.get('/player', function(req, res) {
	return res.render('player.html');
});

app.all('/', redirect_no_user, function(req, res) {
	return res.redirect('/home/');
});


// start http server
var server = http.createServer(app);
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});

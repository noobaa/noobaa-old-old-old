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
		console.log('/star_api/', 'User Not Authenticated');
		return res.send(403, "User Not Authenticated");
	}
	return next();
});
app.use('/adminoobaa/', function(req, res, next) {
	// admin validation
	if (!req.user || !req.user.adminoobaa) {
		console.log('ERROR: /adminoobaa/', 'User Not Admin', req.user,
			'HEADERS', req.headers);
		return res.send(404);
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

// errorHandler should be last handler
app.use(express.errorHandler());



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

function redirect_no_user(req, res) {
	if (!req.user) {
		res.redirect('/welcome');
		return true;
	}
	// NOTE: this check uses the session, and not the DB.
	// so in order to notice a db change it requires logout & login 
	// which will create a new session.
	if (!req.user.alpha_tester) {
		res.redirect('/thankyou');
		return true;
	}
	return false;
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

app.get('/mydevices', function(req, res) {
	if (!redirect_no_user(req, res)) {
		return res.render('mydevices.html', common_api.page_context(req));
	}
});

app.get('/mydata', function(req, res) {
	if (!redirect_no_user(req, res)) {
		return res.render('mydata.html', common_api.page_context(req));
	}
});

app.get('/', function(req, res) {
	if (!redirect_no_user(req, res)) {
		return res.redirect('/mydata');
	}
});


// start http server
var server = http.createServer(app);
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});
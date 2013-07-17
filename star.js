var path = require('path');
var util = require('util');
var fs = require('fs');
var http = require('http');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');

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
app.use(express.cookieSession({
	secret: COOKIE_SESSION_SECRET
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use('/public/', express.static(path.join(__dirname, 'public')));


// setup view template engine

var dot_emc_app = dot_emc.init({
	app: app
});
dot.templateSettings.strip = false;
dot.templateSettings.cache = ('development' != app.get('env'));
app.set('views', path.join(__dirname, 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);


// setup database

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGOHQ_URL);


// setup auth with passport

require('./lib/auth').init(app);


// setup invitations request

app.post('/request_invite/', require('./lib/email').email_invite_request);


// setup star API

require('./lib/star_api').init(app);


// setup pages

function page_context(req) {
	return {
		user: req.user,
		app_id: process.env.FACEBOOK_APP_ID,
		channel_url: '', // TODO
		planet_api: 'http://localhost:9888/planet_api/'
	};
}

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
	app.use(express.errorHandler());
}

// start the default http server
server.listen(web_port, function() {
	console.log('Web server on port ' + web_port);
});
var path = require('path');
var util = require('util');
var fs = require('fs');
var http = require('http');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var passport = require('passport');
var mongoose = require('mongoose');

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

app.use(express.favicon('/public/noobaa/images/noobaa_icon.ico'));
app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieSession({
	// TODO: randomize a secret
	secret: 'noobaabaaloobaaissosecretyouwillneverguessit'
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use('/public/', express.static(path.join(__dirname, 'public')));


// setup auth routes
// TODO: add 'auth' prefix in urls (need to change in facebook)

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
app.use('/star_api/', star_api.validations);
app.post('/star_api/inode/', star_api.inode_create);
app.get('/star_api/inode/:inode_id', star_api.inode_read);
app.put('/star_api/inode/:inode_id', star_api.inode_update);
app.del('/star_api/inode/:inode_id', star_api.inode_delete);


// setup pages

function page_context(req) {
	return {
		user: req.user,
		app_id: process.env.FACEBOOK_APP_ID,
		channel_url: '//127.0.0.1:5000/auth/facebook/channel.html', // TODO
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
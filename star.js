var http = require('http');
var path = require('path');
var util = require('util');
var fs = require('fs');
var dot = require('dot');
var dot_emc = require('dot-emc');
var express = require('express');
var app = express();
var server = http.createServer(app);

// setup express app
var web_port = process.env.PORT || 5000;
app.set('port', web_port);
app.set('env', 'development'); // TODO: temporary

// configure app handlers in the order to use them
app.use(express.favicon());
app.use(express.logger());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here')); // TODO
app.use(express.session());
app.use(app.router);
app.use('/public/', express.static(path.join(__dirname, 'public')));

// setup view engine
var dot_emc_app = dot_emc.init({app: app});
dot.templateSettings.strip = false;
dot.templateSettings.cache = ('development' != app.get('env'));
app.set('views', path.join(__dirname, 'views'));
app.engine('dot', dot_emc_app.__express);
app.engine('html', dot_emc_app.__express);

function context() {
	return {
		user: {}, // TODO
		app_id: '528925043810820',
		channel_url: '', // TODO
		planet_api: 'http://localhost:9888/planet_api/'
	};
}

// setup app handlers
app.get('/', function (req, res) {
	res.render('welcome.html', context());
});
app.get('/mydata.html', function (req, res) {
	res.render('mydata.html', context());
});
app.get('/getstarted.html', function (req, res) {
	res.render('getstarted.html', context());
});

// errorHandler should be last handler
if ('development' == app.get('env')) {
	app.use(express.errorHandler());
}

// start the default http server
server.listen(web_port, function () {
	console.log('Web server on port ' + web_port);
});

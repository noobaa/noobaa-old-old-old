var http = require('http');
var path = require('path');
var util = require('util');
var fs = require('fs');
var edot = require('express-dot');
var express = require('express');
var app = express();
var server = http.createServer(app);
// var sio = require('socket.io').listen(server);

// development configurations
app.set('env', 'development'); // TODO: temporary
if ('development' == app.get('env')) {
	app.use(express.errorHandler());
}

// setup express app
var web_port = process.env.PORT || 5000;
app.set('port', web_port);

// configure express to work with the dot template engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'dot');
app.engine('dot', edot.__express );
edot.setGlobals({
	_partialsCache: {},
	// load is reserved for partial loading. 
	// {{# def.load('/patials/sample.dot') }} 
	// will load partial template from __dirname + file path
	load: function (file) {
		var template = null;
		// load from cache
		if (app.get('env') != 'development') {
			template = this._partialsCache[file];
		}
		// no content so load from file system 
		if (template == null) {
			template = fs.readFileSync(path.join(app.get('views'), file));
		}
		// cache the partial  
		if (app.get('env') != 'development') {
			this._partialsCache[file] = template;
		}
		return template;
	}
});

// configure app handlers in the order to use them
app.use(express.favicon());
app.use(express.logger());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here')); // TODO
app.use(express.session());
app.use(app.router);
app.use('/public/', express.static(path.join(__dirname, 'public')));

// setup app handlers
app.get('/', function (req, res) {
	res.render('index', {
		user: {}
	});
});

/*
app.post('/write/', function (req, res) {
	var token = req.body.token;
	console.log('sending write', token);
	fs.readFile(req.files.file.path, function (err, data) {
		if (err) {
			console.err("failed to read uploaded file", err);
			return;
		}
		console.log('planet_write', token);
		sio.sockets.emit('planet_write', token, data);
	});
	res.send('thanks');
});

app.get('/read/', function (req, res) {
	var token = req.body.token;
	console.log('sending read', token);
	sio.emit('planet_read', token);
	res.send('thanks');
});


// setup socket.io
sio.sockets.on('connection', function (socket) {

	socket.on('planet_readdir', function (path, err, files) {
		console.log('planet_readdir', path, err, files);
	});

	socket.on('planet_read', function (token, err, data) {
		console.log('planet_read', token, err, data);
	});

	socket.on('planet_write', function (token, err) {
		console.log('planet_write', token, err);
	});

	socket.on('disconnect', function () {
		console.log('disconnect');
	});
});
*/

// start the default http server
server.listen(web_port, function () {
	console.log('Web server on port ' + web_port);
});

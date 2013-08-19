/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
// var models = require('./models');
// var Task = models.Task;

var db;

process.env.FACEBOOK_APP_ID = '123';
process.env.FACEBOOK_SECRET = 'sec';
process.env.FACEBOOK_AUTHORIZED_URL = 'callback';
process.env.MONGOHQ_URL = 'mongodb://admin:admin@localhost/test';

var auth = require('./auth.js');

var req = {
	_readableState: {
		highWaterMark: 16384,
		buffer: [],
		length: 0,
		pipes: null,
		pipesCount: 0,
		flowing: false,
		ended: true,
		endEmitted: false,
		reading: false,
		calledRead: false,
		sync: true,
		needReadable: false,
		emittedReadable: false,
		readableListening: false,
		objectMode: false,
		defaultEncoding: 'utf8',
		ranOut: false,
		awaitDrain: 0,
		readingMore: false,
		decoder: null,
		encoding: null
	},
	readable: true,
	domain: null,
	_events: {},
	_maxListeners: 10,
	socket: {
		_connecting: false,
		_handle: [Object],
		_readableState: [Object],
		readable: true,
		domain: null,
		_events: [Object],
		_maxListeners: 10,
		_writableState: [Object],
		writable: true,
		allowHalfOpen: true,
		onend: [Function],
		destroyed: false,
		errorEmitted: false,
		bytesRead: 5633,
		_bytesDispatched: 4318,
		_pendingData: null,
		_pendingEncoding: '',
		server: [Object],
		_idleTimeout: 120000,
		_idleNext: [Object],
		_idlePrev: [Object],
		_idleStart: 1376124783903,
		parser: [Object],
		ondata: [Function],
		_httpMessage: [Object],
		_peername: [Object]
	},
	connection: {
		_connecting: false,
		_handle: [Object],
		_readableState: [Object],
		readable: true,
		domain: null,
		_events: [Object],
		_maxListeners: 10,
		_writableState: [Object],
		writable: true,
		allowHalfOpen: true,
		onend: [Function],
		destroyed: false,
		errorEmitted: false,
		bytesRead: 5633,
		_bytesDispatched: 4318,
		_pendingData: null,
		_pendingEncoding: '',
		server: [Object],
		_idleTimeout: 120000,
		_idleNext: [Object],
		_idlePrev: [Object],
		_idleStart: 1376124783903,
		parser: [Object],
		ondata: [Function],
		_httpMessage: [Object],
		_peername: [Object]
	},
	httpVersion: '1.1',
	complete: true,
	headers: {
		host: '127.0.0.1:5000',
		connection: 'keep-alive',
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'user-agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36',
		'accept-encoding': 'gzip,deflate,sdch',
		'accept-language': 'en-US,en;q=0.8',
		cookie: 'noobaa_session=s%3Aj%3A%7B%22passport%22%3A%7B%7D%7D.ClCEyKbLytbkVcsQDT2XZ%2BU6xeJwAIRONmy0MZQ2vpU'
	},
	trailers: {},
	_pendings: [],
	_pendingIndex: 0,
	url: '/auth/facebook/authorized/?code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI',
	method: 'GET',
	statusCode: null,
	client: {
		_connecting: false,
		_handle: [Object],
		_readableState: [Object],
		readable: true,
		domain: null,
		_events: [Object],
		_maxListeners: 10,
		_writableState: [Object],
		writable: true,
		allowHalfOpen: true,
		onend: [Function],
		destroyed: false,
		errorEmitted: false,
		bytesRead: 5633,
		_bytesDispatched: 4318,
		_pendingData: null,
		_pendingEncoding: '',
		server: [Object],
		_idleTimeout: 120000,
		_idleNext: [Object],
		_idlePrev: [Object],
		_idleStart: 1376124783903,
		parser: [Object],
		ondata: [Function],
		_httpMessage: [Object],
		_peername: [Object]
	},
	_consuming: false,
	_dumped: false,
	httpVersionMajor: 1,
	httpVersionMinor: 1,
	upgrade: false,
	originalUrl: '/auth/facebook/authorized/?code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI',
	_parsedUrl: {
		protocol: null,
		slashes: null,
		auth: null,
		host: null,
		port: null,
		hostname: null,
		hash: null,
		search: '?code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI',
		query: 'code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI',
		pathname: '/auth/facebook/authorized/',
		path: '/auth/facebook/authorized/?code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI',
		href: '/auth/facebook/authorized/?code=AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI'
	},
	query: {
		code: 'AQCepUsvWeFxBlRzACS0gQ7QAF8nCu3e-WihB0yqY-Bw79-N6pa-s2DDGOMPM1Gv4oldYsD3av2SnClKHnwnVhcuOeYHmIJCzIrFWV6yBEF_ZX0mqD72lnqqH8N8ZXmkWidChK3QIjVs7htjoJURewSm58M4SeHG0qSZ2yiUWSbxLJ45GAX9DzViNQfdR1zEkVP6yogyXKDndD6ve0ubo6RHVaXhCbQTR17ETAJKOW3txErmPk-q7FP4NqYyK0RI_zIOoYKBSRukgD-n9X418fBJzXgZcPCOoTTXWooXD03yFUYuUEIJ1tmS6PQxu5MUUKI'
	},
	res: {
		domain: null,
		_events: [Object],
		_maxListeners: 10,
		output: [],
		outputEncodings: [],
		writable: true,
		_last: false,
		chunkedEncoding: false,
		shouldKeepAlive: true,
		useChunkedEncodingByDefault: true,
		sendDate: true,
		_hasBody: true,
		_trailer: '',
		finished: false,
		_hangupClose: false,
		socket: [Object],
		connection: [Object],
		_headers: [Object],
		_headerNames: [Object],
		//		req: [Circular],
		//locals: [Function: locals],
		//		end: [Function]
	},
	//next: [Function: next],
	//_startTime: Sat Aug 10 2013 11: 53: 03 GMT + 0300(IDT),
	secret: '.9n>(3(Tl.~8Q4mL9fhzqFnD;*vbd\\8cI!&3r#I!y&kP>PkAksV4&SNLj+iXl?^{O)XIrRDAFr+CTOx1Gq/B/sM+=P&j)|X|cI}c>jmEf@2TZmQJhEMk_WZMT:l6Z(4rQK$\\NT*Gcnv.0F9<c<&?E>Uj(x!z_~%075:%DHRhL"3w-0W+r)bV!)x)Ya*i]QReP"T+e@;_',
	cookies: {},
	signedCookies: {
		noobaa_session: [Object]
	},
	body: {},
	files: {},
	originalMethod: 'GET',
	session: {
		passport: {},
		cookie: [Object]
	},
	_passport: {
		instance: [Object],
		session: {}
	},
	_route_index: 1,
	route: {
		path: '/auth/facebook/authorized/',
		method: 'get',
		callbacks: [Object],
		keys: [],
		regexp: /^\/auth\/facebook\/authorized\/\/?$/i,
		params: []
	},
	params: []
};

var accessToken = 'CAAHhDfVZAYgQBAOR44yAMyjnZA9x6VghBN9CfFEDEhPjyHk2ZA9kA40NqLPsBuGzA457cfQ8aummtg1r7ncZAe7TVw1wr8Bic4Xl1m6QuALeiGvMo3pdZCkLgV1YZCN9hLAKFD6nM6mlLGZBLL61DvmJxUas8AeMWMZD';
var refreshToken = null;
var profile = {
	provider: 'facebook',
	id: '100000601353304',
	username: 'yuval.dimnik',
	displayName: 'Yuval Dimnik',
	name: {
		familyName: 'Dimnik',
		givenName: 'Yuval',
		middleName: undefined
	},
	gender: 'male',
	profileUrl: 'https://www.facebook.com/yuval.dimnik',
	emails: [
		[Object]
	],
	_raw: '{"id":"100000601353304","name":"Yuval Dimnik","first_name":"Yuval","last_name":"Dimnik","link":"https:\\/\\/www.facebook.com\\/yuval.dimnik","username":"yuval.dimnik","hometown":{"id":"103113623062213","name":"Bat Yam"},"location":{"id":"114749948541219","name":"Ramot Me\'ir"},"quotes":"\\"Smile, you don\'t have much left\\" - Me","work":[{"employer":{"id":"7706457055","name":"Dell"},"start_date":"2010-02-01","end_date":"2013-05-01"},{"employer":{"id":"109337459095423","name":"Exanet"},"start_date":"2005-07-01","end_date":"2010-02-01"}],"sports":[{"id":"111932052156866","name":"Surfing","with":[{"id":"679921464","name":"Tomer Mizrahi"},{"id":"596358122","name":"Kfir Dahan"}]}],"education":[{"school":{"id":"105960532777745","name":"Shazar High School"},"year":{"id":"137409666290034","name":"1995"},"type":"High School"},{"school":{"id":"176662212386543","name":"Tel Aviv University | \\u05d0\\u05d5\\u05e0\\u05d9\\u05d1\\u05e8\\u05e1\\u05d9\\u05d8\\u05ea \\u05ea\\u05dc-\\u05d0\\u05d1\\u05d9\\u05d1"},"type":"College"},{"school":{"id":"176662212386543","name":"Tel Aviv University | \\u05d0\\u05d5\\u05e0\\u05d9\\u05d1\\u05e8\\u05e1\\u05d9\\u05d8\\u05ea \\u05ea\\u05dc-\\u05d0\\u05d1\\u05d9\\u05d1"},"degree":{"id":"196378900380313","name":"MBA"},"year":{"id":"140617569303679","name":"2007"},"type":"Graduate School"}],"gender":"male","email":"yuval.dimnik\\u0040gmail.com","timezone":3,"locale":"en_US","verified":true,"updated_time":"2013-08-06T09:32:25+0000"}',
	_json: {
		id: '100000601353304',
		name: 'Yuval Dimnik',
		first_name: 'Yuval',
		last_name: 'Dimnik',
		link: 'https://www.facebook.com/yuval.dimnik',
		username: 'yuval.dimnik',
		hometown: [Object],
		location: [Object],
		quotes: '"Smile, you don\'t have much left" - Me',
		work: [Object],
		sports: [Object],
		education: [Object],
		gender: 'male',
		email: 'yuval.dimnik@gmail.com',
		timezone: 3,
		locale: 'en_US',
		verified: true,
		updated_time: '2013-08-06T09:32:25+0000'
	}
};

//var done = Function: verified; 
var rand_fb_id = Math.floor((Math.random() * 100000) + 1);

exports.test_auth = {
	setUp: function(callback) {
		try {
			//db.connection.on('open', function() {
			mongoose.connection.on('open', function() {
				console.log('Opened connection');
				callback();
			});

			db = mongoose.connect(process.env.MONGOHQ_URL);
			console.log('Started connection, waiting for it to open');
		} catch (err) {
			console.log('Setting up failed:', err.message);
		}
	},

	'Create new user': function(test) {
		profile.id = rand_fb_id;
		console.log("Create new user test:");
		test.ifError(
			auth.create_user(profile, function(err, user) {
				console.log("callback from test user login");
				test.done();
			}));
	},

    tearDown: function(callback) {
        console.log('In tearDown');
        try {
            console.log('Closing connection');
            db.disconnect();
            callback();
        }

        catch (err) {
            console.log('Tearing down failed:', err.message);
        }
    },

	/*
	'login of know user - yuvald': function(test) {
		console.log("before");
		test.ifError(
			auth.user_login(req, accessToken, refreshToken, profile, function() {
				console.log("callback from test user login");
			}));
		test.done();
	},
*/

};
/* jshint node:true */
'use strict';

var path = require('path');
var TrackEvent = require('../models/track_event').TrackEvent;
var common_api = require('./common_api');

// grab the Mixpanel factory
// create an instance of the mixpanel client
// var Mixpanel = require('mixpanel');
// var mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);

function mixpanel_pixel_url(event_name, user_id, ctx) {
	var data = {
		event: event_name,
		properties: {
			token: process.env.MIXPANEL_TOKEN,
			distinct_id: user_id,
			ctx: ctx
		}
	};
	var data_buf = new Buffer(JSON.stringify(data));
	var pixel_url = 'http://api.mixpanel.com/track/?data=' + data_buf.toString('base64') + '&ip=1&img=1';
	return pixel_url;
}

var TRANSPARENT_PIXEL_PATH = path.resolve(__dirname, '../public/images/transparent_pixel.gif');
var TRACKING_SECRET = 'CxUOs6NajK8oFU2pdxXiMyOlR72r0m1E';

function tracking_pixel_url(event_name, data, user, ctx) {
	var e = {
		event: event_name,
	};
	if (data) {
		e.data = data;
	}
	if (user) {
		e.user = user;
	}
	if (ctx) {
		e.ctx = ctx;
	}
	var code = common_api.json_encode_sign(e, TRACKING_SECRET);
	var pixel_url = process.env.NB_BASE_URL + '/track/pixel/?d=' + code.data + '&s=' + code.sign;
	console.log('TRACKING PIXEL URL', pixel_url);
	return pixel_url;
}

/*
console.log('TEST TRACKING URL', tracking_pixel_url('testing', null, {
	name: 'testuser'
}));
*/

function track_event_pixel(req, res) {
	var e = common_api.json_decode_sign(req.query.d, req.query.s, TRACKING_SECRET);
	if (e) {
		console.log('TRACKING PIXEL EVENT', e.event);
		track_event(e.event, e.data, e.user, req);
	} else {
		console.error('TRACKING PIXEL SIGN MISMATCH', req.query.data, req.query.sign);
	}
	res.sendfile(TRANSPARENT_PIXEL_PATH);
}

function track_event_api(req, res) {
	// we are not waiting for the callback, worst case we loose an event, 
	// and we prefer not to hold the ui here for that
	track_event(req.body.event, req.body.data, req.user, req);
	res.end();
}

function track_event(event, data, user, req, callback) {
	var e = new TrackEvent();
	e.event = event;
	if (data) {
		e.data = data;
	}
	if (user) {
		e.user.id = user.id;
		e.user.name = user.name;
		e.user.fbid = user.fbid;
		e.user.googleid = user.googleid;
	}
	if (req) {
		e.req.ip = req.headers['x-forwarded-for'] || req.ip;
	}
	return e.save(callback);
}

exports.mixpanel_pixel_url = mixpanel_pixel_url;
exports.tracking_pixel_url = tracking_pixel_url;
exports.track_event_api = track_event_api;
exports.track_event_pixel = track_event_pixel;
exports.track_event = track_event;

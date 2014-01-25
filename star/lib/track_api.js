/* jshint node:true */
'use strict';

var TrackEvent = require('../models/track_event').TrackEvent;


// grab the Mixpanel factory
// create an instance of the mixpanel client
// var Mixpanel = require('mixpanel');
// var mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);

function tracking_pixel_url(event_name, disinct_id) {
	var data = {
		"event": event_name,
		"properties": {
			"token": process.env.MIXPANEL_TOKEN,
			"distinct_id": disinct_id,
		}
	};
	var data_buf = new Buffer(JSON.stringify(data));
	var pixel_url = 'http://api.mixpanel.com/track/?data=' + data_buf.toString('base64') + '&ip=1&img=1';
	return pixel_url;
}

function track_event_api(req, res) {
	track_event(req.body.event, req.body.data, req.body.prev, req.body.top, req.user, {
		ip: req.headers['x-forwarded-for'] || req.ip
	});
	res.end();
}

function track_event_pixel(req, res) {
	var data = req.query.data;
	// TODO PARSE TRACK DATA !!
	res.sendfile('../public/images/transparent_pixel.gif');
}

function track_event(event, data, prev, top, user, req, callback) {
	var e = new TrackEvent();
	e.event = event;
	e.data = data;
	if (prev) {
		e.prev = prev;
	}
	if (top) {
		e.top = top;
	}
	if (user) {
		e.user.id = user.id;
		e.user.name = user.name;
		e.user.fbid = user.fbid;
		e.user.googleid = user.googleid;
	}
	if (req) {
		e.req.ip = req.ip;
	}
	return e.save(callback);
}

exports.tracking_pixel_url = tracking_pixel_url;
exports.track_event_api = track_event_api;
exports.track_event_pixel = track_event_pixel;
exports.track_event = track_event;

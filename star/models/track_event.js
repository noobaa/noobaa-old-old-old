/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var track_event_schema = new mongoose.Schema({
	event: String,
	data: {}, // custom info about the event
	time: {
		type: Date,
		default: Date.now
	},
	user: { // info about the user that created the event
		id: types.ObjectId,
		name: String,
		fbid: String,
		googleid: String
	},
	req: { // info about the request itself
		ip: String
	}
});

track_event_schema.index({
	event: 1
}, {
	unique: false,
});

track_event_schema.index({
	time: 1
}, {
	unique: false,
});

exports.TrackEvent = mongoose.model('TrackEvent', track_event_schema);

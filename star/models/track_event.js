/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var track_event_schema = new mongoose.Schema({
	event: String,
	data: {}, // custom info about the event
	prev: types.ObjectId, // previos event of the flow
	top: types.ObjectId, // top event of the flow
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

exports.TrackEvent = mongoose.model('TrackEvent', track_event_schema);

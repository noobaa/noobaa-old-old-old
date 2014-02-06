/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var message_schema = new mongoose.Schema({
	user: types.ObjectId,
	text: String,
	create_time: {
		type: Date,
		default: Date.now
	},
	subject_inode: types.ObjectId,
	subject_user: types.ObjectId,
	removed_by: types.ObjectId,
	removed_time: Date,
});

message_schema.index({
	user: 1
}, {
	unique: false
});

message_schema.index({
	subject_inode: 1
}, {
	unique: false
});

message_schema.index({
	subject_user: 1
}, {
	unique: false
});


var Message = mongoose.model('Message', message_schema);
exports.Message = Message;

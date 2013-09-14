/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

var fobj_schema = new mongoose.Schema({
	size: Number,
	content_type: String,
	uploading: Boolean,
	s3_multipart: {
		upload_id: String,
		next_part: Number,
		part_size: Number
	}
});

exports.Fobj = mongoose.model('Fobj', fobj_schema);
/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

var fobj_schema = new mongoose.Schema({
	size: Number,
	content_type: String,
	uploading: Boolean,
	s3_multipart: {
		upload_id: String,
		part_size: Number
	},
	hash: String,
	sample_offset: Number,
	sample_size: Number,
	sample_data: Buffer,
});

exports.Fobj = mongoose.model('Fobj', fobj_schema);
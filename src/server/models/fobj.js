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
});

// We query by the file hash to search for duplicates
fobj_schema.index({
	hash: 1
}, {
	unique: false
});

exports.Fobj = mongoose.model('Fobj', fobj_schema);
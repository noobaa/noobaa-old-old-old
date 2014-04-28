/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var blog_schema = new mongoose.Schema({
	headline: String,
	time: {
		type: Date,
		default: Date.now
	},
	subject: String,
	image_url: String,
	author: {
		name: String,
		title: String,
		profile_url: String,
	},
	content_html: String,
});

blog_schema.index({
	headline: 1
}, {
	unique: true
});


var Blog = mongoose.model('Blog', blog_schema);
exports.Blog = Blog;

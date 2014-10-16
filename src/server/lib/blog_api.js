/* jshint node:true */
'use strict';

var _ = require('lodash');
var async = require('async');
var common_api = require('./common_api');
var Blog = require('../models/blog').Blog;


exports.blog_list = function(req, res) {
	return async.waterfall([
		function(next) {
			console.log('LIST BLOGS');
			return Blog.find().select('-content_html').exec(next);
		},
		function(blogs, next) {
			console.log('LIST BLOGS', blogs);
			return next(null, {
				blogs: blogs
			});
		}
	], common_api.reply_callback(req, res, 'BLOG LIST'));
};

exports.blog_get = function(req, res) {
	return async.waterfall([
		function(next) {
			return Blog.findOne({
				headline: req.params.headline
			}, next);
		},
		function(blog, next) {
			return next(null, {
				blog: blog
			});
		}
	], common_api.reply_callback(req, res, 'BLOG GET'));
};

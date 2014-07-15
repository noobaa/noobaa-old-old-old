/* jshint node:true */
/* jshint -W099 */
'use strict';

// var _ = require('underscore');
var async = require('async');
// var mongoose = require('mongoose');
var Fobj = require('../models/fobj').Fobj;
var common_api = require('./common_api');

exports.hash_query = function(req, res) {
	async.waterfall([
		//find in DB an object with these hash types
		//return if exists or not
		function(next) {
			return Fobj
				.findOne({
					hash: req.query.hash,
					size: req.query.size
				})
				.exec(next);
		},
		function(matching_fobj, next) {
			var found = matching_fobj ? true : false;
			return next(null, {
				found_hash_match: found,
				range_offset: matching_fobj ? generate_range_offset_from_id(matching_fobj._id) : null,
				range_size: matching_fobj ? generate_range_size_from_id(matching_fobj._id) : null,
			});
		},
	], common_api.reply_callback(req, res, 'Hash query'));
};

function generate_range_offset_from_id(object_id) {
	return 100;
}

function generate_range_size_from_id(object_id) {
	return 4096;
}
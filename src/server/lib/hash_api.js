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
			// didn't find a matching object - no dedupe
			if (!matching_fobj) {
				return next(null, {
					found_hash_match: false,
				});
			}
			//found matching object - provide info to send sample
			if (!req.query.sample) {
				return next(null, {
					found_hash_match: true,
					range_offset: generate_range_offset_from_id(matching_fobj._id),
					range_size: generate_range_size_from_id(matching_fobj._id),
				});
			}
			//found matching object and sample provided
			return next(null, {
				found_hash_match: true,
				sample_match: sample_compare(req.query.sample, matching_fobj.sample_data)
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

function sample_compare(buff1, buff2){
	//not sure how to compare
	return false;
}
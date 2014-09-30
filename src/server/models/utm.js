/* jshint node:true */
'use strict';

//refid is NooBaa's custome field we used in the past. We'll see how used in the future.
// Rest of the fields could be found here: https://support.google.com/analytics/answer/1033867?hl=en
// var utm_tracked_field = ['utm_source', 'utm_medium', 'utm_term', 'utm_content', 'utm_campaign'];
// exports.utm_tracked_field = utm_tracked_field;

var mongoose = require('mongoose');

var utm_schema = new mongoose.Schema({
	utm_source: String,
	utm_medium: String,
	utm_term: String,
	utm_content: String,
	utm_campaign: String,
});

var UtmModel = mongoose.model('UtmModel', utm_schema);
exports.UtmModel = UtmModel;


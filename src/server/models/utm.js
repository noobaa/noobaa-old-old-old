/* jshint node:true */
'use strict';

//refid is NooBaa's custome field we used in the past. We'll see how used in the future.
// Rest of the fields could be found here: https://support.google.com/analytics/answer/1033867?hl=en
// var utm_tracked_field = ['utm_source', 'utm_medium', 'utm_term', 'utm_content', 'utm_campaign'];
// exports.utm_tracked_field = utm_tracked_field;

var mongoose = require('mongoose');
var _ = require('lodash');

var utm_schema = new mongoose.Schema({
	utm_source: String,
	utm_medium: String,
	utm_term: String,
	utm_content: String,
	utm_campaign: String,
});

var UtmModel = mongoose.model('UtmModel', utm_schema);
exports.UtmModel = UtmModel;


//get the UTM field names from the DB scheme
var utm_tracked_field = _.without(_.keys(UtmModel.schema.paths), '_id', '__v');
exports.utm_tracked_field = utm_tracked_field;

var empty_utm = _.object(utm_tracked_field, Array.apply(null, new Array(utm_tracked_field.length)).map(String.prototype.valueOf, ''));
exports.empty_utm = empty_utm;
/*jslint node: true */
'use strict';

process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err + err.stack);
});

process.env.FACEBOOK_APP_ID = '123';
process.env.FACEBOOK_SECRET = 'sec';
process.env.FACEBOOK_AUTHORIZED_URL = 'callback';
var async = require('async');

exports.get_rand_entry = get_rand_entry;

function get_rand_entry(model, selection, callback) {
	async.waterfall([
		//there doens't sees to be a good way to get a random record. 
		//http://stackoverflow.com/questions/2824157/random-record-from-mongodb
		function(next) {
			model.find(selection, {
				_id: 1
			}, next);
		},
		function(ids, next) {
			// console.log(ids);
			var rand_id = ids[Math.floor(Math.random() * ids.length)];
			// console.log(rand_id);
			model.findById(rand_id._id, next);
		},
		/*		// the following functin is really not requried but is useful for debug.
		function(entry, next) {
			console.log(entry);
			next(null, user);
		},
*/
	], callback);

}
/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

// Convinient callback maker for handling the reply of async control flows.
// Example usage:
//		async.waterfall([
//			...
//		], reply_callback(req, res, debug_info));

function reply_callback(req, res, debug_info) {
	return function(err, reply) {
		if (err) {
			console.log('FAILED', debug_info, ':', err);
			if (err.status) {
				return res.json(err.status, err.info);
			} else {
				return res.json(500, err);
			}
		}
		if (!res.headerSent) {
			console.log('COMPLETED', debug_info);
			return res.json(200, reply);
		}
	};
}

function check_ownership(user_id, obj, next) {
	if (!obj) {
		return next({
			status: 404, // HTTP Not Found
			info: 'Not Found'
		});
	}
	if (!mongoose.Types.ObjectId(user_id).equals(obj.owner)) {
		return next({
			status: 403, // HTTP Forbidden
			info: 'User Not Owner'
		});
	}
	return next(null, obj);
}

// Convinient callback maker to check the object owner matching to the req.user
// Example usage:
//		async.waterfall([
//			req_ownership_checker(req),
//		], reply_callback(req, res, debug_info));

function req_ownership_checker(req) {
	return function(obj, next) {
		check_ownership(req.user.id, obj, next);
	};
}

function page_context(req) {
	return {
		user: req.user,
		app_id: process.env.FACEBOOK_APP_ID,
		// TODO: channel_url expects absolute/relative/even needed?
		channel_url: '/auth/facebook/channel.html'
	};
}


exports.reply_callback = reply_callback;
exports.check_ownership = check_ownership;
exports.req_ownership_checker = req_ownership_checker;
exports.page_context = page_context;
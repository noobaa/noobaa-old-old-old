/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

// TODO: change reply_callback to return a function - less complex

// Convinient callback for handling the reply of async control flows.
// 'this' should be the bound to the response.
//
// Example usage:
//	async.waterfall(
//		[...],
//		reply_callback.bind(res, debug_info)
//	);

function reply_callback(debug_info, err, reply) {
	/* jshint validthis:true */
	if (err) {
		console.log('FAILED', debug_info, ':', err);
		if (err.status) {
			return this.json(err.status, err.info);
		} else {
			return this.json(500, err);
		}
	}
	if (!this.headerSent) {
		console.log('COMPLETED', debug_info);
		return this.json(200, reply);
	}
}

// Check the object owner matching to the req.user
// 'this' should be the bound to the request.
//
// Example usage:
//	async.waterfall([
//		check_inode_ownership.bind(req),
//		], reply_callback.bind(res, reply, debug_info)
//	);

function check_ownership(obj, next) {
	/* jshint validthis:true */
	if (!obj) {
		return next({
			status: 404, // HTTP Not Found
			info: 'Not Found'
		});
	}
	var user_id = mongoose.Types.ObjectId(this.user.id);
	if (!user_id.equals(obj.owner)) {
		return next({
			status: 403, // HTTP Forbidden
			info: 'User Not Owner'
		});
	}
	return next(null, obj);
}

function check_ownership2(user_id, obj, next) {
	/* jshint validthis:true */
	if (!obj) {
		return next({
			status: 404, // HTTP Not Found
			info: 'Not Found'
		});
	}
	var luser_id;
	if (user_id instanceof mongoose.Types.ObjectId) {
		luser_id = user_id;
	} else {
		luser_id = mongoose.Types.ObjectId(user_id);
	}
	if (!luser_id.equals(obj.owner)) {
		return next({
			status: 403, // HTTP Forbidden
			info: 'User Not Owner'
		});
	}
	return next(null, obj);
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
exports.check_ownership2 = check_ownership2;
exports.page_context = page_context;
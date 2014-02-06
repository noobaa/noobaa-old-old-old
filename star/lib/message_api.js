/* jshint node:true */
/* jshint -W099 */
'use strict';

var _ = require('underscore');
var async = require('async');
var mongoose = require('mongoose');

var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var Message = require('../models/message').Message;
var user_inodes = require('./user_inodes');
var email = require('./email');
var common_api = require('./common_api');
var track_api = require('./track_api');


exports.get_inode_messages = function(req, res) {
	var user_id = mongoose.Types.ObjectId(req.user.id);
	var messages;
	return async.waterfall([

		function(next) {
			return Inode.findById(req.params.inode_id, next);
		},

		// check inode ownership
		common_api.check_ownership.bind(null, req.user.id),

		function(inode, next) {
			if (inode.ghost_ref) {
				return Inode.findById(inode.ghost_ref, next);
			} else {
				return next(null, inode);
			}
		},

		function(inode, next) {
			return Message.find({
				subject_inode: inode.id,
				removed_by: {
					$exists: false
				}
			}).sort({
				_id: 1
			}).exec(next);
		},

		function(msgs, next) {
			messages = msgs;
			return User.find({
				_id: {
					$in: _.pluck(messages, 'user')
				}
			}, next);
		},

		function(users, next) {
			var users_by_id = _.indexBy(users, '_id');
			var messages_reply = new Array(messages.length);
			for (var i = 0; i < messages.length; i++) {
				var msg = messages[i];
				var user = users_by_id[msg.user];
				messages_reply[i] = {
					id: msg._id,
					user: user && user.get_user_identity_info(),
					text: msg.text,
					create_time: msg.create_time,
					is_mine: is_message_mine(user_id, msg)
				};
			}
			return next(null, messages_reply);
		}
	], common_api.reply_callback(req, res, 'MSG GET'));
};


exports.post_inode_message = function(req, res) {
	return async.waterfall([

		function(next) {
			return Inode.findById(req.params.inode_id, next);
		},

		// check inode ownership
		common_api.check_ownership.bind(null, req.user.id),

		function(inode, next) {
			if (inode.ghost_ref) {
				return Inode.findById(inode.ghost_ref, next);
			} else {
				return next(null, inode);
			}
		},

		function(inode, next) {
			var msg = new Message();
			msg.user = req.user.id;
			msg.text = req.body.text;
			msg.subject_inode = inode.id;
			msg.subject_user = inode.owner;
			return msg.save(next);
		},

		function(message, num, next) {
			track_api.track_event('message.post', null, req.user, req);
			return next();
		}
	], common_api.reply_callback(req, res, 'MSG POST'));
};


exports.delete_inode_message = function(req, res) {
	var user_id = mongoose.Types.ObjectId(req.user.id);
	return async.waterfall([

		function(next) {
			return Message.findById(req.params.message_id, next);
		},

		function(message, next) {
			if (!is_message_mine(user_id, message)) {
				return next({
					status: 403, // HTTP Forbidden
					data: 'User Not Owner'
				});
			}
			message.removed_by = req.user.id;
			message.removed_time = new Date();
			return message.save(next);
		},

		function(message, num, next) {
			track_api.track_event('message.remove', null, req.user, req);
			return next();
		}

	], common_api.reply_callback(req, res, 'MSG DEL'));
};


function is_message_mine(user_id, msg) {
	return user_id.equals(msg.user) || (msg.subject_user && user_id.equals(msg.subject_user));
}

/* jshint node:true */
/* jshint -W099 */
'use strict';

var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');

var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var Message = require('../models/message').Message;
var user_inodes = require('./user_inodes');
var email = require('./email');
var common_api = require('./common_api');
var track_api = require('./track_api');


exports.message_to_entry = message_to_entry;

function message_to_entry(msg, user_id) {
	return {
		id: msg._id,
		user: msg.user && msg.user.get_user_identity_info(),
		text: msg.text,
		create_time: msg.create_time,
		is_mine: is_message_mine(user_id, msg)
	};
}


exports.get_inode_messages = function(req, res) {
	var user_id = mongoose.Types.ObjectId(req.user.id);
	return async.waterfall([

		function(next) {
			return Inode.findById(req.params.inode_id, next);
		},

		// check inode ownership
		common_api.check_ownership.bind(null, req.user.id),

		function(inode, next) {
			var subject_id = inode.ghost_ref || inode.id;
			return Message.find({
				subject_inode: subject_id,
				removed_by: {
					$exists: false
				}
			}).sort({
				create_time: 1
			}).populate('user').exec(next);
		},

		function(messages, next) {
			var messages_reply = _.map(messages, function(msg) {
				return message_to_entry(msg, user_id);
			});
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
			var msg = new Message();
			msg.user = req.user.id;
			msg.text = req.body.text;
			if (inode.ghost_ref) {
				msg.subject_inode = inode.ghost_ref;
				msg.subject_user = inode.ref_owner;
			} else {
				msg.subject_inode = inode.id;
				msg.subject_user = inode.owner;
			}
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
					message: 'User Not Owner'
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
	var msg_user_id = msg.populated('user') || msg.user;
	if (msg_user_id && user_id.equals(msg_user_id)) {
		return true;
	}
	if (msg.subject_user && user_id.equals(msg.subject_user)) {
		return true;
	}
	return false;
}

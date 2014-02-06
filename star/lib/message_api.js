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


exports.get_inode_messages = function(req, res) {
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
				subject_inode: inode.id
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
			for (var i = 0; i < messages.length; i++) {
				var msg = messages[i] = messages[i].toObject();
				var user = users_by_id[msg.user];
				msg.user = user && user.get_user_identity_info();
				msg.id = msg._id;
				delete msg._id;
			}
			return next(null, messages);
		}
	], common_api.reply_callback(req, res, 'MSG GET'));
};


exports.post_inode_message = function(req, res) {
	var inode_id = req.params.inode_id;
	return async.waterfall([
		function(next) {
			var msg = new Message();
			msg.user = req.user.id;
			msg.text = req.body.text;
			msg.subject_inode = inode_id;
			return msg.save(next);
		}
	], common_api.reply_callback(req, res, 'MSG POST'));
};


exports.delete_inode_message = function(req, res) {
	var inode_id = req.params.inode_id;
	var msg_id = req.params.message_id;
	return async.waterfall([
		function(next) {
			return Message.findByIdAndRemove(msg_id, next);
		}
	], common_api.reply_callback(req, res, 'MSG DEL'));
};

/* jshint node:true */
/* jshint -W099 */
'use strict';

var _ = require('underscore');
var async = require('async');
var mongoose = require('mongoose');

var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var chat_models = require('../models/chat');
var Chat = chat_models.Chat;
var ChatMsg = chat_models.ChatMsg;
var user_inodes = require('./user_inodes');
var email = require('./email');
var common_api = require('./common_api');
var track_api = require('./track_api');

exports.create = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var chat = new Chat();
    chat.title = req.body.title;
    chat.group = req.body.group;

    async.waterfall([
        function(next) {
            console.log('CREATE set_chat_users', req.body.users_list);
            return set_chat_users(chat, req.body.users_list, next);
        },
        function(next) {
            console.log('CREATE verify_chat_update', chat);
            return verify_chat_update(chat, user_id, next);
        },
        function(next) {
            console.log('CREATE save', chat);
            return chat.save(next);
        },
        function(chat_arg, num_arg, next) {
            console.log('CREATE done', chat);
            return next(null, {
                chat_id: chat.id
            });
        }
    ], common_api.reply_callback(req, res, 'CHAT CREATE'));
};

exports.update = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var chat_id = mongoose.Types.ObjectId(req.params.chat_id);
    var chat;
    async.waterfall([
        function(next) {
            return Chat.findById(chat_id, next);
        },
        function(chat_arg, next) {
            chat = chat_arg;
            return verify_chat_update(chat, user_id, next);
        },
        function(next) {
            if (req.body.title) {
                chat.title = req.body.title;
            }
            if (req.body.users_list) {
                return set_chat_users(chat, req.body.users_list, next);
            }
            chat.mtime = chat.ctime = new Date(); // touch times
            return next();
        },
        function(next) {
            return verify_chat_update(chat, user_id, next);
        },
        function(next) {
            return chat.save(next);
        },
        function(chat_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CHAT UPDATE'));
};

exports.leave = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var chat_id = mongoose.Types.ObjectId(req.params.chat_id);
    var chat;
    async.waterfall([
        function(next) {
            return Chat.findById(chat_id, next);
        },
        function(next) {
            for (var i = 0; i < chat.users.length; i++) {
                if (chat.users[i].user.equals(user_id)) {
                    chat.users.splice(i, 1);
                    chat.mtime = chat.ctime = new Date(); // touch times
                    return chat.save(next);
                }
            }
            return next(null, null, null);
        },
        function(chat_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CHAT REMOVE'));
};

exports.send = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var chat_id = mongoose.Types.ObjectId(req.params.chat_id);
    var msg = new ChatMsg();
    msg.chat = chat_id;
    msg.user = user_id;
    msg.text = req.body.text;
    msg.inode = req.body.inode;
    var chat;
    async.waterfall([
        function(next) {
            return Chat.findById(chat_id, next);
        },
        function(chat_arg, next) {
            chat = chat_arg;
            return verify_chat_access(chat, user_id, next);
        },
        function(next) {
            return msg.save(next);
        },
        function(msg_arg, num_arg, next) {
            chat.mtime = new Date(); // touch mtime
            return chat.save(next);
        },
        function(chat_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CHAT SEND'));
};

exports.read = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var chat_id = mongoose.Types.ObjectId(req.params.chat_id);
    var limit = req.query.limit;
    var start_time = req.query.start_time;
    var end_time = req.query.end_time;
    var ctime = req.query.ctime;
    var chat;
    async.waterfall([
        function(next) {
            console.log('READ findById', chat_id);
            return Chat.findById(chat_id, next);
        },
        function(chat_arg, next) {
            chat = chat_arg;
            console.log('READ verify_chat_access', chat, user_id);
            if (!chat) {
                return next({
                    status: 404,
                    message: 'Not found'
                });
            }
            return verify_chat_access(chat, user_id, next);
        },
        function(next) {
            console.log('READ ChatMsg.find', chat.id, start_time, end_time);
            var q = ChatMsg.find({
                chat: chat.id
            });
            if (start_time) {
                q.where('time').gte(start_time);
            }
            if (end_time) {
                q.where('time').lt(end_time);
            }
            if (limit) {
                q.limit(limit);
            }
            return q.exec(next);
        },
        function(msgs, next) {
            console.log('READ done', msgs, req.query.ctime, chat.ctime);
            return next(null, {
                chat: req.query.ctime !== chat.ctime ? chat_reply(chat) : null,
                msgs: msgs
            });
        }
    ], common_api.reply_callback(req, res, 'CHAT READ'));
};


exports.list = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    async.waterfall([
        function(next) {
            return Chat.find({
                'users.user': user_id
            }, next);
        },
        function(chats, next) {
            return next(null, _.map(chats, chat_reply));
        }
    ], common_api.reply_callback(req, res, 'CHAT LIST'));
};

exports.poll = function(req, res) {
    console.log('POLL USER ID', req.user.id);
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var last_poll = new Date(req.query.last_poll || 0);
    var chats;
    async.waterfall([
        function(next) {
            return Chat.find({
                'users.user': user_id,
                mtime: {
                    $gt: last_poll
                }
            }).sort('-mtime').exec(next);
        },
        function(chats_arg, next) {
            chats = chats_arg;
            if (!chats.length) {
                return next(null, null);
            }
            return ChatMsg.find({
                chat: {
                    $in: _.pluck(chats, '_id')
                },
                time: {
                    $gt: last_poll
                }
            }).sort('time').exec(next);
        },
        function(msgs, next) {
            if (!chats.length) {
                return next();
            }
            var msgs_by_chat = _.groupBy(msgs, 'chat');
            var chats_reply = _.map(chats, function(chat) {
                var c = chat_reply(chat);
                c.msgs = msgs_by_chat[chat.id];
                return c;
            });
            return next(null, {
                chats: chats_reply,
            });
        }
    ], common_api.reply_callback(req, res, 'CHAT POLL'));
};



function verify_chat_update(chat, user_id, callback) {
    var first_user = chat.users[0] && chat.users[0].user && mongoose.Types.ObjectId(chat.users[0].user.id);
    console.error('chat update - chat ', chat.id,
        'user', user_id, typeof(user_id), 'first_user', first_user, typeof(first_user));
    if (!first_user || !user_id.equals(first_user)) {
        console.error('ERROR FORBIDDEN CHAT UPDATE - chat ',
            chat.id, 'user', user_id, 'chat users', chat.users);
        return callback({
            status: 403,
            message: 'Forbidden'
        });
    }
    return callback();
}

function verify_chat_access(chat, user_id, callback) {
    var u = _.find(chat.users, function(u) {
        var id = u.user && mongoose.Types.ObjectId(u.user.id);
        return id && user_id.equals(id);
    });
    if (!u) {
        console.error('ERROR FORBIDDEN CHAT ACCESS - chat ',
            chat.id, 'user', user_id, 'chat users', chat.users);
        return callback({
            status: 403,
            message: 'Forbidden'
        });
    }
    return callback();
}

function set_chat_users(chat, users_list, callback) {
    // console.log('set_chat_users', users_list, typeof(users_list));
    if (typeof(users_list) === 'string') {
        users_list = [users_list];
    } else if (_.uniq(users_list).length !== users_list.length) {
        console.error('ERROR DUPLICATE USERS', users_list);
        return callback({
            status: 500,
            message: 'Duplicates'
        });
    }
    // TODO verify all users exist
    // TODO check if users block current user from adding them
    var existing_users = _.indexBy(chat.users, 'user');
    var new_users = [];
    _.each(users_list, function(user_id) {
        var u = existing_users[user_id] || {
            user: mongoose.Types.ObjectId(user_id)
        };
        new_users.push(u);
    });
    chat.users = new_users;
    return callback();
}

function chat_reply(chat) {
    // convert from mongoose to plain obj
    var c = chat.toObject();
    // remove user info that shouldn't be open to other users
    c.users = _.map(c.users, function(u) {
        return u.user;
    });
    return c;
}

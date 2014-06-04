/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var chat_schema = new mongoose.Schema({
    ctime: {
        type: Date,
        default: Date.now
    },
    mtime: {
        type: Date,
        default: Date.now
    },
    title: String,
    group: Boolean,
    users: [{
        user: {
            type: types.ObjectId,
            ref: 'User'
        },
        seen_msg: {
            type: types.ObjectId,
            ref: 'ChatMsg'
        }
    }],
});

var chat_msg_schema = new mongoose.Schema({
    time: {
        type: Date,
        default: Date.now
    },
    chat: {
        type: types.ObjectId,
        ref: 'Chat'
    },
    user: {
        type: types.ObjectId,
        ref: 'User'
    },
    text: String,
    inode: {
        type: types.ObjectId,
        ref: 'Inode'
    }
});

chat_schema.index({
    'users.user': 1,
    ctime: 1,
    mtime: 1
}, {
    unique: false
});

chat_msg_schema.index({
    chat: 1,
    time: 1
}, {
    unique: false
});


var Chat = mongoose.model('Chat', chat_schema);
var ChatMsg = mongoose.model('ChatMsg', chat_msg_schema);
exports.Chat = Chat;
exports.ChatMsg = ChatMsg;

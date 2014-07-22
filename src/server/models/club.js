/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var club_schema = new mongoose.Schema({
    ctime: {
        type: Date,
        default: Date.now
    },
    mtime: {
        type: Date,
        default: Date.now
    },
    title: String,
    color: Number,
    members: [{
        user: {
            type: types.ObjectId,
            ref: 'User'
        },
        admin: Boolean,
        seen_msg: {
            type: types.ObjectId,
            ref: 'ClubMsg'
        }
    }],
});

var club_msg_schema = new mongoose.Schema({
    time: {
        type: Date,
        default: Date.now
    },
    club: {
        type: types.ObjectId,
        ref: 'Club'
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

club_schema.index({
    'members.user': 1,
    ctime: 1,
    mtime: 1
}, {
    unique: false
});

club_msg_schema.index({
    club: 1,
    time: 1
}, {
    unique: false
});


var Club = mongoose.model('Club', club_schema);
var ClubMsg = mongoose.model('ClubMsg', club_msg_schema);
exports.Club = Club;
exports.ClubMsg = ClubMsg;

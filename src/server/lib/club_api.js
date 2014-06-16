/* jshint node:true */
/* jshint -W099 */
'use strict';

var _ = require('underscore');
var async = require('async');
var mongoose = require('mongoose');

var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var club_models = require('../models/club');
var Club = club_models.Club;
var ClubMsg = club_models.ClubMsg;
var inode_api = require('./inode_api');
var user_inodes = require('./user_inodes');
var email = require('./email');
var common_api = require('./common_api');
var track_api = require('./track_api');


exports.poll = function(req, res) {
    console.log('POLL USER ID', req.user.id);
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var last_poll = new Date(req.query.last_poll || 0);
    var clubs;
    async.waterfall([
        function(next) {
            return Club.find({
                'members.user': user_id,
                mtime: {
                    $gt: last_poll
                }
            }).sort('-mtime').exec(next);
        },
        function(clubs_arg, next) {
            clubs = clubs_arg;
            if (!clubs.length) {
                return next(null, null);
            }
            return ClubMsg.find({
                club: {
                    $in: _.pluck(clubs, '_id')
                },
                time: {
                    $gt: last_poll
                }
            }).sort('time').populate('inode').exec(next);
        },
        function(msgs, next) {
            if (!clubs.length) {
                return next();
            }
            var msgs_by_club = _.groupBy(msgs, 'club');
            var clubs_reply = _.map(clubs, function(club) {
                return club_reply(club, req.user, msgs_by_club[club.id]);
            });
            return next(null, {
                clubs: clubs_reply,
            });
        }
    ], common_api.reply_callback(req, res, 'CLUB POLL'));
};


exports.create = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club = new Club();
    club.title = req.body.title;

    async.waterfall([
        function(next) {
            console.log('CREATE set_club_members', req.body.members);
            return set_club_members(club, req.body.members, next);
        },
        function(next) {
            console.log('CREATE verify_club_update', club);
            return verify_club_update(club, user_id, next);
        },
        function(next) {
            console.log('CREATE save', club);
            return club.save(next);
        },
        function(club_arg, num_arg, next) {
            console.log('CREATE done', club);
            return next(null, {
                club_id: club.id
            });
        }
    ], common_api.reply_callback(req, res, 'CLUB CREATE'));
};

exports.update = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club_id = mongoose.Types.ObjectId(req.params.club_id);
    var club;
    async.waterfall([
        function(next) {
            return Club.findById(club_id, next);
        },
        function(club_arg, next) {
            club = club_arg;
            return verify_club_update(club, user_id, next);
        },
        function(next) {
            club.mtime = club.ctime = new Date(); // touch times
            if (req.body.title) {
                club.title = req.body.title;
            }
            if (req.body.members) {
                return set_club_members(club, req.body.members, next);
            } else {
                return next();
            }
        },
        function(next) {
            return verify_club_update(club, user_id, next);
        },
        function(next) {
            return club.save(next);
        },
        function(club_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CLUB UPDATE'));
};

exports.leave = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club_id = mongoose.Types.ObjectId(req.params.club_id);
    var club;
    async.waterfall([
        function(next) {
            return Club.findById(club_id, next);
        },
        function(club_arg, next) {
            club = club_arg;
            for (var i = 0; i < club.members.length; i++) {
                if (club.members[i].user.equals(user_id)) {
                    club.members.splice(i, 1);
                    club.mtime = club.ctime = new Date(); // touch times
                    return club.save(next);
                }
            }
            return next(null, null, null);
        },
        function(club_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CLUB LEAVE'));
};

exports.mark_seen = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club_id = mongoose.Types.ObjectId(req.params.club_id);
    var seen_msg = mongoose.Types.ObjectId(req.body.seen_msg);
    var club;
    async.waterfall([
        function(next) {
            return Club.findById(club_id, next);
        },
        function(club_arg, next) {
            club = club_arg;
            for (var i = 0; i < club.members.length; i++) {
                if (club.members[i].user.equals(user_id)) {
                    club.members[i].seen_msg = seen_msg;
                    // dont update mtime, because only the calling user needs to update
                    // and can do once this request returns
                    return club.save(next);
                }
            }
            return next(null, null, null);
        },
        function(club_arg, num_arg, next) {
            return next();
        }
    ], common_api.reply_callback(req, res, 'CLUB SEEN'));
};


exports.send = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club_id = mongoose.Types.ObjectId(req.params.club_id);
    var msg = new ClubMsg();
    msg.club = club_id;
    msg.user = user_id;
    msg.text = req.body.text;
    msg.inode = req.body.inode;
    var club;
    var inode;
    async.waterfall([
        function(next) {
            return async.parallel({
                club: function(callback) {
                    return Club.findById(club_id, callback);
                },
                inode: function(callback) {
                    if (!msg.inode) {
                        return callback(null, null);
                    }
                    return Inode.findById(msg.inode, callback);
                }
            }, next);
        },
        function(results, next) {
            club = results.club;
            inode = results.inode;
            return verify_club_access(club, user_id, common_api.err_only(next));
        },
        function(next) {
            if (!inode) {
                return next();
            }
            return common_api.check_ownership(
                user_id.toString(), inode, common_api.err_only(next));
        },
        function(next) {
            return msg.save(common_api.err_only(next));
        },
        function(next) {
            club.mtime = new Date(); // touch mtime
            return club.save(common_api.err_only(next));
        },
        function(next) {
            if (!inode) {
                return next();
            }
            var user_ids = _.pluck(club.members, 'user');
            // remove current user from ids
            user_ids = _.reject(user_ids, function(member_user_id) {
                return member_user_id.equals(user_id);
            });
            console.log('SEND create ghost refs', user_ids);
            return user_inodes.add_inode_ghost_refs(inode, user_ids, next);
        }
    ], common_api.reply_callback(req, res, 'CLUB SEND'));
};

exports.read = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    var club_id = mongoose.Types.ObjectId(req.params.club_id);
    var limit = req.query.limit;
    var start_time = req.query.start_time;
    var end_time = req.query.end_time;
    var ctime = req.query.ctime;
    var club;
    async.waterfall([
        function(next) {
            console.log('READ findById', club_id);
            return Club.findById(club_id, next);
        },
        function(club_arg, next) {
            club = club_arg;
            console.log('READ verify_club_access', club, user_id);
            if (!club) {
                return next({
                    status: 404,
                    message: 'Not found'
                });
            }
            return verify_club_access(club, user_id, next);
        },
        function(next) {
            console.log('READ ClubMsg.find', club.id, start_time, end_time);
            var q = ClubMsg.find({
                club: club.id
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
            return q.populate('inode').exec(next);
        },
        function(msgs, next) {
            console.log('READ done', msgs, req.query.ctime, club.ctime);
            return next(null, {
                club: req.query.ctime !== club.ctime ? club_reply(club, req.user) : null,
                msgs: _.map(msgs, function(m) {
                    return msg_reply(m, req.user);
                })
            });
        }
    ], common_api.reply_callback(req, res, 'CLUB READ'));
};


exports.list = function(req, res) {
    var user_id = mongoose.Types.ObjectId(req.user.id);
    async.waterfall([
        function(next) {
            return Club.find({
                'members.user': user_id
            }, next);
        },
        function(clubs, next) {
            return next(null, _.map(clubs, function(club) {
                return club_reply(club, req.user);
            }));
        }
    ], common_api.reply_callback(req, res, 'CLUB LIST'));
};



function verify_club_update(club, user_id, callback) {
    var m = find_member(club, user_id);
    if (!m || !m.admin) {
        console.error('ERROR FORBIDDEN CLUB UPDATE - club ',
            club.id, 'user', user_id, 'club members', club.members);
        return callback({
            status: 403,
            message: 'Forbidden'
        });
    }
    return callback();
}

function verify_club_access(club, user_id, callback) {
    var m = find_member(club, user_id);
    if (!m) {
        console.error('ERROR FORBIDDEN CLUB ACCESS - club ',
            club.id, 'user', user_id, 'club members', club.members);
        return callback({
            status: 403,
            message: 'Forbidden'
        });
    }
    return callback();
}

function find_member(club, user_id) {
    return _.find(club.members, function(m) {
        var id = m.user && mongoose.Types.ObjectId(m.user.id);
        return id && user_id.equals(id);
    });
}

function set_club_members(club, members, callback) {
    // console.log('set_club_members', members, typeof(members));
    var user_ids = _.pluck(members, 'user');
    if (_.uniq(user_ids).length !== user_ids.length) {
        console.error('ERROR DUPLICATE USERS', members);
        return callback({
            status: 500,
            message: 'Duplicates'
        });
    }
    // TODO verify all users exist
    // TODO check if users block current user from adding them
    var old_members = _.indexBy(club.members, 'user');
    _.each(members, function(m) {
        var om = old_members[m.user];
        // keep the seen_msg info for remaining members
        m.seen_msg = om ? om.seen_msg : undefined;
    });
    club.members = members;
    return callback();
}

function club_reply(club, user, msgs) {
    // convert from mongoose to plain obj
    var c = club.toObject();
    _.each(c.members, function(m) {
        if (m.user.equals(user.id)) {
            // propagate the current user info to the club scope 
            // to make it easier to reach
            c.seen_msg = m.seen_msg;
            c.admin = m.admin;
        } else {
            // don't return the private info of other members
            delete m.seen_msg;
        }
    });
    if (msgs) {
        c.msgs = _.map(msgs, function(m) {
            return msg_reply(m, user);
        });
    }
    return c;
}

function msg_reply(msg, user) {
    var m = msg.toObject();
    if (msg.populated('inode')) {
        m.inode = inode_api.inode_to_entry(m.inode, {
            user: user
        });
    }
    return m;
}

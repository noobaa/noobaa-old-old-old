var _ = require('underscore');
var async = require('async');
var moment = require('moment');
var mongoose = require('mongoose');
var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var Fobj = require('../models/fobj').Fobj;
var Message = require('../models/message').Message;
var email = require('./email');
var common_api = require('./common_api');
var auth = require('./auth');

var CONST_BASE_FOLDERS = {
	'MYDATA': 'My Data',
	'SWM': 'Shared With Me'
};
exports.CONST_BASE_FOLDERS = CONST_BASE_FOLDERS;


// verify_and_create_base_folder 
// If the requested folder name does not exists, creates a folder with
// the requested name. Parent is set to null for those folders.  

function verify_and_create_base_folder(folder_name, user, next) {
	// find the requested base folder
	Inode.findOne({
		owner: user._id,
		name: folder_name,
		isdir: true,
		parent: null,
	}, function(err, inode) {
		if (err) {
			console.error('ERROR - Failed while searching for user basic folder', err,
				'user id', user._id, 'folder', folder_name);
			return next(err, null);
		}
		if (!inode) {
			//if not found - create it with null parent.
			inode = new Inode();
			inode.owner = user._id;
			inode.parent = null;
			inode.name = folder_name;
			inode.isdir = true;
			return inode.save(function(err, inode, num) {
				if (err) {
					console.log("error while creating inode: ", err);
					return next(err, null);
				}
				console.log("Created basic inode. Inode:", folder_name, user, " Inode id", inode._id);
				return next(null, user);
			});
		}
		console.log('inode exists. File name:', folder_name, user);
		return next(null, user);
	});
}

// verify_and_create_base_folders is intended to be used upon use login.
exports.verify_and_create_base_folders = function(user, callback) {
	async.parallel([
		verify_and_create_base_folder.bind(null, CONST_BASE_FOLDERS.MYDATA, user),
		verify_and_create_base_folder.bind(null, CONST_BASE_FOLDERS.SWM, user),
	], function(err) {
		return callback(err, user);
	});
};

//get's the inodes of the shared with me folder

function get_user_SWM(user_id, next) {
	return get_user_basic_folder(CONST_BASE_FOLDERS.SWM, user_id, next);
}
exports.get_user_SWM = get_user_SWM;

//get's the inodes of the my data folder

function get_user_MYD(user_id, next) {
	return get_user_basic_folder(CONST_BASE_FOLDERS.MYDATA, user_id, next);
}
exports.get_user_MYD = get_user_MYD;

//get's the inodes of requested folder with null parent.

function get_user_basic_folder(folder_name, user_id, next) {
	// find the requested base folder
	Inode.findOne({
		owner: user_id,
		name: folder_name,
		isdir: true,
		parent: null,
	}, function(err, inode) {
		if (err) {
			console.error('Failed while searching for user basic folder', err,
				'user id', user_id, 'folder', folder_name);
			return next(err, null);
		}
		if (!inode) {
			err = " Basic folder missing. User id " + user_id + " Folder name: " + folder_name;
			return next(err, null);
		}
		return next(null, inode);
	});
}

exports.update_inode_ghost_refs = update_inode_ghost_refs;

//add and remove ghosts as needed

function update_inode_ghost_refs(inode, old_user_ids, new_user_ids, callback) {
	var old_user_ids_str = _.invoke(old_user_ids, 'toString');
	var new_user_ids_str = _.invoke(new_user_ids, 'toString');
	var user_ids_to_add = _.difference(new_user_ids_str, old_user_ids_str);
	var user_ids_to_remove = _.difference(old_user_ids_str, new_user_ids_str);

	async.parallel([
		function(next) {
			remove_inode_ghost_refs(inode, user_ids_to_remove, next);
		},
		function(next) {
			add_inode_ghost_refs(inode, user_ids_to_add, next);
		},
	], function(err, results) {
		// no need to pass on the parallel results array
		callback(err);
	});
}

//remove ghosts which refer to the live inode and belong to the users in the list

function remove_inode_ghost_refs(inode, user_ids, callback) {
	if (!user_ids || !user_ids.length) {
		return callback();
	}
	console.log("remove_inode_ghost_refs", inode.id, inode.name, user_ids);
	Inode.remove({
		ghost_ref: inode.id,
		owner: {
			$in: user_ids
		}
	}, callback);
}

function new_inode_ref(user_id, parent_id, inode) {
	return new Inode({
		owner: user_id,
		parent: parent_id,
		name: inode.name,
		isdir: inode.isdir,
		ghost_ref: inode._id,
		ref_owner: inode.owner,
		fobj: inode.fobj,
		size: inode.size,
		content_type: inode.content_type
	});
}


// add ghosts which refer to the inode and belong to the users in the list

function add_inode_ghost_refs(inode, user_ids, callback) {
	if (!user_ids || !user_ids.length) {
		return callback();
	}
	console.log("add_inode_ghost_refs", inode.id, inode.name, user_ids);

	return async.waterfall([

		function(next) {
			var uids = user_ids.concat([inode.owner]);
			return Inode.find({
				owner: {
					$in: uids
				},
				name: CONST_BASE_FOLDERS.SWM,
				isdir: true,
				parent: null,
			}).exec(next);
		},

		// create all the ghost inodes in one batch
		function(swm_inodes, next) {
			var swm_by_user_id = _.indexBy(swm_inodes, 'owner');
			var new_ghosts = _.map(user_ids, function(user_id) {
				var swm = swm_by_user_id[user_id];
				return new_inode_ref(user_id, swm._id, inode);
			});
			return Inode.create(new_ghosts, function(err) {
				return next(err);
			});
		}

	], callback);
}


function find_missing_ghost_refs(user_id, user_ids, callback) {
	var inodes_by_id;
	var inode_ids;

	async.waterfall([

		function(next) {
			return Inode.find({
				owner: {
					$in: user_ids
				},
				shr: 'f'
			}, next);
		},

		function(inodes, next) {
			inodes_by_id = _.indexBy(inodes, '_id');
			inode_ids = _.map(inodes, function(x) {
				return x._id.toString();
			});
			return Inode.find({
				owner: user_id,
				ghost_ref: {
					$in: inode_ids
				}
			}).distinct('ghost_ref').exec(next);
		},

		function(ghost_ids, next) {
			ghost_ids = _.invoke(ghost_ids, 'toString');
			inode_ids = _.difference(inode_ids, ghost_ids);
			inodes_by_id = _.pick(inodes_by_id, inode_ids);
			return next(null, inodes_by_id);
		}

	], callback);
}


exports.add_missing_ghost_refs = add_missing_ghost_refs;

function add_missing_ghost_refs(tokens, user_id, callback) {
	var swm;

	async.waterfall([

		function(next) {
			return get_user_SWM(user_id, next);
		},

		function(swm_inode, next) {
			swm = swm_inode;
			return auth.get_friends_user_ids(tokens, next);
		},

		function(user_ids, next) {
			return find_missing_ghost_refs(user_id, user_ids, next);
		},

		function(inodes_by_id, next) {
			var new_ghosts = _.map(inodes_by_id, function(inode) {
				return new_inode_ref(user_id, swm._id, inode);
			});
			return Inode.create(new_ghosts, function(err) {
				return next(err, {
					added: new_ghosts.length
				});
			});
		}

	], callback);
}



function find_recent_swm(user_id, count_limit, from_time, callback) {
	var swm_inodes;
	async.waterfall([
		function(next) {
			var q = Inode.find({
				owner: user_id,
				ghost_ref: {
					$exists: true
				}
			});
			if (from_time) {
				q.where('create_time').gte(from_time);
			}
			q.sort({
				_id: -1
			});
			if (count_limit) {
				q.limit(count_limit);
			}
			q.populate('ref_owner');
			return q.exec(next);
		},
		function(inodes, next) {
			swm_inodes = inodes;
			var refs = _.pluck(swm_inodes, 'ghost_ref');
			return Message.find({
				subject_inode: {
					$in: refs
				},
				removed_by: {
					$exists: false
				}
			}).sort({
				create_time: 1
			}).populate('user').exec(next);
		},
		function(messages, next) {
			var messages_by_inode = _.groupBy(messages, 'subject_inode');
			var shares = _.map(swm_inodes, function(swm_inode) {
				return {
					inode: swm_inode,
					messages: messages_by_inode[swm_inode.ghost_ref]
				};
			});
			return callback(null, shares);
		}
	], callback);
}

exports.user_notify_by_email = user_notify_by_email;

function user_notify_by_email(user, callback) {

	if (user.email_policy === 'silent') {
		console.log('silent email for user', user.get_name());
		return callback();
	}

	async.waterfall([
		function(next) {
			var dt = user.email_last_notify_time;
			/* example fix for missing emails evening
			if (dt) {
				console.log(dt.getTime(), '<', 1393874656000);
				if (dt.getTime() < 1393874656000) {
					dt = moment(dt).subtract('hours', 12).toDate();
				}
			}
			*/
			return find_recent_swm(user.id, 3, dt, next);
		},
		function(shares, next) {
			if (!shares) {
				return next(null, false);
			}
			if (!shares.length) {
				return next(null, false);
			}
			console.log('USER NOTIFY EMAIL', user.get_name());
			return email.send_recent_swm_notification(user, shares, function(err) {
				return next(err, true);
			});
		},
		function(was_sent, next) {
			if (!was_sent) {
				return next();
			}
			user.email_last_notify_time = new Date();
			user.save(next);
		}
	], callback);
}


function users_notify_by_email_job() {
	var now = new Date();
	var yesterday = moment().subtract('days', 1).toDate();
	console.log('USERS NOTIFY EMAIL JOB - START');

	async.waterfall([

		function(next) {
			return User.find({
				$or: [{
					email_last_notify_time: {
						$exists: false
					}
				}, {
					email_last_notify_time: {
						$lte: yesterday
					}
				}]
			}, next);
		},

		function(users, next) {
			console.log('USERS NOTIFY EMAIL JOB -', users.length, 'USERS TO PROCESS');
			return async.eachLimit(users, 3, function(user, next) {

				if (user.email_policy === 'silent') {
					// console.log('silent email for user', user.get_name());
					return next();
				}
				// if not yet filled the tz, assuming GMT+2 (ISRAEL TIME)
				var tz_offset = (typeof user.tz_offset === 'number') ? user.tz_offset : 120;
				// we add the tz offset to the utc time, so then using getUTCHours returns the hour in user time
				var user_time_now = new Date(Date.now() + (tz_offset * 60000));
				var user_hour = user_time_now.getUTCHours();
				// send mails on 8pm
				if (user_hour !== 20) {
					// console.log('not yet time on user clock', user_hour, user.get_name());
					return next();
				}

				return user_notify_by_email(user, function(err) {
					if (err) {
						console.error('FAILED NOTIFY USER', user.get_name());
						// don't propagate the error further
					}
					return next();
				});
			}, next);
		},

	], function(err) {
		if (err) {
			console.error('FAILED USERS NOTIFY EMAIL JOB', err);
		} else {
			console.log('USERS NOTIFY EMAIL JOB - DONE');
		}
		schedule_users_notify_by_email_job();
	});
}

function schedule_users_notify_by_email_job() {
	clearTimeout(global.users_notify_by_email_job_timeout);
	global.users_notify_by_email_job_timeout = setTimeout(users_notify_by_email_job, 600000);
}

users_notify_by_email_job();



// This will return the sum of all fobjs' sizes 
// that are referenced by owned inodes of the user.

exports.get_user_usage_bytes = get_user_usage_bytes;

function get_user_usage_bytes(user_id, cb) {
	user_id = mongoose.Types.ObjectId(user_id);
	async.waterfall([
		function(next) {
			return Inode.aggregate().match({
				owner: user_id,
				size: {
					$gt: 0
				},
				ghost_ref: {
					$exists: false
				}
			}).group({
				_id: '$fobj',
				size: {
					// we expect all inodes pointing the same fobj would have same size
					// but using $max just to be on the safe side.
					$max: '$size'
				}
			}).group({
				_id: '',
				size: {
					$sum: '$size'
				}
			}).exec(next);
		}
	], function(err, result) {
		if (err) {
			return cb(err);
		}
		var usage = 0;
		if (result && result.length) {
			usage = result[0].size;
		}
		console.log('USAGE RESULTS', user_id, usage);
		//the aggregate returns an array with an embeded object. This is not a very clear return.
		//so cleaning it to reduce coupling. 
		return cb(null, usage);
	});
}


// searche for ancestor directory which is sharing with this user
// this is a recursive function 

exports.shared_ancestor = shared_ancestor;

function shared_ancestor(user_id, inode, callback) {
	// stopping the recursion when parent not found
	if (!inode) {
		return callback(null, null);
	}

	async.waterfall([

		function(next) {
			return Inode.findOne({
				ghost_ref: inode._id,
				owner: user_id
			}, next);
		},

		function(ghost_ref, next) {
			if (ghost_ref) {
				return next(null, ghost_ref);
			}
			if (!inode.parent) {
				callback(null, null);
			}
			return Inode.findById(inode.parent, function(err, parent_inode) {
				if (err) {
					return next(err);
				}
				// Z recursive call. my concern is that the callbacks will bloat.
				return shared_ancestor(user_id, parent_inode, next);
			});
		}
	], callback);
}

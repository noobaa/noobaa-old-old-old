var _ = require('underscore');
var async = require('async');
var moment = require('moment');
var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var Fobj = require('../models/fobj').Fobj;
var Message = require('../models/message').Message;
var email = require('./email');
var common_api = require('./common_api');

var CONST_BASE_FOLDERS = {
	'MYDATA': 'My Data',
	'SWM': 'Shared With Me'
};
exports.CONST_BASE_FOLDERS = CONST_BASE_FOLDERS;

// ---------------------------------------------------------
// verify_and_create_base_folder 
// If the requested folder name does not exists, creates a folder with
// the requested name. Parent is set to null for those folders.  
// ==========
// 1. folder name 
// 2. user object as appears in the user model
// 3. callback(err,data)
// -----------------------------------------------------------

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
exports.verify_and_create_base_folders = function(user, cb) {
	console.log("in verify_and_create_base_folders");
	async.waterfall([
		function(next) {
			return next(null, user);
		},
		//create my data
		verify_and_create_base_folder.bind(null, CONST_BASE_FOLDERS.MYDATA),
		//create shared with me
		verify_and_create_base_folder.bind(null, CONST_BASE_FOLDERS.SWM),
	], cb);
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
				'user id', user._id, 'folder', folder_name);
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

function update_inode_ghost_refs(live_inode, old_user_ids, new_user_ids, cb) {
	var old_user_ids_strings = _.invoke(old_user_ids, 'toHexString');
	var user_ids_to_add = _.difference(new_user_ids, old_user_ids_strings);
	var user_ids_to_remove = _.difference(old_user_ids_strings, new_user_ids);

	async.parallel([
		function(next) {
			remove_inode_ghost_refs(live_inode, user_ids_to_remove, next);
		},
		function(next) {
			add_inode_ghost_refs(live_inode, user_ids_to_add, next);
		},
	], function(err, results) {
		// no need to pass on the parallel results array
		cb(err);
	});
}

//remove ghosts which refer to the live inode and belong to the users in the list

function remove_inode_ghost_refs(live_inode, user_ids, callback) {
	console.log("remove_inode_ghost_refs", arguments);
	Inode.remove({
		ghost_ref: live_inode.id,
		owner: {
			$in: user_ids
		}
	}, callback);
}

//add ghosts which refer to the live inode and belong to the users in the list

function add_inode_ghost_refs(live_inode, user_ids, callback) {
	console.log("add_inode_ghost_refs", arguments);

	var users_by_id;

	async.waterfall([

		function(next) {
			var uids = user_ids.concat([live_inode.owner]);
			return async.parallel({
				// find all the users we need to work with
				users: function(next) {
					return User.find({
						_id: {
							$in: uids
						}
					}).exec(next);
				},
				// find the swm folders for the users
				swm_inodes: function(next) {
					return Inode.find({
						owner: {
							$in: uids
						},
						name: CONST_BASE_FOLDERS.SWM,
						isdir: true,
						parent: null,
					}).exec(next);
				}
			}, next);
		},

		// create all the ghost inodes in one batch
		function(results, next) {
			users_by_id = _.indexBy(results.users, '_id');
			var swm_by_user_id = _.indexBy(results.swm_inodes, 'owner');
			var new_ghosts = [];
			_.each(user_ids, function(user_id) {
				var swm = swm_by_user_id[user_id];
				new_ghosts.push(new Inode({
					owner: user_id,
					parent: swm._id,
					name: live_inode.name,
					isdir: live_inode.isdir,
					ghost_ref: live_inode._id
				}));
			});
			return Inode.create(new_ghosts, function(err) {
				return next(err);
			});
		},

		function(next) {
			// currently we do not notify on every share, instead we send periodic emails
			if (true) {
				return next();
			}
			// notify users by email
			var live_owner = users_by_id[live_inode.owner];
			return async.each(user_ids, function(user_id, next) {
				var user = users_by_id[user_id];
				if (user.email_policy === 'silent') {
					console.log('silent email for user', user.get_name(), user.get_email());
					return next();
				}
				return email.send_swm_notification(user, live_owner, live_inode, next);
			}, next);
		},

	], callback);
}


exports.find_recent_swm = find_recent_swm;

function find_recent_swm(user_id, count_limit, from_time, callback) {
	var swm_inodes;
	var live_inode_ids;
	var live_inodes;
	var live_owners;
	var messages;
	async.waterfall([
		function(next) {
			var q = Inode.find({
				owner: user_id,
				ghost_ref: {
					$exists: true
				}
			}, {
				_id: 1,
				ghost_ref: 1
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
			return q.exec(next);
		},
		function(inodes, next) {
			swm_inodes = inodes;
			live_inode_ids = _.pluck(swm_inodes, 'ghost_ref');
			return Inode.find({
				_id: {
					$in: live_inode_ids
				}
			}).exec(next);
		},
		function(inodes, next) {
			live_inodes = inodes;
			var owner_ids = _.pluck(live_inodes, 'owner');
			return User.find({
				_id: {
					$in: owner_ids
				}
			}).exec(next);
		},
		function(owners, next) {
			live_owners = owners;
			return Message.find({
				subject_inode: {
					$in: live_inode_ids
				},
				removed_by: {
					$exists: false
				}
			}).sort({
				create_time: 1
			}).populate('user').exec(next);
		},
		function(msgs, next) {
			messages = msgs;
			var live_inodes_by_id = _.indexBy(live_inodes, '_id');
			var live_owners_by_id = _.indexBy(live_owners, '_id');
			var messages_by_inode = _.groupBy(messages, 'subject_inode');
			var shares = _.map(swm_inodes, function(inode) {
				var shared_item = {};
				shared_item.inode = inode.toObject();
				var live_inode = live_inodes_by_id[inode.ghost_ref];
				if (live_inode) {
					shared_item.live_inode = live_inode;
					shared_item.messages = messages_by_inode[live_inode.id];
					var owner = live_owners_by_id[live_inode.owner];
					if (owner) {
						shared_item.live_owner = owner;
					}
				}
				return shared_item;
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
			return find_recent_swm(user.id, 3, user.email_last_notify_time, next);
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
					console.log('silent email for user', user.get_name());
					return next();
				}
				// if not yet filled the tz, assuming GMT+2 (ISRAEL TIME)
				var tz_offset = (typeof user.tz_offset === 'number') ? user.tz_offset : 120;
				// we add the tz offset to the utc time, so then using getUTCHours returns the hour in user time
				var user_time_now = new Date(Date.now() + (tz_offset * 60000));
				var user_hour = user_time_now.getUTCHours();
				// send mails on 8pm
				if (user_hour !== 20) {
					console.log('not yet time on user clock', user_hour, user.get_name());
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


exports.get_referring_users = get_referring_users;

function get_referring_users(inode, cb) {
	async.waterfall([
		function(next) {
			return inode.get_referring_user_ids(next);
		},

		function(ref_user_id_list, next) {
			User.find({
				_id: {
					$in: ref_user_id_list
				}
			}, next);
		}
	], cb);
}

//This will return the sum of all fobjs' sizes that are referenced by owned 
//inodes of the user.

exports.get_user_usage_bytes = get_user_usage_bytes;

function get_user_usage_bytes(user_id, cb) {
	async.waterfall([
		//get all owned inodes which are files. 
		function(next) {
			return Inode.find({
				owner: user_id,
				isdir: false
			}, 'fobj', next);
		},
		//sum all the referenced fobj's
		function(fobj_list, next) {
			lfobj_list = _.pluck(fobj_list, 'fobj');
			return Fobj.aggregate([{
				$match: {
					_id: {
						$in: lfobj_list
					}
				}
			}, {
				$group: {
					_id: '',
					size: {
						$sum: '$size'
					}
				}
			}], next);
		}
	], function(err, result) {
		if (err) {
			return cb(err);
		}
		var usage = 0;
		if (result && result.length) {
			usage = result[0].size;
		}
		//the aggregate returns an array with an embeded object. This is not a very clear return.
		//so cleaning it to reduce coupling. 
		return cb(null, usage);
	});
}

exports.shared_ancestor = shared_ancestor;
//get user id and an Inode.
//searches for ancestor directory which is sharing with this user
//this is a recursive function 

function shared_ancestor(user_id, inode, callback) {
	//stopping the recursion
	if (!inode) {
		return callback(null, false);
	}

	async.waterfall([

		function(next) {
			return Inode.findOne({
				ghost_ref: inode._id,
				owner: user_id
			}, next);
		},

		function(relevant_ghost, next) {
			if (relevant_ghost) {
				return next(null, true);
			}
			return next(null, false);
		},

		function(found_relevant_refs_in_curr_inode, next) {
			if (found_relevant_refs_in_curr_inode) {
				return next(null, true);
			}
			if (!inode.parent) {
				callback(null, false);
			}
			return Inode.findById(inode.parent, function(err, parent_inode) {
				if (err) {
					return next(err);
				}
				if (!parent_inode) { //for some reason even though we're searching by specific id...
					return next(null, false);
				}
				//Z recursive call. my concern is that the callbacks will bloat.
				return shared_ancestor(user_id, parent_inode, next);
			});
		}
	], callback);
}

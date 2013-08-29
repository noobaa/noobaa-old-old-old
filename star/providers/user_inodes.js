var _ = require('underscore');
var async = require('async');
var Inode = require('../models/inode').Inode;
var User = require('../models/user').User;
var Fobj = require('../models/fobj').Fobj;
var wnst = require('winston');
var email = require('../routes/email');

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
var get_user_SWM = function(user_id, next) {
	return get_user_basic_folder_id(CONST_BASE_FOLDERS.SWM, user_id, next);
};
exports.get_user_SWM_id = get_user_SWM;

//get's the inodes of the my data folder
var get_user_MYD = function(user_id, next) {
	return get_user_basic_folder_id(CONST_BASE_FOLDERS.MYDATA, user_id, next);
};
exports.get_user_MYD_id = get_user_MYD;

//get's the inodes of requested folder with null parent.

function get_user_basic_folder_id(folder_name, user_id, next) {
	// find the requested base folder
	Inode.findOne({
		owner: user_id,
		name: folder_name,
		isdir: true,
		parent: null,
	}, function(err, inode) {
		if (err) {
			wnst.error('Failed while searching for user basic folder', err,
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

//gets the user id's this inodes is shred with
var get_inode_refering_user_ids = function(inode_id, next) {
	Inode.get_refering_ghosts(inode_id, function(err, inodes) {
		if (err) {
			console.error('ERROR - Failed while quering inode: ', inode_id, " ", err);
			return next(err, null);
		}
		var ref_user_ids = _.pluck(inodes, 'owner');
		console.log("ref_user_ids:", ref_user_ids);
		return next(null, ref_user_ids);
	});
};
exports.get_inode_refering_user_ids = get_inode_refering_user_ids;

//add and remove ghosts as needed
exports.update_inode_ghost_refs = function(live_inode_id, old_user_ids, new_user_ids, cb) {
	old_user_ids_strings = _.invoke(old_user_ids, 'toHexString');
	user_ids_to_add = _.difference(new_user_ids, old_user_ids_strings);
	user_ids_to_remove = _.difference(old_user_ids_strings, new_user_ids);

	async.parallel([
		function(next) {
			remove_inode_ghost_refs(live_inode_id, user_ids_to_remove, next);
		},
		function(next) {
			add_inode_ghost_refs(live_inode_id, user_ids_to_add, next);
		},
	], cb);
};

//remove ghosts which refer to the live inode and belong to the users in the list

function remove_inode_ghost_refs(live_inode_id, user_ids, cb) {
	console.log("remove_inode_ghost_refs", arguments);
	Inode.remove({
		ghost_ref: live_inode_id,
		owner: {
			'$in': user_ids
		}
	}, cb);
}

//add ghosts which refer to the live inode and belong to the users in the list

function add_inode_ghost_refs(live_inode_id, user_ids, cb) {
	console.log("add_inode_ghost_refs", arguments);
	async.waterfall([
		function(next) {
			return Inode.findById(live_inode_id, next);
		},

		function(live_inode, next) {
			return async.forEach(user_ids, function(user_id, next) {
				create_ref_ghost_per_user(live_inode, user_id, next);
			}, function(err) {
				return next(err, live_inode);
			});
		},

		function(live_inode, next) {
			return User.findById(live_inode.owner, function(err, sharing_user) {
				return next(err, sharing_user, live_inode);
			});
		},

		function(sharing_user, live_inode, next) {
			return async.forEach(user_ids, function(user_id, next) {
				send_notification_on_new_swm(user_id, sharing_user, live_inode, next);
			}, function(err) {
				return next(err);
			});

		},

	], cb);
}

exports.send_notification_on_new_swm = send_notification_on_new_swm;

function send_notification_on_new_swm(notified_user_id, sharing_user, live_inode, callback) {
	async.waterfall([

		//get the notified user
		function(next) {
			return User.findById(notified_user_id, next);
		},

		//create custome sharing message. The intention is to make it personalize, differetn etc. 
		function(notified_user, next) {
			return create_custom_sharing_message(notified_user, sharing_user, live_inode, function(err, custom_message) {
				return next(null, notified_user, custom_message);
			});
		},

		//send the email notification via the email module. currently not ignoring failurs.  
		function(notified_user, custom_message, next) {
			return email.send_swm_notification(notified_user, sharing_user, live_inode.name, custom_message, next);
		}

	], callback);

}

//this function gets all the parameters to help it decided on a groovy custome message.

function create_custom_sharing_message(notified_user, sharing_user, live_inode, callback) {
	var custom_message = 'Check it out now!';
	return callback(null, custom_message);
}

//add a ghost for this specific user

function create_ref_ghost_per_user(live_inode, user_id, cb) {
	async.waterfall([
		function(next) {
			next(null, user_id);
		},

		get_user_SWM,

		function(SWM_inode, next) {
			var inode = new Inode({
				owner: user_id,
				parent: SWM_inode._id,
				name: live_inode.name,
				ghost_ref: live_inode._id
			});
			inode.save(function(err, inode) {
				if (err) return next(err);
				wnst.info("Cretead ghost inode: ", inode);
				next(null);
			});
		}
	], cb);
}

var get_refering_users = function(inode_id, cb) {
	async.waterfall([
		function(next) {
			next(null, inode_id);
		},

		get_inode_refering_user_ids,

		function(ref_user_id_list, next) {
			User.find({
				_id: {
					'$in': ref_user_id_list
				}
			}, next);
		}
	], cb);
};
exports.get_refering_users = get_refering_users;


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
			return Fobj.aggregate(
				[{
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

exports.user_usage = user_usage;

function user_usage(req, res) {
	var user_id = req.user.id;

	async.waterfall([

		//get the user. The quota is currently stored in the quota
		function(next) {
			return User.findById(user_id, next);
		},

		//get the user's current usage
		function(user, next) {
			return get_user_usage_bytes(user._id, function(err, usage) {
				return next(err, user, usage);
			});
		}

	], function(err, user, usage) {
		if (!err) {
			return res.json(200, {
				"user_quota": user.quota,
				"user_usage": usage
			});
		} else {
			console.log(err);
			return res.json(500, {
				text: err,
				user_id: user_id
			});
		}
	});
}
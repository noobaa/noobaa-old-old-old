var _ = require('underscore');
var async = require('async');
var inode_model = require('../models/inode');
var Inode = inode_model.Inode;


var const_base_folders = {
	'mydata': 'My Data',
	'swm': 'Shared With Me'
};
exports.const_base_folders = const_base_folders;

/*---------------------------------------------------------
verify_and_create_base_folder expects 3 parameters:
==========
1. expects the folder name to be set for ---- this ----
=========
This can be done by 
	async.waterfall([
		function(next) {
			return next(null, user);
		},
		verify_and_create_base_folder.bind("folder name"),
		...
2. user object as appears in the user model
3. callback(err,data)
-----------------------------------------------------------*/

function verify_and_create_base_folder(user, next) {
	/*jshint validthis: true */
	console.log("in verify_and_create_base_folder");
	var folder_name = _.values(this).join("");
	console.log("folder name:", folder_name);
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
			inode.save(function(err, inode, num) {
				if (err) {
					console.log("error while creating inode: ", err)
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
/*
verify_and_create_base_folders is intended to be used upon use login.
*/
exports.verify_and_create_base_folders = function(user, next) {
	console.log("in verify_and_create_base_folders");
	async.waterfall([
		function(next) {
			return next(null, user);
		},
		verify_and_create_base_folder.bind(const_base_folders.mydata),
		verify_and_create_base_folder.bind(const_base_folders.swm),
	], function(err, user) {
		if (!err) {
			next(null, user);
		} else {
			console.log("waterfall pool. Error: ", err);
			next(err, null);
		}
	});
};

exports.get_user_SWM_id = function(user, next) {
	return get_user_basic_folder_id(const_base_folders.mydata, user, next);
}
exports.get_user_MYD_id = function(user, next) {
	return get_user_basic_folder_id(const_base_folders.swm, user, next);
}

function get_user_basic_folder_id(foler_name, user, next) {
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
			err = "Basic folder missing. User id " + user.id + " Folder name: " + folder_name
			return next(err, null)
		}
		return next(null, inode._id);
	});
}

exports.get_inode_refering_nb_ids = function(inode_id, next) {
	console.log("get_inode_refering_nb_ids");
	Inode.findOne({
		ghost_ref: inode_id
	}, function(err, inodes) {
		if (err) {
			console.error('ERROR - Failed while quering inode: ', inode_id, " ", err);
			return next(err, null);
		}
		var ref_nb_ids = _.pluck(inodes, 'owner');
		console.log("ref_nb_ids:", ref_nb_ids);
		return next(null, ref_nb_ids);
	});
}

exports.update_inode_ghost_refs = function(live_inode_id,old_nb_ids, new_nb_ids, next) {
	console.log("update_inode_refs");
	console.log("old_nb_ids", old_nb_ids);
	console.log("new_nb_ids", new_nb_ids);

}

function remove_inode_ghost_refs(live_inode_id,nb_ids,next){

}
function add_inode_ghost_refs(live_inode_id,nb_ids,next){

}


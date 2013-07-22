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
	console.log("owner:", user._id);
	// });

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


exports.verify_and_create_base_folders = function(user, next) {
	console.log("-------------------------------in verify_and_create_base_folders-------------------");
	async.waterfall([
		function(next) {
			return next(null, user);
		},
		verify_and_create_base_folder.bind(const_base_folders.mydata),
		verify_and_create_base_folder.bind(const_base_folders.swm),
	], function(err, user) {
		if (!err) {
			console.log("waterfall pool. next: ", next, " user: ", user);
			next(null, user);
		} else {
			console.log("waterfall pool. Error: ", err);
			next(err, null);
		}
	});
};
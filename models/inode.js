/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var inode_schema = new mongoose.Schema({
	// user ownership
	owner: types.ObjectId,
	// namespace
	parent: types.ObjectId,
	name: String,
	// fields describing the content of the inode
	isdir: Boolean,
	fobj: types.ObjectId,
	ghost_ref: types.ObjectId,
	// timestamps
	create_time: {
		type: Date,
		default: Date.now
	}
	// TODO: uncomment when relevant
	// change_time: Date,
	// modify_time: Date,
	// access_time: Date
});

// define non-unique index on the tuple (owner,parent,name)
inode_schema.index({
	owner: 1,
	parent: 1,
	name: 1
}, {
	unique: false
});

//If this inode is a ghost inode, it will return it's reference. If not, nothing will be done.
inode_schema.methods.follow_ref = function(cb) {
	var inode = this;
	if (!inode.ghost_ref) {
		return cb(null, inode);
	}
	this.model('Inode').findById(inode.ghost_ref, cb);
};

inode_schema.statics.get_refering_ghosts = function(real_id, next) {
	console.log("get_refering_ghosts ", arguments);
	this.model('Inode').find({
		ghost_ref: real_id
	}, function(err, ghosts) {
		return next(err, ghosts);
	});
};

// counts number of dir sons, and call back next(err, inode, dir_son_count)
inode_schema.statics.countDirSons = function(inode, next) {
	if (!inode.isdir) {
		return next(null, inode, 0);
	}
	return this.model('Inode').count({
		owner: inode.owner,
		parent: inode._id
	}, function(err, dir_son_count) {
		next(err, inode, dir_son_count);
	});
};

exports.Inode = mongoose.model('Inode', inode_schema);
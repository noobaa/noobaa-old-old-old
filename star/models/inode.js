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
	num_refs: Number,
	// version number used to revoke public links
	link_vers: {
		type: Number,
		default: 1
	},
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

// check if dir has any sons, and call back next(err, inode, true/false)
inode_schema.statics.isDirHasSons = function(inode, next) {
	if (!inode.isdir) {
		return next(null, inode, false);
	}
	return this.model('Inode').findOne({
		owner: inode.owner,
		parent: inode._id
	}, function(err, result) {
		next(err, inode, !! result);
	});
};

exports.Inode = mongoose.model('Inode', inode_schema);
/* jshint node:true */
'use strict';

var mongoose = require('mongoose');
var types = mongoose.Schema.Types;
var _ = require('underscore');


var inode_schema = new mongoose.Schema({
	// user ownership
	owner: {
		type: types.ObjectId,
		ref: 'User'
	},

	// namespace
	parent: {
		type: types.ObjectId,
		ref: 'Inode'
	},
	name: String,

	// fields describing the content of the inode
	isdir: Boolean,
	size: Number, // from fobj, for performance
	content_type: String, // from fobj, for performance
	fobj: {
		type: types.ObjectId,
		ref: 'Fobj'
	},
	ghost_ref: {
		type: types.ObjectId,
		ref: 'Inode'
	},
	ref_owner: {
		type: types.ObjectId,
		ref: 'User'
	},
	// share mode: 
	// shr == '' means private (unless num_refs != 0)
	// shr == 'r' means open only to referenced users (also assumed when: shr == '' and num_refs > 0)
	// shr == 'f' means open to all friends
	shr: String,
	num_refs: Number,

	// device source info
	src_dev_id: {
		type: types.ObjectId,
		ref: 'Device'
	},
	src_dev_path: String,

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
});

// define non-unique index on the tuple (owner,parent,name)
inode_schema.index({
	owner: 1,
	parent: 1,
	name: 1
}, {
	unique: false
});

// If this inode is a ghost inode, it will return it's reference. 
// If not, return this inode.
inode_schema.methods.follow_ref = function(callback) {
	var inode = this;
	if (inode.ghost_ref) {
		return Inode.findById(inode.ghost_ref, callback);
	} else {
		return callback(null, inode);
	}
};


// callback is optional, if undefined mongoose returns a Query object
// that can be used to add more options to the query and finally call q.exec(callback).
inode_schema.methods.find_refs = function(callback) {
	var inode = this;
	console.log('find_refs', inode._id);
	return Inode.find({
		ghost_ref: inode._id
	}, callback);
};


// check if dir has any sons, and call back next(err, inode, true/false)
inode_schema.statics.isDirHasSons = function(inode, next) {
	if (!inode.isdir) {
		return next(null, inode, false);
	}
	return Inode.findOne({
		owner: inode.owner,
		parent: inode._id
	}, function(err, result) {
		next(err, inode, !! result);
	});
};

var Inode = mongoose.model('Inode', inode_schema);
exports.Inode = Inode;

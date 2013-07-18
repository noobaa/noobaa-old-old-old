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
	// timestamps - TODO: uncomment when relevant
	// create_time: Date,
	// change_time: Date,
	// modify_time: Date,
	// access_time: Date
});

// define unique index on the tuple (owner,parent,name)
inode_schema.index({
	owner: 1,
	parent: 1,
	name: 1
}, {
	unique: true
});

exports.Inode = mongoose.model('Inode', inode_schema);
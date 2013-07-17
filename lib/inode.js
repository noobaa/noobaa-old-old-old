var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var inode_schema = new mongoose.Schema({
	// namespace
	parent: types.ObjectId,
	name: String,
	// user ownership
	owner: types.ObjectId,
	// fields describing the content of the inode
	isdir: Boolean,
	fobj: types.ObjectId,
	ghost_ref: types.ObjectId,
	// timestamps
	create_time: Date,
	change_time: Date,
	modify_time: Date,
	access_time: Date
});

var Inode = mongoose.model('Inode', inode_schema);

exports.Inode = Inode;
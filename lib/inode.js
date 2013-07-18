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
	create_time: Date,
	change_time: Date,
	modify_time: Date,
	access_time: Date
});

inode_schema.statics.read_dir = function(owner, id, callback) {
	var read_dir_query = {
		owner: owner,
		parent: id
	};
	return this.model('Inode').find(read_dir_query, callback);
};

inode_schema.statics.count_dir = function(owner, id, callback) {
	var read_dir_query = {
		owner: owner,
		parent: id
	};
	return this.model('Inode').count(read_dir_query, callback);
};

var Inode = mongoose.model('Inode', inode_schema);

exports.Inode = Inode;
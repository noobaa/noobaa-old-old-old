var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var user_schema = new mongoose.Schema({
	// facebook info has free form
	fb: {},
	// user root dir
	root: types.ObjectId 
});

var User = mongoose.model('User', user_schema);

exports.User = User;

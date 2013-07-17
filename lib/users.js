var mongoose = require('mongoose');

var user_schema = new mongoose.Schema({
	// facebook info has free form
	fb: {},
});

var User = mongoose.model('User', user_schema);

exports.User = User;
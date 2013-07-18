var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var fobj_schema = new mongoose.Schema({
	size: Number,
	uploading: Boolean,
	upload_size: Number
});

exports.Fobj = mongoose.model('Fobj', fobj_schema);
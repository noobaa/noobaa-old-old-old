var mongoose = require('mongoose');
var types = mongoose.Schema.Types;

var fobj_schema = new mongoose.Schema({
	size: types.Number,
	uploading: types.Boolean,
	upload_size: types.Number
});

var Fobj = mongoose.model('Fobj', fobj_schema);

exports.Fobj = Fobj;
/* jshint node:true */
'use strict';

var mongoose = require('mongoose');

var fobj_schema = new mongoose.Schema({
	size: Number,
	uploading: Boolean,
	upsize: Number
});

exports.Fobj = mongoose.model('Fobj', fobj_schema);
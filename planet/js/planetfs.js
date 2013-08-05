/* jshint node:true */
'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var async = require('async');
var _ = require('underscore');


// Planet filesystem class

function PlanetFS(root_dir, num_chunks, chunk_size) {
	this.root_dir = root_dir;
	this.chunks_dir = path.join(this.root_dir, 'chunks');
	this.num_chunks = num_chunks;
	this.chunk_size = chunk_size;
	this.zero_chunk = new Buffer(chunk_size);
	this.zero_chunk.fill(0);
}

exports.PlanetFS = PlanetFS;


PlanetFS.prototype.init_chunks = function(callback) {
	var me = this;
	console.log('PlanetFS', 'init_chunks');
	return async.waterfall([
		function(next) {
			fs.mkdir(me.chunks_dir, function(err) {
				// ignore if already exists
				if (err.code === 'EEXIST') {
					err = null;
				}
				next(err);
			});
		},
		me.remove_unneeded_chunks.bind(me),
		me.create_chunks.bind(me)
	], callback);
};

PlanetFS.prototype.remove_unneeded_chunks = function(callback) {
	var me = this;
	console.log('PlanetFS', 'remove_unneeded_chunks', me.chunks_dir);
	return async.waterfall([
		// read the dir content
		fs.readdir.bind(null, me.chunks_dir),
		// delete each chunk with index above needed
		function(files, next) {
			return async.every(files, me.remove_unneeded_chunk.bind(me), next);
		}
	], callback);
};

PlanetFS.prototype.remove_unneeded_chunk = function(name, callback) {
	var me = this;
	var index = parseInt(name, 10);
	var fname = path.join(me.chunks_dir, index.toString());
	if (index < me.num_chunks) {
		return callback();
	}
	console.log('PlanetFS', 'remove_unneeded_chunk:', fname, 'TODO: leaving for now');
	return callback();
	// return fs.unlink(fname, callback);
};

PlanetFS.prototype.create_chunks = function(callback) {
	var me = this;
	console.log('PlanetFS', 'create_chunks');
	return async.times(me.num_chunks, function(n, next) {
		var fname = path.join(me.chunks_dir, n.toString());
		return fs.writeFile(fname, me.zero_chunk, next);
	}, callback);
};
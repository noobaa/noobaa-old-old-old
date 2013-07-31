/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */

(function(global) {
	'use strict';

	function toArray(list, from) {
		return Array.prototype.slice.call(list || [], from || 0);
	}

	function show_log() {
		var args = toArray(arguments);
		console.log.apply(console, args);
		$('#log').append('<p>' + args.join(' ') + '</p>');
	}

	function show_error() {
		var args = toArray(arguments);
		console.error.apply(console, args);
		$('#log').append('<p style="color: red">' +
			args.join(' ') + '</p>');
	}

	function zerobuf(len) {
		var buf = new ArrayBuffer(len);
		var view = new Uint8Array(buf);
		for (var i = 0; i < len; i++) {
			view[i] = 0;
		}
		return buf;
	}

	var storage = navigator.webkitPersistentStorage;
	var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

	var FSSIZE = 10 * 1024 * 1024;
	var ZEROBLOB = new Blob([zerobuf(1024 * 1024)]);


	/*
	function(next) {
		show_log('Quota - Requesting...');
		return storage.requestQuota(fssize,
			function(granted_fssize) {
				if (granted_fssize < fssize) {
					return next('could not get quota ' + granted_fssize);
				}
				show_log('Quota - Granted.');
				return next(null);
			}, function(err) {
				return next(err);
			}
		);
	},

	function(next) {
		show_log('Quota - Querying...');
		return storage.queryUsageAndQuota(function(usage, quota) {
			show_log('Quota - usage:' + usage + ' quota:' + quota);
			return next(null, usage);
		}, function(err) {
			return next(err);
		});
	},
	*/

	// Planet filesystem class

	function PlanetFS(fs, fssize) {
		this.fs = fs;
		this.fssize = fssize;
	}

	// async init of PlanetFS object and run the given planet_fs_main(pfs)

	function init_PlanetFS(fssize, planet_fs_main) {
		return requestFileSystem(
			window.PERSISTENT,
			fssize,
			function(fs) {
				var f = new PlanetFS(fs, fssize);
				planet_fs_main(f);
			}, function(err) {
				show_error('PlanetFS_init:', err);
				// TODO: throw?
			}
		);
	}

	// create one more chunk file on the fs to consume the space

	PlanetFS.prototype.create_chunk = function(callback) {
		var me = this;
		var time = new Date().getTime();
		var fname = 'chunk-' + time + '.noobaa';
		return async.waterfall([
			// create the file
			function(next) {
				show_log('PlanetFS', 'create_chunk:', fname);
				return me.fs.root.getFile(fname, {
					create: true,
					exclusive: true
				}, function(fileEntry) {
					return next(null, fileEntry);
				}, function(err) {
					return next(err);
				});
			},
			// open for write
			function(fileEntry, next) {
				show_log('PlanetFS', 'create_chunk:', 'open for write...');
				return fileEntry.createWriter(function(writer) {
					return next(null, writer);
				}, function(err) {
					return next(err);
				});
			},
			// write buffer (zeros)
			function(writer, next) {
				show_log('PlanetFS', 'create_chunk:', 'writing...');
				writer.onwriteend = function() {
					return next();
				};
				writer.onerror = function(err) {
					return next(err);
				};
				return writer.write(ZEROBLOB);
			}
		], callback);
	};


	// create more chunks to consume all the unused space

	PlanetFS.prototype.create_chunks_for_unused = function(callback) {
		var me = this;
		return async.waterfall([
			function(next) {
				show_log('PlanetFS', 'create_chunks_for_unused:', 'query usage...');
				return storage.queryUsageAndQuota(function(usage, quota) {
					show_log('PlanetFS', 'Quota - usage:' + usage + ' quota:' + quota);
					return next(null, usage);
				}, function(err) {
					return next(err);
				});
			},
			function(usage, next) {
				var unused = me.fssize - usage;
				show_log('PlanetFS', 'create_chunks_for_unused:', 'unused=', unused);
				return async.whilst(
					function() {
						unused -= 1024 * 1024;
						return unused > 0;
					}, function(next_while) {
						return me.create_chunk(next_while);
					}, next);
			}
		], callback);
	};


	PlanetFS.prototype.foreach_chunk = function(iterator, callback) {
		show_log('PlanetFS', 'foreach_chunk', 'start');
		var reader = this.fs.root.createReader();
		var readdir = function() {
			// call the reader.readEntries() until no more results are returned
			return reader.readEntries(function(results) {
				if (!results.length) {
					// readdir done
					show_log('PlanetFS', 'foreach_chunk', 'done');
					return callback();
				}
				var entries = toArray(results);
				return async.every(entries, iterator, function(err) {
					if (err) {
						return callback(err);
					} else {
						// continue to next read
						return readdir();
					}
				});
			}, function(err) {
				return callback(err);
			});
		};
		return readdir(); // start the readdir
	};

	function show_entry(entry, callback) {
		show_log('PlanetFS', 'show_entry:', entry);
		return callback();
	}

	function delete_entry(entry, callback) {
		entry.remove(function() {
			show_log('PlanetFS', 'delete_entry:', entry);
			return callback();
		}, function(err) {
			return callback(err);
		});
	}


	init_PlanetFS(FSSIZE, function(pfs) {
		return async.waterfall([
			pfs.foreach_chunk.bind(pfs, show_entry),
			pfs.foreach_chunk.bind(pfs, delete_entry),
			pfs.create_chunks_for_unused.bind(pfs)
		], function(err) {
			if (err) {
				show_error(err);
			} else {
				show_log('PlanetFS:', 'all done.');
			}
		});
	});

}(this)); // passing global this to allow exporting
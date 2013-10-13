/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.service('nbUploadSrv', [
		'$q', '$http', '$timeout', '$rootScope', '$templateCache', UploadSrv
	]);

	function UploadSrv($q, $http, $timeout, $rootScope, $templateCache) {
		this.$q = $q;
		this.$http = $http;
		this.$timeout = $timeout;
		this.$rootScope = $rootScope;

		this.$cb = $rootScope.safe_callback.bind($rootScope);

		setup_upload_node_template($templateCache);

		// use node-webkit modules if available
		this.$fs = window.require && window.require('fs');
		this.$path = window.require && window.require('path');

		this.list_loading = new LinkedList('ld');
		this.list_uploading = new LinkedList('up');
		this.list_retrying = new LinkedList('rt');

		this.jobq_load = new JobQueue(4, $timeout);
		this.jobq_upload_small = new JobQueue(4, $timeout);
		this.jobq_upload_medium = new JobQueue(2, $timeout);
		this.jobq_upload_large = new JobQueue(1, $timeout);
		this.medium_threshold = 512 * 1024; // ~5 seconds upload with 100 KB/s
		this.large_threshold = 8 * 1024 * 1024;

		this.id_gen = 1;

		this.root = {
			sons: {},
			num_sons: 0,
			total_sons: 0,
			total_completed: 0,
			total_size: 0,
			total_upsize: 0,
			level: 0,
			is_expanded: true,
		};

		// multiple ui selection
		this.selection = {};

		this.total_bytes = 0;

		// calculate global upload speed
		var me = this;
		var now = new Date().getTime();
		me.speed = 0;
		me.speed_x = [0, 0, 0];
		me.speed_t = [now, now, now];
		setInterval(me.$cb(function() {
			var last = me.speed_x.length - 1;
			for (var i = 0; i < last; i++) {
				me.speed_x[i] = me.speed_x[i + 1];
				me.speed_t[i] = me.speed_t[i + 1];
			}
			me.speed_x[last] = me.total_bytes;
			me.speed_t[last] = new Date().getTime();
			var dx = me.speed_x[last] - me.speed_x[0];
			var dt = me.speed_t[last] - me.speed_t[0];
			me.speed = (dx * 1000) / (dt * 1024); // KB/s
		}), 2000);

		// check for active uploads before page unloads
		$(window).on('beforeunload', function() {
			if (me.has_unfinished_uploads()) {
				return 'Leaving this page will interrupt your active Uploads !!!';
			}
		});
	}

	UploadSrv.prototype.has_uploads = function() {
		return !!this.root.num_sons;
	};

	UploadSrv.prototype.has_unfinished_uploads = function() {
		return (!this.list_loading.is_empty()) ||
			(!this.list_uploading.is_empty()) ||
			(!this.list_retrying.is_empty()) ||
			( !! this.jobq_load.length) ||
			( !! this.jobq_upload_small.length) ||
			( !! this.jobq_upload_medium.length) ||
			( !! this.jobq_upload_large.length);
	};



	/////////////////////
	/////////////////////
	// EVENTS HANDLING //
	/////////////////////
	/////////////////////


	// use on jquery elements to setup an upload drop listener
	UploadSrv.prototype.setup_drop = function(elements) {
		var me = this;
		var return_false = function() {
			return false;
		};
		elements.on('dragover', return_false);
		elements.on('dragend', return_false);
		elements.on('drop', function(event) {
			return me.submit_upload(event);
		});
	};


	// use on input jquery elements to setup an upload change listener
	UploadSrv.prototype.setup_file_input = function(elements) {
		var me = this;
		elements.on('change', function(event) {
			me.submit_upload(event);
			this.value = ''; // reset the input to allow open same file next
		});
	};


	// submit the upload event and start processing
	UploadSrv.prototype.submit_upload = function(event) {
		event = event.originalEvent;
		var me = this;
		var i;

		// try using dataTransfer object if available (drop event)
		// or target object for file input.
		var tx = event.dataTransfer || event.target;
		if (!tx) {
			console.log('THIS IS A FUNKY EVENT', event);
			return;
		}

		// in browser (not planet) use html5 api (supported only on webkit) 
		// to get as entry which is better for big folders.
		// We want to get the entries of the file input instead of list of files
		// to avoid browser preloading all files on large dirs.
		// However although on_drop works correctly unfortunately file input 
		// with webkitdirectory is a bit broken (crbug.com/138987)
		// and webkit doesn't populate tx.webkitEntries at all (at least untill fixed).
		var entries = tx.webkitEntries || [];
		if (tx.items) {
			// convert html5 items to entries 
			for (i = 0; i < tx.items.length; i++) {
				var item = tx.items[i];
				if (item.getAsEntry) {
					entries[i] = item.getAsEntry();
				} else if (item.webkitGetAsEntry) {
					entries[i] = item.webkitGetAsEntry();
				}
			}
		}

		var items;
		if (this.$fs && tx.files) {
			items = tx.files; // node-webkit files with full path
		} else if (entries.length) {
			items = entries; // html5 entries
		} else if (tx.files) {
			items = tx.files; // plain html files
		} else {
			return; // someother event
		}

		// get the target directory or inode
		var upload_target = me.get_upload_target(event);
		if (!upload_target) {
			return; // no target, cancel
		}

		// submit each of the items
		for (i = 0; i < items.length; i++) {
			me.submit_item(items[i], upload_target, me.root);
		}

		event.preventDefault();
		event.stopPropagation();
		return false;
	};


	// submit single item to upload.
	UploadSrv.prototype.submit_item = function(item, target, parent) {
		parent = parent || this.root;
		// console.log('SUBMIT', item.name);
		var upload = this._create_upload(item, target, parent);
		if (upload) {
			this._add_to_load_queue(upload);
		}
	};



	///////////////
	///////////////
	// LOAD FLOW //
	///////////////
	///////////////


	UploadSrv.prototype._create_upload = function(item, target, parent) {
		// create new upload and add to parent
		var upload = {
			item: item,
			id: this.id_gen++,
			parent: parent,
		};
		if (target.inode_id) {
			upload.inode_id = target.inode_id;
		}
		if (target.dir_inode_id) {
			upload.dir_inode_id = target.dir_inode_id;
		}
		if (target.src_dev_id) {
			upload.src_dev_id = target.src_dev_id;
		}
		parent.sons[upload.id] = upload;
		parent.num_sons++;
		for (var p = parent; p; p = p.parent) {
			p.total_sons++;
		}
		return upload;
	};


	UploadSrv.prototype._add_to_load_queue = function(upload) {
		if (upload.is_pending_load) {
			return;
		}
		var me = this;
		upload.is_pending_load = true;
		upload.run = function() {
			upload.run = null;
			upload.is_pending_load = false;
			if (!upload.is_removed) {
				return me._run_load_flow(upload);
			}
		};
		me.jobq_load.add(upload);
	};


	// the load flow prepares the file/dir by resolving type 
	// and reading directories (and submit sons).
	// finally add files to upload queue.
	UploadSrv.prototype._run_load_flow = function(upload) {
		var me = this;
		return me.$q.when().then(function() {
			me.list_loading.push_back(upload);
			upload.is_loading = true;
			delete upload.progress_class;
			delete upload.error_text;
		}).then(function() {
			throw_if_stopped(upload);
			return me._prepare_file_attr(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._prepare_file_entry(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._mkdir(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._readdir_from_star(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._readdir(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._add_to_upload_queue(upload);
		}).then(function() {
			// console.log('LOAD DONE', upload.item.name);
			var p;
			me.list_loading.remove(upload);
			upload.is_loading = false;
			if (!upload.is_loaded) {
				upload.is_loaded = true;
				if (upload.item.isDirectory) {
					// for dirs they completed their job so update parents
					for (p = upload.parent; p; p = p.parent) {
						p.total_completed++;
					}
				} else {
					// for files update the parents bytes size
					for (p = upload.parent; p; p = p.parent) {
						p.total_size += upload.item.size;
					}
				}
			}
		}).then(null, function(err) {
			me.list_loading.remove(upload);
			upload.is_loading = false;
			var retry = me.detect_error(upload, err);
			if (retry) {
				upload.is_pending_retry = true;
				me.list_retrying.push_back(upload);
				me.$timeout(function() {
					upload.is_pending_retry = false;
					me.list_retrying.remove(upload);
					me._add_to_load_queue(upload);
				}, 3000);
			}
		});
	};


	// for node items with full paths, stat and fill properties of the item
	UploadSrv.prototype._prepare_file_attr = function(upload) {
		var me = this;
		var item = upload.item;
		if (!me.$fs || !item.path) {
			return me.$q.when();
		}

		// console.log('LOAD prepare file attr', item.path);

		// node file/dir
		var defer = me.$q.defer();
		me.$fs.stat(item.path, me.$cb(function(err, stats) {
			if (err) {
				return defer.reject(err);
			}
			try {
				if (stats.isDirectory()) {
					item.isDirectory = true;
					item.size = 0;
				} else {
					item.size = stats.size;
				}
				return defer.resolve();
			} catch (ex) {
				return defer.reject(ex);
			}
		}));
		return defer.promise;
	};


	// for html5 file entry, get the file.
	UploadSrv.prototype._prepare_file_entry = function(upload) {
		var me = this;
		var item = upload.item;
		if (!item.isFile) {
			return me.$q.when();
		}

		// console.log('LOAD prepare file entry', item.name);

		var defer = me.$q.defer();
		item.file(me.$cb(function(file) {
			// replace the item from file entry to the file object
			upload.item = file;
			defer.resolve();
		}), me.$cb(function(err) {
			defer.reject(err);
		}));
		return defer.promise;
	};


	// create the dir inode in the server or find the existing one
	UploadSrv.prototype._mkdir = function(upload) {
		var me = this;
		if (!upload.item.isDirectory) {
			return me.$q.when();
		}

		console.log('LOAD mkdir', upload.item.name);

		find_existing_dirent_in_parent(upload);

		if (upload.inode_id) {
			// inode_id supplied - getattr to verify it exists
			return me.$http({
				method: 'GET',
				url: '/star_api/inode/' + upload.inode_id,
				params: {
					// tell the server to return attr 
					// and not readdir us as in normal read
					getattr: true
				}
			});
		}

		if (upload.dir_inode_id) {
			// create the file and receive upload location info
			return me.$http({
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.dir_inode_id,
					name: upload.item.name,
					isdir: true,
					src_dev_id: upload.src_dev_id,
					src_dev_path: upload.item.path
				}
			}).then(function(res) {
				// fill the target inode id for retries
				console.log('mkdir id', res.data.id);
				upload.inode_id = res.data.id;
			});
		}

		throw 'unknown target';
	};


	// readdir from star to discover existing sons
	UploadSrv.prototype._readdir_from_star = function(upload) {
		var me = this;
		var item = upload.item;
		if (!item.isDirectory || !upload.inode_id) {
			return me.$q.when();
		}
		return me.$http({
			method: 'GET',
			url: '/star_api/inode/' + upload.inode_id,
		}).then(function(res) {
			var ents = res.data.entries;
			console.log('READDIR FROM STAR', upload.item.name, ents);
			upload.dirents = {};
			for (var i = 0; i < ents.length; i++) {
				var en = ents[i];
				var eo = upload.dirents[en.name];
				if (eo) {
					if (eo.length) {
						eo.push(en);
					} else {
						upload.dirents[en.name] = [eo, en];
					}
				} else {
					upload.dirents[en.name] = en;
				}
			}
		});
	};

	function find_existing_dirent_in_parent(upload) {
		if (!upload.parent.dirents) {
			return;
		}
		var ent = upload.parent.dirents[upload.item.name];
		if (!ent) {
			return;
		}
		if (!ent.length) {
			fill_existing_dirent(upload, ent);
		} else {
			for (var i = 0; i < ent.length; i++) {
				if (fill_existing_dirent(upload, ent[i])) {
					break;
				}
			}
		}
	}

	function fill_existing_dirent(upload, ent) {
		if (!ent.isdir !== !upload.item.isDirectory) {
			return false;
		}
		upload.inode_id = ent.id;
		return true;
	}


	// for directories - readdir entries from local fs and submit sons
	UploadSrv.prototype._readdir = function(upload) {
		var me = this;
		var item = upload.item;
		if (!item.isDirectory) {
			return me.$q.when();
		}

		item.size = 0;
		// we fill level only for potential parent
		upload.level = upload.parent.level + 1;
		upload.sons = {};
		upload.num_sons = 0;
		upload.total_sons = 0;
		upload.total_completed = 0;
		upload.total_size = 0;
		upload.total_upsize = 0;
		var target = {
			dir_inode_id: upload.inode_id
		};

		var defer = me.$q.defer();
		if (item.path) {
			// use nodejs filesystem api
			console.log('LOAD readdir (node)', item.name, item.path);
			me.$fs.readdir(item.path, me.$cb(function(err, entries) {
				if (err) {
					return defer.reject(err);
				}
				try {
					for (var i = 0; i < entries.length; i++) {
						var son = {
							name: entries[i],
							path: me.$path.join(item.path, entries[i])
						};
						me.submit_item(son, target, upload);
					}
				} catch (ex) {
					return defer.reject(ex);
				}
				return defer.resolve();
			}));
		} else {
			// use html5 filesystem api
			console.log('LOAD readdir (html5)', item.name);
			var dir_reader = item.createReader();
			var readdir_func = function() {
				dir_reader.readEntries(me.$cb(function(entries) {
					try {
						// html5 readdir is done when zero length array is passed
						if (!entries.length) {
							return defer.resolve();
						}
						for (var i = 0; i < entries.length; i++) {
							me.submit_item(entries[i], target, upload);
						}
						me.$timeout(readdir_func, 10); // submit next readdir
					} catch (err) {
						return defer.reject(err);
					}
				}), me.$cb(function(err) {
					return defer.reject(err);
				}));
			};
			readdir_func();
		}
		return defer.promise;
	};


	UploadSrv.prototype._add_to_upload_queue = function(upload) {
		var me = this;
		var item = upload.item;
		if (item.isDirectory) {
			return;
		}
		if (upload.is_pending_upload) {
			return;
		}
		var jobq;
		if (item.size >= this.large_threshold) {
			jobq = this.jobq_upload_large;
		} else if (item.size >= this.medium_threshold) {
			jobq = this.jobq_upload_medium;
		} else {
			jobq = this.jobq_upload_small;
		}
		upload.is_pending_upload = true;
		upload.run = function() {
			upload.run = null;
			upload.is_pending_upload = false;
			if (!upload.is_removed) {
				return me.run_upload_flow(upload);
			}
		};
		jobq.add(upload);
	};



	/////////////////
	/////////////////
	// UPLOAD FLOW //
	/////////////////
	/////////////////


	UploadSrv.prototype.run_upload_flow = function(upload) {
		var me = this;
		var item = upload.item;
		return me.$q.when().then(function() {
			me.list_uploading.push_back(upload);
			upload.is_uploading = true;
			delete upload.progress_class;
			delete upload.error_text;
		}).then(function() {
			throw_if_stopped(upload);
			return me._open_file_for_read(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._mkfile(upload);
		}).then(function(res) {
			throw_if_stopped(upload);
			return me._mkfile_check(upload, res);
		}).then(function() {
			throw_if_stopped(upload);
			return me._upload_multipart(upload);
		}).then(function() {
			// console.log('UPLOAD DONE', upload.item.name);
			me.list_uploading.remove(upload);
			me._close_file(upload);
			upload.is_uploading = false;
			if (!upload.is_uploaded) {
				upload.is_uploaded = true;
				for (var p = upload.parent; p; p = p.parent) {
					p.total_completed++;
				}
			}
		}).then(null, function(err) {
			me.list_uploading.remove(upload);
			me._close_file(upload);
			upload.is_uploading = false;
			var retry = me.detect_error(upload, err);
			if (retry) {
				upload.is_pending_retry = true;
				me.list_retrying.push_back(upload);
				me.$timeout(function() {
					upload.is_pending_retry = false;
					me.list_retrying.remove(upload);
					me._add_to_upload_queue(upload);
				}, 3000);
			}
		});
	};


	// open the file and save fd in the item for node files.
	// will return resolved promise if file is already open,
	// or if the item has the slice function (html5 file blob api)
	UploadSrv.prototype._open_file_for_read = function(upload) {
		var me = this;
		var item = upload.item;
		if (item.fd || typeof item.slice === 'function') {
			return me.$q.when();
		}
		if (!me.$fs || !item.path) {
			throw 'missing fs path for item slice';
		}
		var defer = me.$q.defer();
		me.$fs.open(item.path, 'r', me.$cb(function(err, fd) {
			if (err) {
				return defer.reject(err);
			}
			item.fd = fd;
			return defer.resolve(fd);
		}));
		return defer.promise;
	};


	UploadSrv.prototype._close_file = function(upload) {
		if (upload.item.fd) {
			this.$fs.closeSync(upload.item.fd);
			upload.item.fd = null;
		}
	};


	UploadSrv.prototype._mkfile = function(upload) {
		var me = this;
		var item = upload.item;

		find_existing_dirent_in_parent(upload);

		if (upload.inode_id) {
			// inode_id supplied - getattr to verify it exists
			console.log('UPLOAD gettattr', upload);
			return me.$http({
				method: 'GET',
				url: '/star_api/inode/' + upload.inode_id,
				params: {
					// tell the server to return attr 
					// and not redirect us as in normal read
					getattr: true
				}
			});
		}

		if (upload.dir_inode_id) {
			// create the file and receive upload location info
			console.log('UPLOAD create', upload);
			return me.$http({
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.dir_inode_id,
					isdir: false,
					uploading: true,
					name: item.name,
					size: item.size,
					content_type: item.type,
					relative_path: item.webkitRelativePath,
					src_dev_id: upload.src_dev_id,
					src_dev_path: item.path
				}
			});
		}

		throw 'unknown target';
	};


	UploadSrv.prototype._mkfile_check = function(upload, res) {
		var item = upload.item;
		console.log('UPLOAD mkfile result', res.data);
		if (res.data.name !== item.name || res.data.size !== item.size) {
			$.nbalert('Choose the same file to resume the upload');
			throw 'mismatching file attr';
		}
		upload.inode_id = res.data.id;
	};


	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('UPLOAD multipart', upload.item.name);
		// get missing parts
		return me.$http({
			method: 'POST',
			url: '/star_api/inode/' + upload.inode_id + '/multipart/'
		}).then(function(res) {
			throw_if_stopped(upload);
			upload.multipart = res.data;
			// console.log('UPLOAD multipart state', upload.multipart);
			if (upload.multipart.complete) {
				update_upsize(upload, upload.item.size);
				return; // done
			}
			// maintain upsize on this upload and parents
			update_upsize(upload, upload.multipart.upsize);
			// send missing parts
			// TODO: maintain part_number_marker to ease on the server
			var missing_parts = upload.multipart.missing_parts;
			// init promise to send forst part in the batch
			var promise = me._send_part(upload, missing_parts[0]);
			// define part sender that takes part as argument (see why below)
			var sender = function(part) {
				// increasing upsize between parts in batch
				// once batch is over the multipart response will update again.
				upload.multipart.upsize += upload.multipart.part_size;
				update_upsize(upload, upload.multipart.upsize);
				return me._send_part(upload, part);
			};
			// chain the rest of the parts on the promise
			for (var i = 1; i < missing_parts.length; i++) {
				// some care is needed here to bind to the part correctly.
				// we use bind() to get a function which is fixed to the specific 
				// part object of each loop iteration.
				// its easy to confuse here and define local function inside the loop
				// but its closure variables 'i' or 'part' are mutating in the loop
				// so with closure they won't be valid when executed.
				// The point is to not refer by closure to any of the loop iterators,
				// and bind() makes it so.
				var part = missing_parts[i];
				var part_sender = sender.bind(null, part);
				promise = promise.then(part_sender);
			}
			// last stage would be to recurse into this function to upload rest till completed
			return promise.then(function() {
				return me._upload_multipart(upload);
			});
		});
	};


	UploadSrv.prototype._send_part = function(upload, part) {
		var me = this;
		var part_size = upload.multipart.part_size;
		var start = (part.num - 1) * part_size;
		var end = start + part_size;
		var last_loaded = 0;
		// console.log('UPLOAD part', part, start, end);
		return me._item_slice(upload.item, start, end).then(function(data) {
			var defer = me.$q.defer();
			var xhr = upload.xhr = new XMLHttpRequest();
			xhr.onreadystatechange = me.$cb(function() {
				if (xhr.readyState !== 4) {
					return;
				}
				// console.log('UPLOAD xhr', xhr);
				upload.xhr = null;
				if (xhr.status !== 200) {
					defer.reject(xhr);
				} else {
					defer.resolve();
				}
			});
			xhr.upload.onprogress = me.$cb(function(event) {
				update_upsize(upload, upload.multipart.upsize + event.loaded);
				me.total_bytes += event.loaded - last_loaded;
				last_loaded = event.loaded;
			});
			xhr.open('PUT', part.url, true);
			xhr.send(data);
			return defer.promise;
		});
	};


	UploadSrv.prototype._item_slice = function(item, start, end) {
		var me = this;
		if (typeof item.slice === 'function') {
			return me.$q.when(item.slice(start, end));
		}
		if (!me.$fs || !item.fd) {
			throw 'missing fd for item slice';
		}
		if (end > item.size) {
			end = item.size;
		}
		if (end < start) {
			throw 'bad slice range';
		}
		var defer = me.$q.defer();
		me.$fs.read(item.fd, new Buffer(end - start), 0, end - start, start,
			me.$cb(function(err, nbytes, buf) {
				if (err) {
					return defer.reject(err);
				} else {
					var data_slice = buf.slice(0, nbytes);
					var data_view = new Uint8Array(data_slice);
					var blob = new Blob([data_view]);
					return defer.resolve(blob);
				}
			})
		);
		return defer.promise;
	};


	function calc_progress(current, total) {
		return (current === total) ? 100 : (current * 100 / total);
	}

	function update_upsize(upload, upsize) {
		upload.upsize = upload.upsize || 0; // init
		var diffsize = upsize - upload.upsize;
		upload.upsize += diffsize;
		upload.progress = calc_progress(upload.upsize, upload.item.size);
		for (var p = upload.parent; p; p = p.parent) {
			p.total_upsize += diffsize;
			p.progress = calc_progress(p.total_upsize, p.total_size);
		}
	}


	///////////////////
	///////////////////
	// STATE CHANGES //
	///////////////////
	///////////////////


	function throw_if_stopped(upload) {
		if (upload.is_stopped) {
			throw 'nb-upload-stop';
		}
	}

	// returns true if should retry
	UploadSrv.prototype.detect_error = function(upload, err) {
		// pause exception
		if (err === 'nb-upload-stop') {
			return false;
		}
		// no http response
		if (err.status === 0) {
			upload.progress_class = 'warning';
			upload.error_text = 'Disconnected, retrying';
			return true;
		}
		// http insufficient storage
		if (err.status === 507) {
			upload.progress_class = 'warning';
			upload.progress = 100;
			upload.error_text = 'Out of space';
			return false; // TODO maybe retry with long delay?
		}
		// http internal error
		if (err.status === 500) {
			upload.progress_class = 'warning';
			upload.error_text = 'Server error, retrying';
			return true; // TODO server error could be persistent... not sure if should retry
		}
		// http not found
		if (err.status === 404) {
			upload.progress_class = 'danger';
			upload.progress = 100;
			upload.error_text = 'File not found';
			return false; // TODO is it right for all 404 cases?
		}
		// TODO handle more errors
		console.error('~~~~~ UNDETECTED ERROR ~~~~~~', err, typeof err, err.stack);
		upload.progress_class = 'danger';
		upload.progress = 100;
		upload.error_text = err;
		return false; // TODO maybe retry on unknown error? not sure what is better
	};

	UploadSrv.prototype.is_completed = function(upload) {
		if (upload.item.isDirectory) {
			return upload.is_loaded && (upload.total_completed === upload.total_sons);
		} else {
			return upload.is_uploaded;
		}
	};

	UploadSrv.prototype.get_status = function(upload) {
		if (upload.error_text && !upload.is_stopped) {
			return upload.error_text;
		}
		if (upload.is_loading) {
			return 'Loading...';
		}
		if (this.is_completed(upload)) {
			return 'Done';
		}
		if (upload.is_stopped) {
			return 'Paused';
		}
		if (upload.progress) {
			return upload.progress.toFixed(1) + '%';
		}
		return '';
	};



	UploadSrv.prototype.clear_completed = function() {
		for (var id in this.root.sons) {
			var upload = this.root.sons[id];
			if (this.is_completed(upload)) {
				console.log('CLEAR COMPLETED', upload);
				this.do_remove(upload);
			}
		}
	};

	UploadSrv.prototype.pause_selected = function() {
		this.foreach_selected(this.do_stop.bind(this));
		this.clear_selection();
	};

	UploadSrv.prototype.resume_selected = function() {
		this.foreach_selected(this.do_resume.bind(this));
		this.clear_selection();
	};

	UploadSrv.prototype.remove_selected = function() {
		var me = this;
		// check if there are selected uploads which are not completed
		var has_incomplete = false;
		me.foreach_selected(function(upload) {
			if (!me.is_completed(upload)) {
				has_incomplete = true;
				return false; // break from foreach
			}
		});
		if (!has_incomplete) {
			me.foreach_selected(me.do_remove.bind(me));
			me.clear_selection();
		} else {
			$.nbconfirm('Some of the selected uploads did not complete. Are you sure?', {
				on_confirm: me.$cb(function() {
					me.foreach_selected(me.do_remove.bind(me));
					me.clear_selection();
				})
			});
		}
	};


	UploadSrv.prototype.do_stop = function(upload, func) {
		upload.is_stopped = true;
		if (func) {
			func(upload);
		}
		// quickly remove from job queues
		if (this.jobq_load.remove(upload)) {
			upload.run = null;
			upload.is_pending_load = false;
		} else if (this.jobq_upload_small.remove(upload) ||
			this.jobq_upload_medium.remove(upload) ||
			this.jobq_upload_large.remove(upload)) {
			upload.run = null;
			upload.is_pending_upload = false;
		}
		// stop working connection
		if (upload.xhr) {
			console.log('ABORT XHR', upload.item.name);
			upload.xhr.abort();
		}
		// propagate to sons
		for (var id in upload.sons) {
			var son = upload.sons[id];
			this.do_stop(son, func);
		}
	};

	UploadSrv.prototype.do_resume = function(upload) {
		for (var id in upload.sons) {
			var son = upload.sons[id];
			this.do_resume(son);
		}
		upload.is_stopped = false;
		// add to proper job queue
		if (!upload.is_loaded && !upload.is_loading) {
			this._add_to_load_queue(upload);
		} else if (!upload.item.isDirectory && !upload.is_uploaded && !upload.is_uploading) {
			this._add_to_upload_queue(upload);
		}
	};

	UploadSrv.prototype.do_remove = function(upload) {
		var me = this;
		console.log('REMOVING', upload.item.name);
		// stop entire tree of uploads below and remove
		me.do_stop(upload, function(son) {
			// will run on every item during stop recursion
			if (son.is_selected) {
				son.is_selected = false;
				delete me.selection[son.id];
			}
			son.is_removed = true;
		});
		// uncount entire tree under this upload
		var diff_sons, diff_completed, diff_size, diff_upsize;
		if (upload.item.isDirectory) {
			diff_sons = (upload.total_sons || 0) + 1;
			diff_completed = (upload.total_completed || 0) + (upload.is_loaded ? 1 : 0);
			diff_size = upload.total_size || 0;
			diff_upsize = upload.total_upsize || 0;
		} else {
			diff_sons = 1;
			diff_completed = (upload.is_uploaded ? 1 : 0);
			diff_size = upload.item.size || 0;
			diff_upsize = upload.upsize || 0;
		}
		for (var p = upload.parent; p; p = p.parent) {
			p.total_sons -= diff_sons;
			p.total_completed -= diff_completed;
			p.total_size -= diff_size;
			p.total_upsize -= diff_upsize;
			p.progress = calc_progress(p.total_upsize, p.total_size);
		}
		// detach from parent
		delete upload.parent.sons[upload.id];
		upload.parent.num_sons--;
		// detach the inode source to stop reloading
		me.detach_source(upload);
	};


	// update server to remove the item source device
	UploadSrv.prototype.detach_source = function(upload) {
		if (!upload.src_dev_id || !upload.inode_id) {
			return;
		}
		var me = this;
		return me.$http({
			method: 'PUT',
			url: '/star_api/inode/' + upload.inode_id,
			data: {
				src_dev_id: null
			}
		}).then(function(res) {
			console.log('DETACHED SOURCE', upload.inode_id);
		}, function(err) {
			var retry = err.status !== 404;
			console.log('FAILED DETACH SOURCE', upload.inode_id, retry ? 'will retry' : '');
			if (retry) {
				me.$timeout(function() {
					me.detach_source(upload);
				}, 1000);
			}
		});
	};

	UploadSrv.prototype.reload_source = function(device_id) {
		var me = this;
		return me.$http({
			method: 'GET',
			url: '/star_api/inode/src_dev/' + device_id,
		}).then(function(res) {
			var ents = res.data.entries;
			for (var i = 0; i < ents.length; i++) {
				var ent = ents[i];
				var item = {
					name: ent.name,
					path: ent.src_dev_path
				}
				var target = {
					inode_id: ent.id
				}
				console.log('SUBMIT ITEM FROM SOURCE', ent, item, target);
				me.submit_item(item, target);
			}
		});
	};



	UploadSrv.prototype.clear_selection = function(leave_global) {
		var had_any = false;
		for (var id in this.selection) {
			var upload = this.selection[id];
			upload.is_selected = false;
			had_any = true;
		}
		if (had_any) {
			this.selection = [];
		}
		if (!leave_global) {
			this.selected_all = undefined;
		}
	};

	UploadSrv.prototype.toggle_select_all = function() {
		// toggle the global flag
		if (!this.selected_all && _.isEmpty(this.selection)) {
			this.selected_all = true;
		} else {
			this.selected_all = false;
		}
		// in any case remove the selection from each of the uploads
		this.clear_selection(true);
	};

	UploadSrv.prototype.toggle_select = function(upload) {
		// reset the global flag
		this.selected_all = undefined;
		// toggle current state
		if (upload.is_selected) {
			upload.is_selected = false;
			delete this.selection[upload.id];
		} else {
			upload.is_selected = true;
			this.selection[upload.id] = upload;
		}
	};

	UploadSrv.prototype.foreach_selected = function(func) {
		var col = this.selected_all ? this.root.sons : this.selection;
		for (var id in col) {
			var upload = col[id];
			var ignore_selection = false;
			for (var p = upload.parent; p; p = p.parent) {
				// make sure not to iterate sons of already selected items
				// the parent will be iterated instead.
				// also ignore if any parent is not expanded to avoid unwanted actions
				if (p.is_selected || !p.is_expanded) {
					ignore_selection = true;
					break;
				}
			}
			if (!ignore_selection) {
				var ret = func(upload);
				// allow to break from the loop by returning false (exactly false, not undefined)
				if (ret === false) {
					break;
				}
			}
		}
	};

	UploadSrv.prototype.toggle_expand = function(upload) {
		upload.is_expanded = !upload.is_expanded;
	};

	// this forces the html to be empty when not expanded
	// and saves some memory and overhead in case there are lots of items
	noobaa_app.filter('upload_sons_filter', function() {
		return function(upload) {
			if (!upload.is_expanded) {
				return null;
			}
			return upload.sons;
			/* TODO too much cpu for sorting
			return _.sortBy(upload.sons, function(son) {
				if (son.item.isDirectory) {
					return -son.total_size;
				} else {
					return -son.item.size;
				}
			});
			*/
		};
	});


	noobaa_app.directive('nbUploadTable', function() {
		return {
			controller: ['$scope', 'nbUploadSrv',
				function($scope, nbUploadSrv) {
					$scope.srv = nbUploadSrv;
					$scope.upload = $scope.srv.root;
				}
			],
			restrict: 'E',
			replace: true,
			template: [
				'<div id="upload_table"',
				'	ng-cloak class="fntthin"',
				'	style="border: 1px solid #ccc;">',
				'	<div class="row" style="margin-top: 20px; margin-bottom: 20px">',
				'		<div class="col-sm-4 text-center" style="margin-bottom: 10px"><div class="btn-group">',
				'			<button class="btn btn-success btn-sm"',
				'				ng-click="srv.clear_completed()"',
				'				title="Clear Completed">',
				'				<i class="icon-eraser"></i>',
				'			</button>',
				'			<button class="btn btn-default btn-sm"',
				'				ng-click="srv.toggle_select_all()"',
				'				title="Select All / None">',
				'				<i ng-hide="srv.selected_all" class="icon-check-empty icon-large icon-fixed-width"></i>',
				'				<i ng-show="srv.selected_all" class="icon-check icon-large icon-fixed-width"></i>',
				'			</button>',
				'			<button class="btn btn-default btn-sm"',
				'				ng-click="srv.pause_selected()"',
				'				title="Pause Selected">',
				'				<i class="icon-pause"></i>',
				'			</button>',
				'			<button class="btn btn-default btn-sm"',
				'				ng-click="srv.resume_selected()"',
				'				title="Resume Selected">',
				'				<i class="icon-play"></i>',
				'			</button>',
				'			<button class="btn btn-default btn-sm"',
				'				ng-click="srv.remove_selected()"',
				'				title="Remove Selected">',
				'				<i class="icon-remove"></i>',
				'			</button>',
				'		</div></div>',
				'		<div class="col-sm-8 text-center" style="font-size: 12px; line-height: 12px">',
				'			<div class="col-xs-4">',
				'				<div><b>Total</b></div>',
				'				<div>{{human_size(srv.root.total_size)}} {{srv.root.total_sons}} items</div>',
				'			</div>',
				'			<div class="col-xs-4">',
				'				<div><b>Complete</b></div>',
				'				<div>{{human_size(srv.root.total_upsize)}} {{srv.root.total_completed}} items</div>',
				'			</div>',
				'			<div class="col-xs-4">',
				'				<div><b>Speed</b></div>',
				'				<div>{{srv.speed.toFixed(1)}} KB/sec</div>',
				'			</div>',
				'		</div>',
				// '		<button ng-show="false" class="btn btn-default btn-sm"',
				// '			ng-click="srv.show_advanced = !srv.show_advanced"',
				// '			title="Advanced Stats">',
				// '			<i style="color: black" class="icon-bar-chart"></i>',
				// '		</button>',
				// '		<div ng-show="srv.show_advanced">',
				// '			<canvas width=50 height=20 id="upload_speed_gauge"></canvas>',
				// '			<p><b>Load queue</b> {{srv.jobq_load.length}}</p>',
				// '			<p><b>Small queue</b> {{srv.jobq_upload_small.length}}</p>',
				// '			<p><b>Medium queue</b> {{srv.jobq_upload_medium.length}}</p>',
				// '			<p><b>Large queue</b> {{srv.jobq_upload_large.length}}</p>',
				// '			<p><b>Loading</b> {{srv.list_loading.length}}</p>',
				// '			<p><b>Uploading</b> {{srv.list_uploading.length}}</p>',
				// '			<p><b>Retrying</b> {{srv.list_retrying.length}}</p>',
				// '		</div>',
				'	</div>',
				'	<div ng-include="\'nb-upload-node.html\'"',
				'		style="margin: 0; font-size: 16px; width: 100%;',
				'			height: auto; overflow: auto; border-top: 1px solid #ccc;"></div>',
				'</div>'
			].join('\n')
		};
	});

	function setup_upload_node_template($templateCache) {
		$templateCache.put('nb-upload-node.html', [
			'<div ng-repeat="(id,upload) in upload|upload_sons_filter">',
			'	<div class="row"',
			'		style="margin: 0; border-bottom: 1px solid #ccc; position: relative;',
			'			{{(upload.is_selected || srv.selected_all) && \'color: blue;\' || \'\'}} ',
			'			{{!upload.parent.level && \'padding-top: 20px; padding-bottom: 20px;\' || \'\'}}">',
			'		<div class="progress-bar progress-bar-{{upload.progress_class || \'success\'}}"',
			'			role="progressbar"',
			'			aria-valuemin="0" aria-valuemax="100"',
			'			style="position: absolute; top:0; left:0; width: {{upload.progress}}%;">',
			'		</div>',
			'		<div class="col-sm-6">',
			'			<span style="cursor: pointer" ng-click="srv.toggle_select(upload)">',
			'				<i ng-hide="upload.is_selected || srv.selected_all"',
			'					style="font-size: 13px" class="icon-check-empty icon-large icon-fixed-width"></i>',
			'				<i ng-show="upload.is_selected || srv.selected_all"',
			'					style="font-size: 13px" class="icon-check icon-large icon-fixed-width"></i>',
			'			</span>',
			'			<span style="padding-left: {{upload.parent.level*20}}px">',
			'				<span style="cursor: pointer; min-height: 15px"',
			'					ng-click="srv.toggle_expand(upload)"',
			'					class="icon-stack icon-fixed-width">',
			'					<span ng-show="upload.item.isDirectory && !upload.is_expanded">',
			'						<i class="icon-folder-close icon-stack-base icon-fixed-width"',
			'							style="font-size: 1em"></i>',
			'						<i class="icon-plus icon-light icon-fixed-width"',
			'							style="font-size: 0.5em"></i>',
			'					</span>',
			'					<i ng-show="upload.item.isDirectory && upload.is_expanded"',
			'						style="font-size: 1em" class="icon-folder-open icon-fixed-width"></i>',
			'					<i ng-show="!upload.item.isDirectory"',
			'						style="font-size: 1em" class="icon-file icon-fixed-width"></i>',
			'				</span>',
			'				{{upload.item.name}}',
			'			</span>',
			'		</div>',
			'		<div class="col-sm-6">',
			'			<div class="col-xs-4" >',
			'				<span ng-show="upload.item.isDirectory">',
			'					{{ upload.total_sons }} items',
			'				</span>',
			'			</div>',
			'			<div class="col-xs-4">',
			'				{{ human_size(upload.item.isDirectory && upload.total_size || upload.item.size) }} ',
			'			</div>',
			'			<div class="col-xs-4" title="{{upload.error_text}}">',
			'				{{srv.get_status(upload)}}',
			'			</div>',
			'		</div>',
			'	</div>',
			'	<div ng-include="\'nb-upload-node.html\'"',
			'		style="font-size: 13px"',
			'		nb-effect-toggle="upload.is_expanded"',
			'		nb-effect-options="{effect:\'blind\'}">',
			'	</div>',
			'</div>',
		].join('\n'));
	}



	function LinkedList(name) {
		name = name || '';
		this.next = '_lln_' + name;
		this.prev = '_llp_' + name;
		this.head = '_llh_' + name;
		this.length = 0;
		this[this.next] = this;
		this[this.prev] = this;
		this[this.head] = this;
	}
	LinkedList.prototype.get_next = function(item) {
		var next = item[this.next];
		return next === this ? null : next;
	};
	LinkedList.prototype.get_prev = function(item) {
		var prev = item[this.prev];
		return prev === this ? null : prev;
	};
	LinkedList.prototype.get_front = function() {
		return this.get_next(this);
	};
	LinkedList.prototype.get_back = function() {
		return this.get_prev(this);
	};
	LinkedList.prototype.is_empty = function() {
		return !this.get_front();
	};
	LinkedList.prototype.insert_after = function(item, new_item) {
		if (item[this.head] !== this) {
			return false;
		}
		var next = item[this.next];
		new_item[this.next] = next;
		new_item[this.prev] = item;
		next[this.prev] = new_item;
		item[this.next] = new_item;
		this.length++;
		return true;
	};
	LinkedList.prototype.insert_before = function(item, new_item) {
		if (item[this.head] !== this) {
			return false;
		}
		var prev = item[this.prev];
		new_item[this.next] = item;
		new_item[this.prev] = prev;
		new_item[this.head] = this;
		prev[this.next] = new_item;
		item[this.prev] = new_item;
		this.length++;
		return true;
	};
	LinkedList.prototype.remove = function(item) {
		if (item[this.head] !== this) {
			return false;
		}
		var next = item[this.next];
		var prev = item[this.prev];
		if (!next || !prev) {
			return false; // already removed
		}
		next[this.prev] = prev;
		prev[this.next] = next;
		item[this.next] = null;
		item[this.prev] = null;
		item[this.head] = null;
		this.length--;
		return true;
	};
	LinkedList.prototype.push_front = function(item) {
		return this.insert_after(this, item);
	};
	LinkedList.prototype.push_back = function(item) {
		return this.insert_before(this, item);
	};
	LinkedList.prototype.pop_front = function() {
		var item = this.get_front();
		if (item) {
			this.remove(item);
			return item;
		}
	};
	LinkedList.prototype.pop_back = function() {
		var item = this.get_back();
		if (item) {
			this.remove(item);
			return item;
		}
	};



	// 'concurrency' with positive integer will do auto process with given concurrency level.
	// use concurrency 0 for manual processing.
	// 'delay' is number of milli-seconds between auto processing.
	// name is optional in case multiple job queues (or linked lists) 
	// are used on the same elements.

	function JobQueue(concurrency, timeout, delay, name, method) {
		this.concurrency = concurrency || (concurrency === 0 ? 0 : 1);
		this.timeout = timeout || setTimeout;
		this.delay = delay || 0;
		this.method = method || 'run';
		this._queue = new LinkedList(name);
		this._num_running = 0;
		Object.defineProperty(this, 'length', {
			enumerable: true,
			get: function() {
				return this._queue.length;
			}
		});
	}

	// add the given function to the jobs queue
	// which will run it when time comes.
	// job have its method property (by default 'run').
	JobQueue.prototype.add = function(job) {
		this._queue.push_back(job);
		this.process(true);
	};

	JobQueue.prototype.remove = function(job) {
		return this._queue.remove(job);
	};

	JobQueue.prototype.process = function(check_concurrency) {
		var me = this;
		if (check_concurrency && me._num_running >= me.concurrency) {
			return;
		}
		if (me._queue.is_empty()) {
			return;
		}
		var job = me._queue.pop_front();
		me._num_running++;
		var end = function() {
			me._num_running--;
			me.process(true);
		};
		// submit the job to run in background 
		// to be able to return here immediately
		me.timeout(function() {
			try {
				var promise = job[me.method]();
				if (!promise || !promise.then) {
					end();
				} else {
					promise.then(end, end);
				}
			} catch (err) {
				console.error('UNCAUGHT EXCEPTION', err, err.stack);
				end();
			}
		}, me.delay);
	};

})();
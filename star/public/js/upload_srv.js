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
		this.jobq_upload_small = new JobQueue(8, $timeout);
		this.jobq_upload_medium = new JobQueue(4, $timeout);
		this.jobq_upload_large = new JobQueue(1, $timeout);
		this.medium_threshold = 1 * 1024 * 1024;
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

		// check for active uploads before page unloads
		var me = this;
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
		console.log('SUBMIT', item.name);
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
			target: _.clone(target),
			id: this.id_gen++,
			parent: parent,
		};
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
			return me._readdir(upload);
		}).then(function() {
			throw_if_stopped(upload);
			return me._add_to_upload_queue(upload);
		}).then(function() {
			console.log('LOAD DONE', upload.item.name);
			me.list_loading.remove(upload);
			upload.is_loading = false;
			if (!upload.is_loaded) {
				upload.is_loaded = true;
				if (upload.item.isDirectory) {
					// for dirs they completed their job so update parents
					for (var p = upload.parent; p; p = p.parent) {
						p.total_completed++;
					}
				} else {
					// for files update the parents bytes size
					for (var p = upload.parent; p; p = p.parent) {
						p.total_size += upload.item.size;
					}
				}
			}
		}).then(null, function(err) {
			console.error('LOAD ERROR', err, err.stack);
			me.list_loading.remove(upload);
			upload.progress_class = 'danger';
			var err_info = detect_error(err);
			upload.error_text = err_info.text;
			if (err_info.retry) {
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

		console.log('LOAD prepare file attr', item.path);

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

		console.log('LOAD prepare file entry', item.name);

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

		var inode_id = upload.target.inode_id;
		if (inode_id) {
			// inode_id supplied - getattr to verify it exists
			return me.$http({
				method: 'GET',
				url: '/star_api/inode/' + inode_id,
				params: {
					// tell the server to return attr 
					// and not readdir us as in normal read
					getattr: true
				}
			});
		}

		var dir_inode_id = upload.target.dir_inode_id;
		if (dir_inode_id) {
			// create the file and receive upload location info
			return me.$http({
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: dir_inode_id,
					name: upload.item.name,
					isdir: true
				}
			}).then(function(res) {
				// fill the target inode id for retries
				console.log('mkdir id', res.data.id);
				upload.target.inode_id = res.data.id;
			});
		}

		throw 'unknown target';
	};


	// for directories - readdir and submit sons
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
			dir_inode_id: upload.target.inode_id
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
			console.log('UPLOAD DONE', upload.item.name);
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
			console.error('UPLOAD ERROR', err, err.stack);
			me.list_uploading.remove(upload);
			me._close_file(upload);
			upload.is_uploading = false;
			upload.progress_class = 'danger';
			var err_info = detect_error(err);
			upload.error_text = err_info.text;
			if (err_info.retry) {
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

		if (upload.target.inode_id) {
			// inode_id supplied - getattr to verify it exists
			console.log('UPLOAD gettattr', upload);
			return me.$http({
				method: 'GET',
				url: '/star_api/inode/' + upload.target.inode_id,
				params: {
					// tell the server to return attr 
					// and not redirect us as in normal read
					getattr: true
				}
			});
		}

		if (upload.target.dir_inode_id) {
			// create the file and receive upload location info
			console.log('UPLOAD create', upload);
			return me.$http({
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.target.dir_inode_id,
					isdir: false,
					uploading: true,
					name: item.name,
					size: item.size,
					content_type: item.type,
					relative_path: item.webkitRelativePath
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
		upload.target.inode_id = res.data.id;
	};


	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('UPLOAD multipart', upload.item.name);
		// get missing parts
		return me.$http({
			method: 'POST',
			url: '/star_api/inode/' + upload.target.inode_id + '/multipart/'
		}).then(function(res) {
			throw_if_stopped(upload);
			upload.multipart = res.data;
			console.log('UPLOAD multipart state', upload.multipart);
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
		console.log('UPLOAD part', part, start, end);
		return me._item_slice(upload.item, start, end).then(function(data) {
			var defer = me.$q.defer();
			var xhr = upload.xhr = new XMLHttpRequest();
			xhr.onreadystatechange = me.$cb(function() {
				if (xhr.readyState !== 4) {
					return;
				}
				console.log('UPLOAD xhr', xhr);
				upload.xhr = null;
				if (xhr.status !== 200) {
					defer.reject(xhr);
				} else {
					defer.resolve();
				}
			});
			xhr.upload.onprogress = me.$cb(function(event) {
				update_upsize(upload, upload.multipart.upsize + event.loaded);
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


	function detect_error(err) {
		if (err === 'nb-upload-stop') {
			return {
				retry: false
			};
		}
		if (err.status === 0) { // no http response
			return {
				text: 'Disconnected, will retry',
				retry: true
			};
		}
		if (err.status === 404) { // http not found
			return {
				text: 'Not found',
				retry: false // TODO really stop retry?
			};
		}
		if (err.status === 500) { // http internal error
			return {
				text: 'Server error, will retry',
				retry: true
			};
		}
		if (err.status === 507) { // http insufficient storage
			return {
				text: 'Out of space',
				retry: false // TODO maybe retry with long delay?
			};
		}
		// TODO handle more errors
		console.error('~~~~~ UNDETECTED ERROR ~~~~~~', err, typeof err);
		return {
			text: err,
			retry: false
		};
	}

	UploadSrv.prototype.is_completed = function(upload) {
		if (upload.item.isDirectory) {
			return upload.total_completed === upload.total_sons;
		} else {
			return upload.is_uploaded;
		}
	};

	UploadSrv.prototype.get_status = function(upload) {
		// if (upload.is_pending_load) {
		// 	return 'Pending Load';
		// }
		// if (upload.is_pending_upload) {
		// 	return 'Pending Upload';
		// }
		if (upload.is_pending_retry) {
			return 'Retry';
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
			return upload.is_expanded ? upload.sons : null;
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
				'	style="margin: 0; width: 100%; height: 100%; overflow: hidden">',
				'	<div class="row" style="margin: 0; padding: 5px 10px 8px 10px;',
				'			text-align: left; vertical-align: middle; background-color: white">',
				'		<button class="btn btn-sm btn-success"',
				'			ng-click="srv.clear_completed()"',
				'			title="Clear Completed">',
				'			<i class="icon-eraser"></i>',
				'		</button>',
				'		<div class="btn-group">',
				'			<button class="btn btn-sm btn-default"',
				'				ng-click="srv.toggle_select_all()"',
				'				title="Select All / None">',
				'				<i ng-hide="srv.selected_all" class="icon-check-empty icon-large icon-fixed-width"></i>',
				'				<i ng-show="srv.selected_all" class="icon-check icon-large icon-fixed-width"></i>',
				'			</button>',
				'			<button class="btn btn-sm btn-default"',
				'				ng-click="srv.pause_selected()"',
				'				title="Pause Selected">',
				'				<i class="icon-pause"></i>',
				'			</button>',
				'			<button class="btn btn-sm btn-default"',
				'				ng-click="srv.resume_selected()"',
				'				title="Resume Selected">',
				'				<i class="icon-play"></i>',
				'			</button>',
				'			<button class="btn btn-sm btn-default"',
				'				ng-click="srv.remove_selected()"',
				'				title="Remove Selected">',
				'				<i class="icon-remove"></i>',
				'			</button>',
				'		</div>',
				'		<span>',
				'			<div class="progress" style="position: relative; margin: 3px 0 3px 0">',
				'				<div class="progress-bar progress-bar-success"',
				'					role="progressbar"',
				'					aria-valuemin="0" aria-valuemax="100"',
				'					style="position: absolute; top:0; left:0;',
				'						width: {{srv.root.progress}}%;">',
				'				</div>',
				'				<div style="position: absolute; top:0; left:0;',
				'						width:100%; text-align:center; color:black">',
				'					{{srv.root.progress && srv.root.progress.toFixed(1)+\'%\' || \'\'}}',
				'				</div>',
				'			</div>',
				'		</span>',
				'		<div>',
				'			load {{srv.list_loading.length}} /',
				'			upload {{srv.list_uploading.length}} /',
				'			retry {{srv.list_retrying.length}} /',
				'			load queue {{srv.jobq_load.length}} /',
				'			small queue {{srv.jobq_upload_small.length}} /',
				'			medium queue {{srv.jobq_upload_medium.length}} /',
				'			large queue {{srv.jobq_upload_large.length}}',
				'		</div>',
				'	</div>',
				'	<div class="row"',
				'		style="margin: 0; padding: 5px 0 5px 0; background-color: #e2e2e2;',
				'			border-top: 1px solid #333; border-bottom: 1px solid #333">',
				'		<div class="col-xs-6">Name</div>',
				'		<div class="col-xs-3">Size</div>',
				'		<div class="col-xs-3">Status</div>',
				'	</div>',
				'	<div ng-include="\'nb-upload-node.html\'"',
				'		style="margin: 0; font-size: 13px; width: 100%;',
				'			height: auto; overflow: auto"></div>',
				'</div>'
			].join('\n')
		};
	});

	function setup_upload_node_template($templateCache) {
		$templateCache.put('nb-upload-node.html', [
			'<div ng-repeat="(id,upload) in upload|upload_sons_filter">',
			'	<div class="row"',
			'		style="margin: 0; border-bottom: 1px solid #ddd; position: relative;',
			'			{{(upload.is_selected || srv.selected_all) && \'color: blue\' || \'\'}}">',
			'		<div class="progress-bar progress-bar-{{upload.progress_class || \'success\'}}"',
			'			role="progressbar"',
			'			aria-valuemin="0" aria-valuemax="100"',
			'			style="position: absolute; top:0; left:0;',
			'				width: {{upload.progress}}%;">',
			'		</div>',
			'		<div class="col-xs-6">',
			'			<span style="cursor: pointer" ng-click="srv.toggle_select(upload)">',
			'				<i ng-hide="upload.is_selected || srv.selected_all" class="icon-check-empty icon-large icon-fixed-width"></i>',
			'				<i ng-show="upload.is_selected || srv.selected_all" class="icon-check icon-large icon-fixed-width"></i>',
			'			</span>',
			'			<span style="padding-left: {{upload.parent.level*15}}px">',
			'				<span ng-click="srv.toggle_expand(upload)">',
			'					<span ng-show="upload.item.isDirectory && !upload.is_expanded"',
			'						class="icon-stack icon-fixed-width">',
			'						<i class="icon-folder-close icon-stack-base icon-fixed-width"',
			'							style="font-size: 12px"></i>',
			'						<i class="icon-plus icon-light icon-fixed-width"',
			'							style="font-size: 8px"></i>',
			'					</span>',
			'					<i ng-show="upload.item.isDirectory && upload.is_expanded"',
			'						style="font-size: 12px" class="icon-folder-open icon-fixed-width"></i>',
			'					<i ng-show="!upload.item.isDirectory"',
			'						style="font-size: 12px" class="icon-file icon-fixed-width"></i>',
			'				</span>',
			'				{{upload.item.name}}',
			'			</span>',
			'		</div>',
			'		<div class="col-xs-3">',
			'			<span ng-show="upload.item.isDirectory">',
			'				{{ human_size(upload.total_size || 0) }},',
			'				{{ upload.total_sons }} items',
			'			</span>',
			'			<span ng-hide="upload.item.isDirectory">',
			'				{{ human_size(upload.item.size) }}',
			'			</span>',
			'		</div>',
			'		<div class="col-xs-3" title="{{upload.error_text}}">',
			'			{{srv.get_status(upload)}}',
			'		</div>',
			'	</div>',
			'	<div ng-include="\'nb-upload-node.html\'"',
			'		nb-effect-toggle="upload.is_expanded"',
			'		nb-effect-options="{effect:\'fade\', duration:250}">',
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
/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbUploadSrv', [
		'$http', '$q', '$rootScope', '$timeout', '$templateCache',
		function($http, $q, $rootScope, $timeout, $templateCache) {
			setup_upload_node_template($templateCache);
			var u = new UploadSrv();
			u.$http = $http;
			u.$q = $q;
			u.$rootScope = $rootScope;
			u.$timeout = $timeout;
			return u;
		}
	]);

	function UploadSrv() {
		this.id_gen = 1;

		this.root = {
			sons: {},
			pending_list: [],
			num_sons: 0,
			num_remain: 0,
			level: 0,
			expanded: true,
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


	/////////////////////
	/////////////////////
	// EVENTS HANDLING //
	/////////////////////
	/////////////////////


	// use on jquery elements to setup an upload drop listener
	UploadSrv.prototype.init_drop = function(elements) {
		var me = this;
		var prevent_event = function(event) {
			event.preventDefault();
			// event.stopPropagation();
			return false;
		};
		elements.on('dragover', prevent_event);
		elements.on('dragend', prevent_event);
		elements.on('drop', function(event) {
			return me.submit_upload(event);
		});
	};

	// use on input jquery elements to setup an upload change listener
	UploadSrv.prototype.init_file_input = function(elements) {
		var me = this;
		elements.on('change', function(event) {
			me.submit_upload(event);
			this.value = ''; // reset the input to allow open same file next
		});
	}

	// submit the upload event and start processing
	UploadSrv.prototype.submit_upload = function(event) {
		event = event.originalEvent;
		var me = this;

		// try using dataTransfer object if available (drop event)
		// or target object for file input.
		var tx = event.dataTransfer || event.target;
		if (!tx) {
			console.log('THIS IS A FUNKY EVENT', event);
			return;
		}

		// use html5 api (supported only on webkit) to get as entry
		// which is better for big folders.
		// We want to get the entries of the file input instead of list of files
		// to avoid browser preloading all files on large dirs.
		// However although on_drop works correctly unfortunately file input 
		// with webkitdirectory is a bit broken (crbug.com/138987)
		// and webkit doesn't populate .webkitEntries at all.
		// So this path is here for when the bug is fixed.
		var entries = !! tx.webkitEntries && !! tx.webkitEntries.length && tx.webkitEntries;
		// convert items to entries 
		if (!entries && tx.items) {
			entries = new Array(tx.items.length);
			for (var i = 0; i < tx.items.length; i++) {
				var item = tx.items[i];
				if (item.getAsEntry) {
					entries[i] = item.getAsEntry();
				} else if (item.webkitGetAsEntry) {
					entries[i] = item.webkitGetAsEntry();
				}
			}
		}

		// we abstract the items to upload as either entries or files
		var items = entries || tx.files;
		if (!items) {
			console.log('NO ENTRIES OR FILES TO UPLOAD', event);
			return;
		}

		// get the target directory
		var dir_inode_id;
		if (me.get_dir_inode_id) {
			dir_inode_id = me.get_dir_inode_id(event);
			if (dir_inode_id === false) {
				return;
			}
		}

		// submit each of the items
		for (var i = 0; i < items.length; i++) {
			me.submit_item(event, dir_inode_id, me.root, items[i]);
		}
		me.run_pending();
		me.$rootScope.safe_apply();

		event.preventDefault();
		event.stopPropagation();
		return false;
	};



	//////////////
	//////////////
	// INTERNAL //
	//////////////
	//////////////

	// submit single item to upload
	// will create the upload object and insert into parent
	// and will start processing if no other is running, otherwise add to queue.
	UploadSrv.prototype.submit_item = function(event, dir_inode_id, parent, item) {
		var me = this;
		var upload;
		console.log('SUBMIT', item.name, item);

		// try to find the item name in parent
		// if found and type matches, it means we resume the parent
		// so just update the item.
		upload = parent.sons_by_name ? parent.sons_by_name[item.name] : null;
		if (upload) {
			console.log('EXISTING UPLOAD', upload, item)
			// TODO test this flow
			if ( !! item.isDirectory === !! upload.item.isDirectory) {
				// just update the item
				upload.item = item;
				me.set_pending(upload);
				return;
			} else {
				console.log('EXISTING UPLOAD MISMATCHED');
			}
		}

		// create new upload and add to parent
		upload = {
			event: event,
			item: item,
			dir_inode_id: dir_inode_id,
			id: me.id_gen++,
			parent: parent,
			level: parent.level + 1
		};
		parent.sons[upload.id] = upload;
		parent.num_sons++;
		parent.num_remain++;
		me.recalc_progress(parent);
		if (parent.sons_by_name) {
			parent.sons_by_name[item.name] = upload;
		}
		if (item.isDirectory) {
			upload.sons = {};
			upload.sons_by_name = {};
			upload.pending_list = [];
			upload.num_sons = 0;
			upload.num_remain = 0;
		}
		me.set_pending(upload);
	};

	UploadSrv.prototype.start_upload = function(upload) {
		var me = this;
		var item = upload.item;
		var promise;

		if (!me.set_active(upload)) {
			return;
		}

		if (item.isDirectory) {
			promise = me.upload_dir(upload);
		} else {
			promise = me.open_file(upload).then(function() {
				if (me.on_file_upload) {
					return me.on_file_upload(upload);
				} else {
					return me.upload_file(upload);
				}
			}).then(function() {
				// release the opened file memory (if it means anything)
				upload.file = null;
			});
		}

		return promise.then(function(res) {
			me.set_done(upload);
			return res;
		}, function(err) {
			if (err.status === 507) { // HTTP Insufficient Storage
				upload.fail_reason = 'Out of space';
			}
			me.set_fail(upload);
			throw err;
		});
	};

	UploadSrv.prototype.upload_dir = function(upload) {
		var me = this;
		var dir_request;
		console.log('MKDIR', upload.item.name, upload);

		if (upload.inode_id) {
			// inode_id supplied - getattr to verify it exists
			console.log('[ok] upload gettattr dir:', upload);
			dir_request = {
				method: 'GET',
				url: '/star_api/inode/' + upload.inode_id,
				params: {
					// tell the server to return attr 
					// and not readdir us as in normal read
					getattr: true
				}
			};
		} else {
			// create the file and receive upload location info
			console.log('[ok] upload creating dir:', upload);
			dir_request = {
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.dir_inode_id,
					name: upload.item.name,
					isdir: true
				}
			};
		}

		me.$rootScope.safe_apply();

		return me.$http(dir_request).then(function(res) {
			upload.inode_id = res.data.id;
			return me.readdir(upload);
		});
	};

	UploadSrv.prototype.readdir = function(upload) {
		var me = this;
		var deferred = me.$q.defer();
		console.log('READDIR', upload.item.name, upload);
		upload.dir_reader = upload.item.createReader();
		upload.readdir_func = function() {
			upload.dir_reader.readEntries(function(entries) {
				try {
					if (upload.is_aborted) {
						throw 'aborted';
					}
					for (var i = 0; i < entries.length; i++) {
						me.submit_item(upload.event, upload.inode_id, upload, entries[i]);
					}
					if (entries.length) {
						// while still more entries submit next readdir
						me.$timeout(upload.readdir_func, 10);
					} else {
						// done readdir
						upload.dir_reader = null;
						upload.readdir_func = null;
						me.$rootScope.safe_apply(function() {
							deferred.resolve();
						});
					}
				} catch (err) {
					me.$rootScope.safe_apply(function() {
						deferred.reject(err);
					});
				}
			}, function(err) {
				me.$rootScope.safe_apply(function() {
					deferred.reject(err);
				});
			});
		};
		upload.readdir_func();
		me.$rootScope.safe_apply();
		return deferred.promise;
	};


	// for entry open the file, otherwise assume item is already a file
	// returns promise that will be resolved with the file.
	UploadSrv.prototype.open_file = function(upload) {
		var me = this;
		var deferred = me.$q.defer();
		var handle_file = function(file) {
			upload.file = file;
			upload.file_size = file.size;
			me.$rootScope.safe_apply(function() {
				deferred.resolve();
			});
		};
		// isFile means this is an entry object of the file
		if (upload.item.isFile) {
			upload.item.file(handle_file, function(err) {
				me.$rootScope.safe_apply(function() {
					deferred.reject(err);
				});
			});
		} else {
			// item itself is assumed to already be a file object
			handle_file(upload.item);
		}
		return deferred.promise;
	};


	UploadSrv.prototype.upload_file = function(upload) {
		var me = this;
		var file = upload.file;
		var file_request;
		if (upload.inode_id) {
			// inode_id supplied - getattr to verify it exists
			console.log('[ok] upload gettattr file:', upload);
			file_request = {
				method: 'GET',
				url: '/star_api/inode/' + upload.inode_id,
				params: {
					// tell the server to return attr 
					// and not redirect us as in normal read
					getattr: true
				}
			};
		} else {
			// create the file and receive upload location info
			console.log('[ok] upload creating file:', upload);
			var relative_path = upload.item.isFile ? '' : file.webkitRelativePath;
			file_request = {
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.dir_inode_id,
					name: file.name,
					isdir: false,
					size: upload.file_size,
					uploading: true,
					content_type: file.type,
					relative_path: relative_path
				}
			};
		}
		return me.$http(file_request).then(function(res) {
			console.log('[ok] upload file', res);
			if (res.data.name !== file.name || res.data.size !== upload.file_size) {
				$.nbalert('Choose the same file to resume the upload');
				throw 'mismatching file attr';
			}
			if (upload.file_size === 0) {
				console.log('skip upload for zero size file', file);
				return;
			}
			if (!res.data.uploading) {
				console.log('file already uploaded', res.data, file);
				return;
			}
			if (upload.is_aborted) {
				throw 'aborted';
			}
			upload.inode_id = res.data.id;
			me.$rootScope.safe_apply();
			return me._upload_multipart(upload);
		});
	};

	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('[ok] upload multipart run', upload.file.name);
		// get missing parts
		return me.$http({
			method: 'POST',
			url: '/star_api/inode/' + upload.inode_id + '/multipart/'
		}).then(function(res) {
			upload.multipart = res.data;
			console.log('[ok] upload multipart state', upload.multipart);
			if (upload.is_aborted) {
				throw 'aborted';
			}
			if (upload.multipart.complete) {
				upload.progress = 100;
				return; // done
			}
			upload.progress = (upload.multipart.upsize * 100 / upload.file_size).toFixed(1);
			// send missing parts
			// TODO: maintain part_number_marker to ease on the server
			var missing_parts = upload.multipart.missing_parts;
			// init promise to send forst part in the batch
			var promise = me._send_part(upload, missing_parts[0]);
			// define part sender that takes part as argument (see why below)
			var sender = function(part) {
				console.log('PART SEND', part);
				// increasing upsize between parts in batch
				// once batch is over the multipart response will update again.
				upload.multipart.upsize += upload.multipart.part_size;
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
				console.log('PART PROMISE', i, part);
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
		var deferred = me.$q.defer();
		var part_size = upload.multipart.part_size;
		var upsize = upload.multipart.upsize;
		var start = (part.num - 1) * part_size;
		var stop = start + part_size;
		console.log('[ok] upload multipart send start', start, stop);
		var blob = upload.file.slice(start, stop);
		var xhr = upload.xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			me.$rootScope.safe_apply(function() {
				if (xhr.readyState !== 4) {
					return;
				}
				console.log('[ok] upload multipart xhr', xhr);
				upload.xhr = null;
				if (xhr.status !== 200) {
					deferred.reject('xhr failed status ' + xhr.status);
					return;
				}
				try {
					// var etag = xhr.getResponseHeader('ETag');
					deferred.resolve( /*etag*/ );
				} catch (err) {
					deferred.reject(err);
				}
			});
		};
		xhr.upload.onprogress = function(event) {
			upload.progress = ((upsize + event.loaded) * 100 / upload.file_size).toFixed(1);
			me.$rootScope.safe_apply();
		};
		xhr.open('PUT', part.url, true);
		// xhr.setRequestHeader('Access-Control-Expose-Headers', 'ETag');
		xhr.send(blob);
		return deferred.promise;
	};



	///////////////////
	///////////////////
	// STATE CHANGES //
	///////////////////
	///////////////////


	UploadSrv.prototype.set_pending = function(upload, front) {
		console.log('SET PENDING', upload.item.name, front, upload);
		if (upload.is_pending) {
			return;
		}
		upload.is_pending = true;
		if (front === 'front') {
			upload.parent.pending_list.unshift(upload);
		} else {
			upload.parent.pending_list.push(upload);
		}
	};

	UploadSrv.prototype.run_pending = function(upload) {
		if (!upload) {
			upload = this.root;
		} else if (!upload.item.isDirectory) {
			console.log('PENDING NOT DIR', upload);
			return false;
		}
		if (upload.active_son) {
			if (this.run_pending(upload.active_son)) {
				return true;
			}
		}
		// dequeue next upload and start it, skip removed items.
		var next;
		while (upload.pending_list.length && (!next || next.is_removed)) {
			next = upload.pending_list.shift();
		}
		if (!next || next.is_removed) {
			return false;
		}
		console.log('RUN PENDING', next.item.name, next);
		next.is_pending = false;
		this.start_upload(next);
		return true;
	};

	UploadSrv.prototype.set_active = function(upload) {
		if (upload.is_aborted) {
			return false;
		}
		if (upload.is_active) {
			return false;
		}
		if (upload.is_done) {
			return false;
		}
		if (upload.parent.active_son && upload.parent.active_son !== upload) {
			console.log('RETURN TO PENDING', upload, upload.parent.active_son);
			this.set_pending(upload, 'front');
			return false;
		}
		console.log('SET ACTIVE', upload.item.name, upload);
		upload.parent.active_son = upload;
		upload.is_active = true;
		upload.is_done = false;
		upload.progress_class = 'progress-bar progress-bar-success';
		this.$rootScope.safe_apply();
		return true;
	};

	UploadSrv.prototype.set_done = function(upload) {
		if (upload === this.root) {
			return;
		}
		if (upload.is_done) {
			return;
		}
		if (!upload.item.isDirectory || upload.num_remain === 0) {
			console.log('SET DONE', upload.item.name, upload);
			upload.parent.num_remain--;
			upload.parent.active_son = null;
			this.recalc_progress(upload.parent);
			upload.is_done = true;
			upload.is_active = false;
			this.set_done(upload.parent); // propagate
		}
		// start some other pending upload
		this.run_pending();
		this.$rootScope.safe_apply();
	};

	UploadSrv.prototype.set_fail = function(upload) {
		var me = this;
		console.error('SET FAIL', upload.item.name, upload);
		upload.parent.active_son = null;
		upload.is_active = false;
		upload.fail_count = 1 + (upload.fail_count ? upload.fail_count : 0);
		upload.progress_class = 'progress-bar progress-bar-danger';
		if (upload.is_aborted) {
			// start some other pending upload
			me.run_pending();
		} else {
			// retry if not aborted, but some delay to avoid pegging
			me.$timeout(function() {
				me.start_upload(upload);
			}, 3000);
		}
		me.$rootScope.safe_apply();
	};

	UploadSrv.prototype.set_abort = function(upload) {
		// for active uploads try to abort them and interrupt their xhr
		// but don't force remove, wait for them to join and remove the active flag
		console.log('SET ABORT', upload.item.name, upload);
		upload.is_aborted = true;
		if (upload.xhr) {
			console.log('SET ABORT XHR', upload.item.name, upload);
			upload.xhr.abort();
		}
		// recurse to sons
		if (upload.num_sons) {
			for (var id in upload.sons) {
				var son = upload.sons[id];
				this.set_abort(son);
			}
		}
		this.run_pending();
	};

	UploadSrv.prototype.resume_upload = function(upload) {
		// recurse to sons
		if (upload.num_sons) {
			for (var id in upload.sons) {
				var son = upload.sons[id];
				this.resume_upload(son);
			}
		}
		upload.is_aborted = false;
		if (upload.is_done) {
			// TODO: not sure that we really need to un-done like this... dont like it.
			upload.is_done = false;
			upload.parent.num_remain++;
			this.recalc_progress(upload.parent);
		}
		this.start_upload(upload);
		this.run_pending();
	};


	UploadSrv.prototype.remove_upload = function(upload) {
		if (upload.is_active) {
			this.set_abort(upload);
			return false;
		}
		this.set_abort(upload);

		if (upload.id in upload.parent.sons) {
			console.log('REMOVING', upload.item.name, upload);
			upload.parent.num_sons--;
			if (!upload.is_done) {
				upload.parent.num_remain--;
			}
			if (upload.parent.sons_by_name &&
				upload.parent.sons_by_name[upload.item.name] === upload) {
				delete upload.parent.sons_by_name[upload.item.name];
			}
			delete upload.parent.sons[upload.id];
			this.recalc_progress(upload.parent);
		}

		delete this.selection[upload.id];

		// not removing from parent.pending_list because it requires to search
		// instead mark as removed and run_pending() will discard.
		upload.is_removed = true;
		this.$rootScope.safe_apply();
		return true;
	};

	// TODO remove this func, unused?
	UploadSrv.prototype.cancel_upload = function(upload) {
		var do_remove = this.remove_upload.bind(this, upload);
		if (upload.is_done && !upload.is_active) {
			do_remove();
		} else {
			$.nbconfirm('This upload is still working.<br/>' +
				'Are you sure you want to cancel it?', {
					on_confirm: do_remove
				});
		}
	};

	UploadSrv.prototype.has_uploads = function() {
		return !!this.root.num_sons;
	};

	UploadSrv.prototype.has_unfinished_uploads = function() {
		return !!this.root.num_remain;
	};

	UploadSrv.prototype.recalc_progress = function(upload) {
		if (upload.num_sons === 0) {
			upload.progress = 100;
		} else {
			upload.progress = (100 * (upload.num_sons - upload.num_remain) / upload.num_sons).toFixed(1);
		}
	};

	UploadSrv.prototype.get_status = function(upload) {
		var status;
		var add_attempt = false;
		var add_fail = false;
		if (upload.is_aborted) {
			status = 'Aborted!';
		} else if (upload.is_done) {
			status = 'Done';
		} else if (upload.is_active) {
			status = '...';
			add_fail = true;
			add_attempt = true;
		} else if (upload.is_pending) {
			status = '';
			add_fail = true;
		} else {
			status = '';
			add_fail = true;
		}
		if (add_fail && upload.fail_reason) {
			status += ' ' + upload.fail_reason;
		}
		if (add_attempt && upload.fail_count) {
			status += ' (retrying)';
		}
		return status;
	};

	UploadSrv.prototype.clear_completed = function(upload) {
		if (!upload) {
			upload = this.root;
		}
		for (var id in upload.sons) {
			var son = upload.sons[id];
			this.clear_completed(son);
			if (son.is_done && !son.is_active) {
				this.remove_upload(son);
			}
		}
		this.run_pending();
	};

	UploadSrv.prototype.toggle_select_all = function() {
		// toggle the global flag
		if (!this.selected_all && _.isEmpty(this.selection)) {
			this.selected_all = true;
		} else {
			this.selected_all = false;
		}
		// in any case remove the selection from each of the uploads
		for (var id in this.selection) {
			var upload = this.selection[id];
			upload.selected = false;
		}
		this.selection = [];
	};

	UploadSrv.prototype.toggle_select = function(upload) {
		// reset the global flag
		this.selected_all = undefined;
		// toggle current state
		if (upload.selected) {
			upload.selected = false;
			delete this.selection[upload.id];
		} else {
			upload.selected = true;
			this.selection[upload.id] = upload;
			// when selecting, deselect all parents (only immediate parent is really expected)
			for (var p = upload.parent; p; p = p.parent) {
				p.selected = false;
				delete this.selection[p.id];
			}
		}
	};

	UploadSrv.prototype.foreach_selected = function(func) {
		var iter = function(upload) {
			for (var id in upload.sons) {
				var son = upload.sons[id];
				// iter(son);
				func(son);
			}
		};
		if (this.selected_all) {
			iter(this.root);
		} else {
			for (var id in this.selection) {
				var upload = this.selection[id];
				// iter(upload);
				func(upload);
			}
		}
	};

	UploadSrv.prototype.cancel_selected = function() {
		this.foreach_selected(this.remove_upload.bind(this));
		this.run_pending();
	};

	UploadSrv.prototype.resume_selected = function() {
		this.foreach_selected(this.resume_upload.bind(this));
		this.run_pending();
	};


	noobaa_app.filter('upload_sons_sort', function() {
		return function(upload) {
			if (!upload.expanded) {
				return null;
			}
			return upload.sons;
			// TODO: too much cpu....
			console.log('SORTING', upload.num_sons);
			if (!upload.num_sons) {
				return null;
			}
			var arr = _.values(upload.sons);
			return _.sortBy(arr, function(son) {
				if (son.is_active) {
					return 1;
				}
				if (son.is_done) {
					return 2;
				}
				return 3;
			});
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
				'	<div class="row" style="margin: 0; padding: 5px 0 8px 0;',
				'			text-align: center; vertical-align: middle; background-color: white">',
				'		<button class="btn btn-xs btn-success"',
				'			ng-click="srv.clear_completed()">',
				'			Clear Completed',
				'			<i class="icon-eraser"></i>',
				'		</button>',
				'		<button class="btn btn-xs btn-default"',
				'			ng-click="srv.cancel_selected()">',
				'			Cancel Selected',
				'			<i class="icon-remove"></i>',
				'		</button>',
				'		<button class="btn btn-xs btn-default"',
				'			ng-click="srv.resume_selected()">',
				'			Resume Selected',
				'			<i class="icon-repeat"></i>',
				'		</button>',
				'	</div>',
				'	<div class="row"',
				'		style="margin: 0; padding: 5px 0 5px 0; background-color: #e2e2e2;',
				' 			border-top: 1px solid #333; border-bottom: 1px solid #333">',
				'		<div class="col-xs-6">',
				'			<span style="cursor: pointer" ng-click="srv.toggle_select_all()">',
				'				<i ng-hide="srv.selected_all" class="icon-check-empty icon-fixed-width"></i>',
				'				<i ng-show="srv.selected_all" class="icon-check icon-fixed-width"></i>',
				'			</span>&nbsp;',
				'			Name</div>',
				'		<div class="col-xs-2">Size</div>',
				'		<div class="col-xs-2">Status</div>',
				'		<div class="col-xs-2">Progress</div>',
				'	</div>',
				'	<div ng-include="\'nb-upload-node.html\'"',
				'		style="margin: 0; font-size: 12px; width: 100%;',
				'			height: auto; overflow: auto"></div>',
				'</div>'
			].join('\n')
		};
	});

	function setup_upload_node_template($templateCache) {
		$templateCache.put('nb-upload-node.html', [
			'<div ng-repeat="(id,upload) in upload|upload_sons_sort">',
			'	<div class="row" ',
			'		style="margin: 0; border-bottom: 1px solid #ddd;',
			'			{{(upload.selected || srv.selected_all) && \'font-weight: bold; color: blue\' || \'\'}}">',
			'		<div class="col-xs-6">',
			'			<span style="cursor: pointer" ng-click="srv.toggle_select(upload)">',
			'				<i ng-hide="upload.selected || srv.selected_all" class="icon-check-empty icon-large icon-fixed-width"></i>',
			'				<i ng-show="upload.selected || srv.selected_all" class="icon-check icon-large icon-fixed-width"></i>',
			'			</span>',
			'			<span style="padding-left: {{upload.level*15}}px">',
			'				<span ng-click="upload.expanded = !upload.expanded"',
			'					style="cursor: pointer; {{!upload.num_sons && \'visibility: hidden\' || \'\'}}">',
			'					<span ng-show="!upload.expanded" class="icon-stack icon-fixed-width">',
			'						<i class="icon-folder-close icon-stack-base icon-fixed-width"',
			'							style="font-size: 12px"></i>',
			'						<i class="icon-plus icon-light icon-fixed-width"',
			'							style="font-size: 8px"></i>',
			'					</span>',
			'					<i ng-show="upload.expanded" style="font-size: 12px"',
			'						class="icon-folder-open icon-fixed-width"></i>',
			'				</span>',
			'				{{upload.item.name}}',
			'			</span>',
			'		</div>',
			'		<div class="col-xs-2">',
			'			{{human_size(upload.file_size)}}',
			'		</div>',
			'		<div class="col-xs-2">',
			'			{{srv.get_status(upload)}}',
			'		</div>',
			'		<div class="col-xs-2">',
			'			<div class="progress" style="position: relative; margin: 3px 0 3px 0">',
			'				<div ng-class="upload.progress_class"',
			'					role="progressbar"',
			'					aria-valuemin="0" aria-valuemax="100"',
			'					style="position: absolute; top:0; left:0;',
			'						width: {{upload.progress}}%;">',
			'				</div>',
			'				<div style="position: absolute; top:0; left:0;',
			'						width:100%; text-align:center; color:black">',
			'					{{upload.progress && upload.progress+\'%\' || \'\'}}',
			'				</div>',
			'			</div>',
			'		</div>',
			'	</div>',
			'	<div ng-include="\'nb-upload-node.html\'"',
			'		nb-effect-toggle="upload.expanded"',
			'		nb-effect-options="{effect:\'fade\', duration:250}">',
			'	</div>',
			'</div>',
		].join('\n'));
	}


	function unused_code() {

		// linked list with option to get array
		// its unused for now but might be

		function LinkedList(id) {
			this.next = '__next__' + id;
			this.prev = '__prev__' + id;
			this.index = '__index__' + id;
			this[this.next] = this;
			this[this.prev] = this;
			this[this.index] = -1;
		}

		LinkedList.prototype.get_next = function(item) {
			var next = item[this.next];
			return next === this ? null : next;
		};

		LinkedList.prototype.get_prev = function(item) {
			var prev = item[this.prev];
			return prev === this ? null : prev;
		};

		LinkedList.prototype.get_first = function() {
			return this.get_next(this);
		};

		LinkedList.prototype.get_last = function() {
			return this.get_prev(this);
		};

		LinkedList.prototype.is_empty = function() {
			return !this.get_first();
		};

		LinkedList.prototype.insert_after = LinkedList.prototype.push = function(item, new_item) {
			var next = item[this.next];
			new_item[this.next] = next;
			new_item[this.prev] = item;
			next[this.prev] = new_item;
			item[this.next] = new_item;
			if (this.arr) {
				var index = item[this.index] + 1;
				this.arr.splice(index, 0, new_item);
				new_item[this.index] = index;
			}
		};

		LinkedList.prototype.insert_before = function(item, new_item) {
			var prev = item[this.prev];
			new_item[this.next] = item;
			new_item[this.prev] = prev;
			prev[this.next] = new_item;
			item[this.prev] = new_item;
			if (this.arr) {
				var index = prev[this.index] + 1;
				this.arr.splice(index, 0, new_item);
				new_item[this.index] = index;
			}
		};

		LinkedList.prototype.remove = function(item) {
			var next = item[this.next];
			var prev = item[this.prev];
			var index = item[this.index];
			if (!next || !prev) {
				return false; // already removed
			}
			next[this.prev] = prev;
			prev[this.next] = next;
			delete item[this.next];
			delete item[this.prev];
			delete item[this.index];
			if (this.arr) {
				this.arr.splice(index, 1);
			}
			return true;
		};

		LinkedList.prototype.get_array = function() {
			if (this.arr) {
				return this.arr;
			}
			this.arr = [];
			var p = this.get_first();
			var i = 0;
			while (p) {
				this.arr[i] = p;
				p[this.index] = i;
				p = this.get_next(p);
				i++;
			}
			return this.arr;
		};

		LinkedList.prototype.drop_array = function() {
			delete this.arr;
		};



		function JobQueue(concurrency) {
			this.concurrency = concurrency;
			this._queue = [];
			this._num_running = 0;
		}

		// submit the given function to the jobs queue
		// which will run it when time comes.
		// job should be an object with job.run() function.
		JobQueue.prototype.submit = function(job) {
			this._queue.push(job);
			this.process(true);
		};

		JobQueue.prototype.process = function(check_concurrency) {
			if (check_concurrency && this._num_running >= this.concurrency) {
				return;
			}
			if (!this._queue.length) {
				return;
			}
			var me = this;
			var job = this._queue.shift();
			this._num_running++;
			// submit the job to run in background 
			// to be able to return here immediately
			setTimeout(function() {
				job.run();
				this._num_running--;
				me.process(true);
			}, 0);
		};
	}

})();
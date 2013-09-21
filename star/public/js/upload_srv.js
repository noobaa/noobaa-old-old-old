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
		this.root = {
			sons: {},
			pending_list: [],
			num_sons: 0,
			num_remain: 0,
			id_gen: 1,
		};

		// check for active uploads before page unloads
		var me = this;
		$(window).on('beforeunload', function() {
			if (me.has_unfinished_uploads()) {
				return 'Leaving this page will interrupt your active Uploads !!!';
			}
		});
	}

	// use on jquery elements to setup an upload drop listener
	UploadSrv.prototype.init_drop = function(elements) {
		var me = this;
		var prevent_event = function(event) {
			event.preventDefault();
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
		me.$rootScope.safe_apply();
		event.preventDefault();
		return false;
	};

	// submit single item to upload
	// will create the upload object and insert into parent
	// and will start processing if no other is running, otherwise add to queue.
	UploadSrv.prototype.submit_item = function(event, dir_inode_id, parent, item) {
		var me = this;
		var upload;
		console.log('ITEM', item);

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
			id: parent.id_gen++,
			parent: parent,
		};
		parent.sons[upload.id] = upload;
		parent.num_sons++;
		parent.num_remain++;
		if (parent.sons_by_name) {
			parent.sons_by_name[item.name] = upload;
		}
		if (item.isDirectory) {
			upload.sons = {};
			upload.sons_by_name = {};
			upload.pending_list = [];
			upload.num_sons = 0;
			upload.num_remain = 0;
			upload.id_gen = 1;
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
				console.log('FILE', upload.file);
				if (me.on_file_upload) {
					return me.on_file_upload(upload);
				} else {
					return me.upload_file(upload);
				}
			});
		}

		return promise.then(function(res) {
			me.set_done(upload);
			return res;
		}, function(err) {
			me.set_fail(upload);
			throw err;
		});
	};

	UploadSrv.prototype.upload_dir = function(upload) {
		var me = this;
		var dir_request;
		console.log('MKDIR');

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

		upload.status = 'mkdir';
		me.$rootScope.safe_apply();

		return me.$http(dir_request).then(function(res) {
			upload.inode_id = res.data.id;
			return me.readdir(upload);
		});
	};

	UploadSrv.prototype.readdir = function(upload) {
		var me = this;
		var deferred = me.$q.defer();
		console.log('READDIR');
		upload.dir_reader = upload.item.createReader();
		upload.readdir_func = function() {
			upload.dir_reader.readEntries(function(entries) {
				try {
					if (upload.aborted) {
						throw 'aborted';
					}
					for (var i = 0; i < entries.length; i++) {
						console.log('SUBMIT ENTRY', entries[i]);
						me.submit_item(upload.event, upload.inode_id, upload, entries[i]);
					}
					if (entries.length) {
						// while still more entries submit next readdir
						setTimeout(upload.readdir_func, 10);
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
		upload.status = 'readdir';
		me.$rootScope.safe_apply();
		return deferred.promise;
	};


	// for entry open the file, otherwise assume item is already a file
	// returns promise that will be resolved with the file.
	UploadSrv.prototype.open_file = function(upload) {
		var me = this;
		var deferred = me.$q.defer();
		if (upload.item.isFile) { // means this is an entry object of the file
			upload.item.file(function(file) {
				upload.file = file;
				me.$rootScope.safe_apply(function() {
					deferred.resolve();
				});
			}, function(err) {
				me.$rootScope.safe_apply(function() {
					deferred.reject(err);
				});
			});
		} else {
			upload.file = upload.item;
			me.$rootScope.safe_apply(function() {
				deferred.resolve();
			});
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
					size: file.size,
					uploading: true,
					content_type: file.type,
					relative_path: relative_path
				}
			};
		}

		upload.status = 'create';
		me.$rootScope.safe_apply();

		return me.$http(file_request).then(function(res) {
			console.log('[ok] upload file', res);
			if (res.data.name !== file.name || res.data.size !== file.size) {
				$.nbalert('Choose the same file to resume the upload');
				throw 'mismatching file attr';
			}
			if (file.size === 0) {
				console.log('skip upload for zero size file', file);
				return;
			}
			if (upload.aborted) {
				throw 'aborted';
			}
			upload.inode_id = res.data.id;
			upload.status = 'upload';
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
			if (upload.aborted) {
				throw 'aborted';
			}
			if (upload.multipart.complete) {
				return; // done
			}
			// send one part
			// TODO: maybe send all the missing at once?
			var part = upload.multipart.missing_parts[0];
			return me._send_part(upload, part).then(function() {
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
				console.log('[ok] upload multipart xhr', xhr);
				if (xhr.readyState !== 4) {
					return;
				}
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
			upload.progress = ((upsize + event.loaded) * 100 / upload.file.size).toFixed(1);
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
		if (upload.is_pending) {
			return;
		}
		upload.is_pending = true;
		if (front === 'front') {
			upload.parent.pending_list.unshift(upload);
		} else {
			upload.parent.pending_list.push(upload);
		}
		// see if anyone is ready
		this.run_pending();
	};

	UploadSrv.prototype.run_pending = function(upload) {
		if (!upload) {
			upload = this.root;
		} else if (!upload.item.isDirectory) {
			return false;
		}
		if (upload.active_son) {
			if (this.run_pending(upload.active_son)) {
				return true;
			}
		}
		// dequeue next upload and start it, skip removed items.
		var next;
		while (upload.pending_list.length && (!next || next.removed)) {
			next = upload.pending_list.shift();
		}
		if (!next || next.removed) {
			return false;
		}
		console.log('PENDING', next);
		next.is_pending = false;
		this.start_upload(next);
		return true;
	};

	UploadSrv.prototype.set_active = function(upload) {
		if (upload.active) {
			return false;
		}
		upload.parent.active_son = upload;
		upload.active = true;
		upload.aborted = false;
		upload.failed = false;
		upload.status = 'start';
		upload.row_class = '';
		upload.progress_class = 'progress-bar progress-bar-success';
		this.$rootScope.safe_apply();
		return true;
	};

	UploadSrv.prototype.set_done = function(upload) {
		if (upload === this.root) {
			return;
		}
		if (upload.done) {
			return;
		}
		console.log('DONE', upload);
		if (!upload.item.isDirectory || upload.num_remain === 0) {
			upload.parent.num_remain--;
			upload.parent.active_son = null;
			upload.done = true;
			upload.active = false;
			upload.status = 'done';
			upload.row_class = 'success';
			this.set_done(upload.parent); // propagate
		}
		// start some other pending upload
		this.run_pending();
		this.$rootScope.safe_apply();
	};

	UploadSrv.prototype.set_fail = function(upload) {
		console.log('FAIL', upload);
		upload.parent.active_son = null;
		upload.active = false;
		upload.failed = true;
		upload.fail_count = 1 + (upload.fail_count ? upload.fail_count : 0);
		upload.status = 'fail';
		upload.row_class = 'danger';
		upload.progress_class = 'progress-bar progress-bar-danger';
		if (upload.aborted) {
			// start some other pending upload
			this.run_pending();
		} else {
			// retry if not aborted
			this.start_upload(upload);
		}
		this.$rootScope.safe_apply();
	};

	UploadSrv.prototype.set_abort = function(upload) {
		if (!upload.active) {
			return true;
		}
		// for active uploads try to abort them and interrupt their xhr
		// but don't force remove, wait for them to join and remove the active flag
		upload.aborted = true;
		if (upload.xhr) {
			upload.xhr.abort();
		}
		this.$rootScope.safe_apply();
		return false;
	};


	UploadSrv.prototype.remove_upload = function(upload) {
		if (!this.set_abort(upload)) {
			return;
		}

		if (upload.id in upload.parent.sons) {
			upload.parent.num_sons--;
			if (!upload.done) {
				upload.parent.num_remain--;
			}
			if (upload.parent.sons_by_name &&
				upload.parent.sons_by_name[upload.item.name] === upload) {
				delete upload.parent.sons_by_name[upload.item.name];
			}
			delete upload.parent.sons[upload.id];
		}
		// not removing from parent.pending_list because it requires to search
		// instead mark as removed and run_pending() will discard.
		upload.removed = true;
		this.$rootScope.safe_apply();
	};

	UploadSrv.prototype.cancel_upload = function(upload) {
		var do_remove = this.remove_upload.bind(this, upload);
		if (!upload.active) {
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
				'<table id="upload_table"',
				'	class="table ng-cloak"',
				'	style="margin: 0">',
				'	<thead ng-show="!upload.id">',
				'		<th>Name</th>',
				'		<th>Folder</th>',
				'		<th>Size</th>',
				'		<th>Status</th>',
				'		<th>Progress</th>',
				'	</thead>',
				'	<tbody ng-include="\'nb-upload-node.html\'"></tbody>',
				'</table>'
			].join('\n')
		};
	});

	function setup_upload_node_template($templateCache) {
		$templateCache.put('nb-upload-node.html', [
			'	<tr ng-repeat-start="(id,upload) in upload.sons" ng-class="upload.row_class">',
			'		<td>',
			'			{{upload.item.name}}',
			'		</td>',
			'		<td>',
			'			{{upload.parent.name + upload.file.relative_path}}',
			'		</td>',
			'		<td>',
			'			{{human_size(upload.file.size)}}',
			'		</td>',
			'		<td>',
			'			{{upload.status}}',
			'		</td>',
			'		<td width="100px">',
			'			<div ng-show="upload.num_sons" class="progress" style="position: relative">',
			'				{{upload.num_remain}} Remain',
			'			</div>',
			'			<div ng-show="!upload.num_sons" class="progress" style="position: relative">',
			'				<div ng-class="upload.progress_class"',
			'					role="progressbar"',
			'					aria-valuemin="0" aria-valuemax="100"',
			'					style="position: absolute; top:0; left:0;',
			'						width: {{upload.progress}}%;">',
			'				</div>',
			'				<div style="position: absolute; top:0; left:0;',
			'						width:100%; text-align:center; color:black">',
			'					{{upload.progress}}%',
			'				</div>',
			'			</div>',
			'		</td>',
			'		<td>',
			'			<button class="btn btn-default btn-xs"',
			'				ng-click="srv.cancel_upload(upload)">',
			'				<i class="icon-remove"></i>',
			'			</button>',
			'			<button class="btn btn-default btn-xs"',
			'				ng-disabled="!upload.failed"',
			'				ng-click="srv.start_upload(upload)">',
			'				<i class="icon-repeat"></i>',
			'			</button>',
			'		</td>',
			'	</tr>',
			'	<tr ng-repeat-end>',
			'		<div>{{upload.name}}</div>',
			'		<div ng-include="\'nb-upload-node.html\'"></div>',
			'	</tr>',
		].join('\n'));
	}


	// linked list with option to get array

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


})();
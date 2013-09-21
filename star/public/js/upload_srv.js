/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbUploadSrv', [
		'$http', '$q', '$rootScope', '$timeout',
		function($http, $q, $rootScope, $timeout) {
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
		this.num_uploads = 0;
		this.num_active_uploads = 0;
		this.uploads_map = {};
		this.list = new LinkedList('list');
		this.pending = new LinkedList('pend');

		// check for active uploads before page unloads
		var me = this;
		$(window).on('beforeunload', function() {
			if (me.num_active_uploads) {
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

		// get the target directory (or a promise to get it)
		var parent_inode_id;
		if (me.get_parent_inode_id) {
			parent_inode_id = me.get_parent_inode_id(event);
			if (parent_inode_id === false) {
				return;
			}
		}

		// submit each of the items
		for (var i = 0; i < items.length; i++) {
			me.submit_item(event, parent_inode_id, null, items[i]);
		}
		me.$rootScope.safe_apply();
		event.preventDefault();
		return false;
	};

	// submit single item to upload
	// will create the upload object and insert into parent
	// and will start processing if no other is running, otherwise add to queue.
	UploadSrv.prototype.submit_item = function(event, parent_inode_id, parent_upload, item) {
		var me = this;
		var upload;
		console.log('ITEM', item);

		upload = parent_upload ? parent_upload.sons[item.name] : null;
		if (upload) {
			console.log('EXISTING UPLOAD', upload, item)
			if ( !! item.isDirectory === !! upload.item.isDirectory) {
				// just update the item
				upload.item = item;
				return;
			} else {
				console.log('EXISTING UPLOAD MISMATCHED');
			}
		}
		upload = {
			event: event,
			id: me.id_gen++,
			parent_inode_id: parent_inode_id,
			parent_upload: parent_upload,
			item: item,
		};
		if (item.isDirectory) {
			upload.sons = {};
		}
		if (parent_upload) {
			parent_upload.sons[item.name] = upload;
		}
		me.uploads_map[upload.id] = upload;
		if (parent_upload) {
			this.list.insert_after(parent_upload, upload);
		} else {
			this.list.insert_before(this.list, upload);
		}
		me.num_uploads++;
		me.enqueue_pending(upload);
	};

	UploadSrv.prototype.start_upload = function(upload) {
		var me = this;
		var item = upload.item;
		var promise;

		upload.aborted = false;
		upload.failed = false;
		upload.active = true;
		upload.status = 'start';
		upload.row_class = '';
		upload.progress_class = 'progress-bar progress-bar-success';
		me.num_active_uploads++;
		me.$rootScope.safe_apply();

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

		return promise.then(function() {
			console.log('DONE');
			me.num_active_uploads--;
			upload.active = false;
			upload.status = 'done';
			upload.row_class = 'success';
			me.dequeue_pending();
			me.$rootScope.safe_apply();
		}, function(err) {
			console.log('FAIL', err);
			me.num_active_uploads--;
			upload.active = false;
			upload.failed = true;
			upload.fail_count = 1 + (upload.fail_count ? upload.fail_count : 0);
			upload.status = 'fail';
			upload.row_class = 'danger';
			upload.progress_class = 'progress-bar progress-bar-danger';
			// when aborted dequeue another upload, otherwise retry
			if (upload.aborted) {
				me.dequeue_pending();
			} else {
				me.enqueue_pending(upload, 'front');
			}
			me.$rootScope.safe_apply();
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
					id: upload.parent_inode_id,
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
				var check_aborted = function() {
					if (upload.aborted) {
						me.$rootScope.safe_apply(function() {
							deferred.reject('readdir aborted');
						});
						return true;
					}
				};
				if (check_aborted()) {
					return;
				}
				if (entries.length) {
					for (var i = 0; i < entries.length; i++) {
						console.log('SUBMIT ENTRY', entries[i]);
						me.submit_item(upload.event, upload.inode_id, upload, entries[i]);
						if (check_aborted()) {
							return;
						}
					}
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
					id: upload.parent_inode_id,
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
			upload.inode_id = res.data.id;
			upload.status = 'upload';
			me.$rootScope.safe_apply();
			return me._upload_multipart(upload);
		});
	};

	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('[ok] upload multipart run', upload.file.name);
		if (upload.aborted) {
			throw 'aborted';
		}
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


	UploadSrv.prototype.enqueue_pending = function(upload, front) {
		// if no other active, start it
		if (!this.num_active_uploads) {
			console.log('ENQUEUE start', upload);
			this.start_upload(upload);
			return;
		}
		if (front === 'front') {
			console.log('ENQUEUE front', upload);
			this.pending.insert_after(this.pending, upload);
			return;
		}
		console.log('ENQUEUE', upload);
		this.pending.insert_before(this.pending, upload);
	};

	UploadSrv.prototype.dequeue_pending = function() {
		if (this.pending.is_empty()) {
			return;
		}
		// dequeue next upload and start it
		var upload = this.pending.get_first();
		this.pending.remove(upload);
		console.log('DEQUEUE', upload);
		this.start_upload(upload);
	};

	UploadSrv.prototype.remove_upload = function(upload) {
		if (upload.active) {
			upload.aborted = true;
			if (upload.xhr) {
				upload.xhr.abort();
			}
		} else {
			this.pending.remove(upload);
			// remove from parent
			if (upload.parent_upload) {
				delete upload.parent_upload.sons[upload.item.name];
			}
			// remove from global
			if (upload.id in this.uploads_map) {
				delete this.uploads_map[upload.id];
				this.num_uploads--;
			}
			this.list.remove(upload);
		}
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
		return !!this.num_uploads;
	};

	UploadSrv.prototype.has_active_uploads = function() {
		return !!this.num_active_uploads;
	};


	noobaa_app.directive('nbUploadTable', function() {
		return {
			controller: ['$scope', 'nbUploadSrv',
				function($scope, nbUploadSrv) {
					$scope.srv = nbUploadSrv;
				}
			],
			restrict: 'E',
			replace: true,
			template: [
				'<table id="upload_table"',
				'	class="table ng-cloak"',
				'	style="margin: 0">',
				'	<thead>',
				'		<tr>',
				'			<th>Name</th>',
				'			<th>Folder</th>',
				'			<th>Size</th>',
				'			<th>Status</th>',
				'			<th>Progress</th>',
				'		</tr>',
				'	</thead>',
				'	<tr ng-repeat="(idx,upload) in srv.uploads_map" ng-class="upload.row_class">',
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
				'			<div class="progress" style="position: relative">',
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
				'</table>'
			].join('\n')
		};
	});

	// simple linked list

	function LinkedList(id) {
		this.next = '__next__' + id;
		this.prev = '__prev__' + id;
		this[this.next] = this;
		this[this.prev] = this;

		// disguise as array
		this.length = 0;
		this.iter_index = -1;
		this.iter = this;
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
		this._inc_len();
	};

	LinkedList.prototype.insert_before = function(item, new_item) {
		var prev = item[this.prev];
		new_item[this.next] = item;
		new_item[this.prev] = prev;
		prev[this.next] = new_item;
		item[this.prev] = new_item;
		this._inc_len();
	};

	LinkedList.prototype.remove = function(item) {
		if (!item[this.next] || !item[this.prev]) {
			return false;
		}
		item[this.next][this.prev] = item[this.prev];
		item[this.prev][this.next] = item[this.next];
		delete item[this.next];
		delete item[this.prev];
		this.length--;
		this._reset_iter();
		return true;
	};

	LinkedList.prototype._inc_len = function() {
		var me = this;
		var n = me.length;
		me.length++;
		me._reset_iter();
		delete me[n];
		Object.defineProperty(me, n, {
			enumerable: true,
			configurable: true,
			get: function() {
				if (me.iter_index === n) {
					return me.iter;
				}
				if (me.iter_index > n) {
					me._reset_iter();
				}
				me.iter_index++;
				me.iter = me.iter[me.next];
				while (me.iter_index < n && me.iter !== me) {
					me.iter_index++;
					me.iter = me.iter[me.next];
				}
				if (me.iter === me) {
					me._reset_iter();
					return undefined;
				}
				console.log('ITER', n, me.length, me.iter_index, me.iter);
				return me.iter;
			}
		});
	};

	LinkedList.prototype._reset_iter = function() {
		this.iter_index = -1;
		this.iter = this;
	};

})();
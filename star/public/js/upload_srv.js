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
		this.root_upload = {
			uploads: {}
		};
		this.queue = [];

		// check for active uploads before page unloads
		var me = this;
		$(window).on('beforeunload', function() {
			if (me.num_active_uploads) {
				return 'Leaving this page will interrupt your active Uploads !!!';
			}
		});
	}

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

	UploadSrv.prototype.init_file_input = function(elements) {
		var me = this;
		elements.on('change', function(event) {
			me.submit_upload(event);
		});
	}

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
		var entries = tx.webkitEntries;
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

		// get the target directory (or a promise to get it)
		var dir_inode_id;
		if (me.get_dir_inode_id) {
			dir_inode_id = me.get_dir_inode_id(event);
			if (dir_inode_id === false) {
				return;
			}
		}

		var items = entries || tx.files;
		if (!items) {
			return;
		}
		for (var i = 0; i < items.length; i++) {
			me.submit_item(event, dir_inode_id, me.root_upload, items[i]);
		}
		event.preventDefault();
		return false;
	};

	UploadSrv.prototype.submit_item = function(event, dir_inode_id, parent_upload, item) {
		var me = this;
		console.log('ITEM', item);
		var upload = {
			event: event,
			id: me.id_gen++,
			dir_inode_id: dir_inode_id,
			parent_upload: parent_upload,
			item: item,
			uploads: {}
		};
		parent_upload.uploads[upload.id] = upload;
		me.num_uploads++;
		if (!me.num_active_uploads) {
			// if no other active, start it
			// otherwise the active ones will start 
			me.start_upload(upload);
		} else {
			console.log('ENQUEUE', upload);
			me.queue.push(upload);
		}
	};

	UploadSrv.prototype.start_upload = function(upload) {
		var me = this;
		var item = upload.item;
		var promise;

		upload.row_class = '';
		upload.aborted = false;
		upload.failed = false;
		upload.active = true;
		upload.status = 'Uploading...';
		upload.progress_class = 'progress-bar progress-bar-success';
		me.num_active_uploads++;
		me.$rootScope.safe_apply();

		if (item.isDirectory) {
			// mkdir
			console.log('MKDIR');
			promise = me.$http({
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: upload.dir_inode_id,
					name: item.name,
					isdir: true
				}
			}).then(function(res) {
				upload.inode_id = res.data.id;
				console.log('READDIR');
				return me.readdir(upload);
			});
		} else {
			console.log('OPEN FILE', item);
			promise = me.open_file(upload).then(function() {
				console.log('FILE', upload.file);
			});
		}

		var finish_upload = function() {
			me.num_active_uploads--;
			upload.active = false;
			if (me.queue.length) {
				var u = me.queue.pop();
				console.log('DEQUEUE', u);
				me.start_upload(u);
			}
			me.$rootScope.safe_apply();
		};

		return promise.then(function() {
			console.log('DONE');
			finish_upload();
			upload.status = 'Completed';
			upload.row_class = 'success';
		}, function(err) {
			console.log('FAIL');
			finish_upload();
			upload.failed = true;
			upload.status = 'Failed!';
			upload.row_class = 'danger';
			upload.progress_class = 'progress-bar progress-bar-danger';
			return me.$q.reject(err); // rethrow error
		});
	};

	UploadSrv.prototype.readdir = function(upload) {
		var me = this;
		var deferred = me.$q.defer();
		upload.dir_reader = upload.item.createReader();
		upload.readdir_func = function() {
			upload.dir_reader.readEntries(function(entries) {
				if (entries.length) {
					for (var i = 0; i < entries.length; i++) {
						console.log('SUBMIT ENTRY', entries[i]);
						me.submit_item(upload.event, upload.inode_id, me.root_upload, entries[i]);
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


	UploadSrv.prototype.handle_file = function(event, file, parent) {
		console.log('FILE', file, parent);
		if (parent) {
			file.relative_path = parent.fullPath;
		} else {
			file.relative_path = file.webkitRelativePath;
		}
		if (this.on_file_upload) {
			this.on_file_upload(event, file);
		} else {
			this.add_upload(file);
		}
	};


	UploadSrv.prototype.has_uploads = function() {
		return !!this.num_uploads;
	};

	UploadSrv.prototype.has_active_uploads = function() {
		return !!this.num_active_uploads;
	};

	UploadSrv.prototype.remove_upload = function(upload) {
		if (upload.active) {
			upload.aborted = true;
			if (upload.xhr) {
				upload.xhr.abort();
			}
		} else {
			if (upload.id in this.uploads) {
				delete this.uploads[upload.id];
				this.num_uploads--;
			}
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

	UploadSrv.prototype.add_upload = function(file, parent, existing_inode_id) {
		var me = this;
		var upload;
		var file_request;

		if (existing_inode_id) {
			// inode_id supplied - just pass it on
			console.log('[ok] upload gettattr file:', existing_inode_id, file);
			file_request = {
				method: 'GET',
				url: '/star_api/inode/' + existing_inode_id,
				params: {
					// tell the server to return attr 
					// and not redirect us as in normal read
					getattr: true
				}
			};
		} else {
			// create the file and receive upload location info
			console.log('[ok] upload creating file:', file);
			file_request = {
				method: 'POST',
				url: '/star_api/inode/',
				data: {
					id: parent.id,
					name: file.name,
					isdir: false,
					size: file.size,
					uploading: true,
					content_type: file.type,
					relative_path: file.relative_path
				}
			};
		}

		return me.$http(file_request).then(function(res) {
			console.log('[ok] upload file', res);
			if (res.data.name !== file.name || res.data.size !== file.size) {
				$.nbalert('Choose the same file to resume the upload');
				return me.$q.reject('mismatching file attr'); // rethrow error
			}
			if (file.size === 0) {
				console.log('skip upload for zero size file', file);
				return;
			}
			// create the upload object and connect to uploads list,
			upload = {
				id: me.id_gen++,
				parent: parent,
				inode_id: res.data.id,
				mkfile: res.data,
				file: file,
				progress: 0
			};
			me.uploads[upload.id] = upload;
			me.num_uploads++;
			return me.run_upload(upload);
		}, function(err) {
			console.error('[ERR] upload failed to create/get file', err);
			// TODO: show something to user?
		});
	};

	UploadSrv.prototype.run_upload = function(upload) {
		var me = this;
		// activate upload
		upload.row_class = '';
		upload.aborted = false;
		upload.failed = false;
		upload.active = true;
		upload.status = 'Uploading...';
		upload.progress_class = 'progress-bar progress-bar-success';
		me.num_active_uploads++;
		me.$rootScope.safe_apply();

		return me._upload_multipart(upload).then(function() {
			console.log('[ok] upload done');
			if (upload) {
				me.num_active_uploads--;
				upload.active = false;
				upload.status = 'Completed';
				upload.row_class = 'success';
			}
			me.$rootScope.safe_apply();
		}, function(err) {
			console.error('[ERR] upload failed', err);
			if (upload) {
				me.num_active_uploads--;
				upload.active = false;
				upload.failed = true;
				upload.status = 'Failed!';
				// upload.progress = 100;
				upload.row_class = 'danger';
				upload.progress_class = 'progress-bar progress-bar-danger';
			}
			me.$rootScope.safe_apply();
			return me.$q.reject(err); // rethrow error
		});
	};


	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('[ok] upload multipart run', upload.file.name);
		if (upload.aborted) {
			return me.$q.reject('aborted');
		}
		// get missing parts
		return me.$http({
			method: 'POST',
			url: '/star_api/inode/' + upload.inode_id + '/multipart/'
		}).then(function(res) {
			upload.multipart = res.data;
			console.log('[ok] upload multipart state', upload.multipart);
			if (upload.aborted) {
				return me.$q.reject('aborted');
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
				'	<tr ng-repeat="(idx,upload) in srv.root_upload.uploads" ng-class="upload.row_class">',
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

})();
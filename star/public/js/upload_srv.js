/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbUploadSrv', [
		'$http', '$q', '$rootScope',
		function($http, $q, $rootScope) {
			var u = new UploadSrv($http, $rootScope);
			u.$http = $http;
			u.$q = $q;
			u.$rootScope = $rootScope;
			return u;
		}
	]);

	function UploadSrv() {
		this.id_gen = 0;
		this.num_uploads = 0;
		this.num_active_uploads = 0;
		this.uploads = {};

		// minimum part size by s3 is 5MB
		// we pick the next power of 2.
		this.multipart_size_threshold = 8 * 1024 * 1024;

		// check for active uploads before page unloads
		var me = this;
		$(window).on('beforeunload', function() {
			if (me.num_active_uploads) {
				return 'Leaving this page will interrupt your active Uploads !!!';
			}
		});

		/*
		// TODO handle limited concurrency
		// TODO continue with folder drop
		this.pending_uploads = []; 
		var prevent_event = function(event) {
			return false;
		};
		document.documentElement.ondragover = prevent_event;
		document.documentElement.ondragend = prevent_event;
		document.documentElement.ondrop = function(event) {
			event.preventDefault();
			var length = event.dataTransfer.items.length;
			for (var i = 0; i < length; i++) {
				var entry = event.dataTransfer.items[i].webkitGetAsEntry();
				if (entry.isFile) {
					entry.file(function(file) {
						me.on_new_upload(file);
					});
					console.log('FILE', entry);
					// do whatever you want
				} else if (entry.isDirectory) {
					console.log('DIR', entry);
					// do whatever you want
				}
			}
			return false;
		};
		*/
	}

	// OVERRIDE ME
	UploadSrv.prototype.on_new_upload = function(file) {
		return this.add_upload(file);
	};

	UploadSrv.prototype.has_uploads = function() {
		return !!this.num_uploads;
	};

	UploadSrv.prototype.has_active_uploads = function() {
		return !!this.num_active_uploads;
	};

	UploadSrv.prototype.update_progress = function(event, data) {
		var upload = this.uploads[data.upload_id];
		upload.progress = ((data.loaded / data.total) * 100).toFixed(1);
		this.$rootScope.safe_apply();
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

	UploadSrv.prototype.add_upload = function(data, parent, existing_inode_id) {
		var me = this;
		var file = data.files[0];
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
					relative_path: file.webkitRelativePath
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
				data: data,
				file: file,
				progress: 0
			};
			// link the upload object on the data to propagate progress
			data.upload_id = upload.id;
			me.uploads[upload.id] = upload;
			me.num_uploads++;
			return me.start_upload(upload);
		}, function(err) {
			console.error('[ERR] upload failed to create/get file', err);
			// TODO: show something to user?
		});
	};

	UploadSrv.prototype.start_upload = function(upload) {
		var me = this;
		// activate upload
		upload.row_class = '';
		upload.aborted = false;
		upload.failed = false;
		upload.active = true;
		upload.status = 'Uploading...';
		upload.progress_class = 'progress-bar progress-bar-success';
		me.num_active_uploads++;

		var promise;
		// TODO: remove override of multipart
		if (true || upload.file.size > me.multipart_size_threshold) {
			promise = me._upload_multipart(upload);
		} else {
			promise = me._upload_simple(upload);
		}
		me.$rootScope.safe_apply();
		return promise.then(function() {
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

	// using s3 upload with signed post form
	UploadSrv.prototype._upload_simple = function(upload) {
		console.log('[ok] upload sending file');
		var me = this;
		upload.data.type = 'POST';
		upload.data.multipart = true;
		upload.data.url = upload.mkfile.s3_post_info.url;
		upload.data.formData = upload.mkfile.s3_post_info.form;
		var deferred = me.$q.defer();
		upload.xhr = upload.data.submit();
		upload.xhr.success(function(result, textStatus, jqXHR) {
			// must call deferred inside apply for angular to digest it
			me.$rootScope.safe_apply(function() {
				deferred.resolve();
			});
		});
		upload.xhr.error(function(jqXHR, textStatus, errorThrown) {
			me.$rootScope.safe_apply(function() {
				deferred.reject(
					'XHR upload failed: ' + textStatus + ' ' +
					errorThrown + ' ' + jqXHR.responseText);
			});
		});

		return deferred.promise.then(function() {
			console.log('[ok] upload finishing...');
			upload.status = 'Finishing...';
			// update the file state to uploading=false
			me.$rootScope.safe_apply();
			return me.$http({
				method: 'PUT',
				url: '/star_api/inode/' + upload.inode_id,
				data: {
					uploading: false
				}
			});
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
				'	<tr ng-repeat="(idx,upload) in srv.uploads" ng-class="upload.row_class">',
				'		<td>',
				'			{{upload.file.webkitRelativePath || upload.file.name}}',
				'		</td>',
				'		<td>',
				'			{{upload.parent.name}}',
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
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

		// check for active uploads before page unloads
		var me = this;
		$(window).on('beforeunload', function() {
			if (me.num_active_uploads) {
				return 'Leaving this page will interrupt your active Uploads !!!';
			}
		});
	}

	UploadSrv.prototype.add_upload = function(data, parent) {
		var me = this;
		// create the upload object and connect to uploads list,
		var file = data.files[0];
		var upload = {
			id: me.id_gen++,
			parent: parent,
			data: data,
			file: file,
			active: true,
			progress: 0,
			status: 'Creating...',
			progress_class: 'progress-bar progress-bar-success',
		};
		// link the upload object on the data to propagate progress
		data.upload_id = upload.id;
		me.uploads[upload.id] = upload;
		me.num_uploads++;
		me.num_active_uploads++;
		me.$rootScope.safe_apply();

		// create the file and receive upload location info
		console.log('[ok] upload creating file:', file);

		return me.$http({
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

		}).then(function(res) {
			console.log('[ok] upload file created', res);
			upload.mkfile = res.data;
			upload.inode_id = res.data.id;
			upload.status = 'Uploading...';
			var promise;
			if (file.size > 0) { // TODO: bigger threshold? or non at all
				promise = me._upload_multipart(upload);
			} else {
				promise = me._upload_simple(upload);
			}
			me.$rootScope.safe_apply();
			return promise;

		}).then(function() {
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

		}).then(function() {
			console.log('[ok] upload done');
			me.num_active_uploads--;
			upload.active = false;
			upload.status = 'Completed';
			upload.row_class = 'success';
			me.$rootScope.safe_apply();
		}, function(err) {
			console.error('[ERR] upload failed');
			me.num_active_uploads--;
			upload.active = false;
			upload.status = 'Failed!';
			upload.progress = 100;
			upload.row_class = 'danger';
			upload.progress_class = 'progress-bar progress-bar-danger';
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
		return deferred.promise;
	};

	UploadSrv.prototype._upload_multipart = function(upload) {
		var me = this;
		console.log('[ok] upload multipart starting');
		// create multipart upload
		return me.$http({
			method: 'POST',
			url: '/star_api/inode/' + upload.inode_id + '/multipart/'
		}).then(function(res) {
			console.log('[ok] upload create multipart...', res);
			upload.multipart = res.data;
			return me._run_multipart(upload);
		}).then(function() {
			// on success complete multipart
			console.log('[ok] upload multipart complete');
			return me.$http({
				method: 'PUT',
				url: '/star_api/inode/' + upload.inode_id + '/multipart/'
			});
		}, function(err) {
			// on error abort multipart
			console.log('[ERR] upload multipart abort');
			return me.$http({
				method: 'DELETE',
				url: '/star_api/inode/' + upload.inode_id + '/multipart/'
			}).then(function() {
				return me.$q.reject(err); // rethrow error
			});
		});
	};

	UploadSrv.prototype._run_multipart = function(upload) {
		var me = this;
		console.log('[ok] upload multipart run', upload.multipart.next_part);
		if (upload.aborted) {
			return me.$q.reject('aborted');
		}
		if ((upload.multipart.next_part - 1) * upload.multipart.part_size >= upload.file.size) {
			return; // done
		}
		// get the part url
		return me.$http({
			method: 'GET',
			url: '/star_api/inode/' + upload.inode_id + '/multipart/' + upload.multipart.next_part
		}).then(function(res) {
			// send the part
			var start = (upload.multipart.next_part - 1) * upload.multipart.part_size;
			var stop = start + upload.multipart.part_size;
			var blob = upload.file.slice(start, stop);
			console.log('[ok] upload multipart send start', start, stop);
			return me._send_part(upload, blob, res.data.url);
		}).then(function(etag) {
			// put the part etag
			return me.$http({
				method: 'PUT',
				url: '/star_api/inode/' + upload.inode_id + '/multipart/' + upload.multipart.next_part,
				data: {
					etag: etag
				}
			});
		}).then(function() {
			// advance to next part
			console.log('[ok] upload multipart advance...');
			upload.multipart.next_part++;
			upload.xhr = null;
			return me._run_multipart(upload);
		});
	};

	UploadSrv.prototype._send_part = function(upload, data, url) {
		var me = this;
		var deferred = me.$q.defer();
		var xhr = upload.xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			me.$rootScope.safe_apply(function() {
				console.log('[ok] upload multipart xhr', xhr);
				if (xhr.readyState !== 4) {
					return;
				}
				if (xhr.status !== 200) {
					deferred.reject('xhr failed status ' + xhr.status);
					return;
				}
				try {
					var etag = xhr.getResponseHeader('ETag');
					deferred.resolve(etag);
				} catch (err) {
					deferred.reject(err);
				}
			});
		};
		xhr.upload.onprogress = function(event) {
			var loaded = (upload.multipart.next_part - 1) * upload.multipart.part_size + event.loaded;
			upload.progress = ((loaded / upload.file.size) * 100).toFixed(1);
			me.$rootScope.safe_apply();
		};
		xhr.open('PUT', url, true);
		xhr.setRequestHeader('Access-Control-Expose-Headers', 'ETag');
		xhr.send(data);
		return deferred.promise;
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
				'Are you sure you want to cancel it?', do_remove);
		}
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
				'				ng-click="srv.cancel_upload(upload)">x</button>',
				'		</td>',
				'	</tr>',
				'</table>'
			].join('\n')
		};
	});

})();
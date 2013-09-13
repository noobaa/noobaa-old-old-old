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
			console.log('[ok] upload sending...', res);
			var mkfile_data = res.data;
			upload.inode_id = mkfile_data.id;
			upload.status = 'Uploading...';
			// using s3 upload with signed url
			data.type = 'POST';
			data.multipart = true;
			data.url = mkfile_data.s3_post_info.url;
			data.formData = mkfile_data.s3_post_info.form;
			var deferred = me.$q.defer();
			upload.xhr = data.submit();
			upload.xhr.success(function(result, textStatus, jqXHR) {
				// must call deferred inside apply for angular to digest it
				me.$rootScope.safe_apply(function() {
					deferred.resolve(mkfile_data);
				});
			});
			upload.xhr.error(function(jqXHR, textStatus, errorThrown) {
				me.$rootScope.safe_apply(function() {
					deferred.reject(
						'XHR upload failed: ' + textStatus + ' ' +
						errorThrown + ' ' + jqXHR.responseText);
				});
			});
			me.$rootScope.safe_apply();
			return deferred.promise;

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
			console.error('[ERR]', err);
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

	UploadSrv.prototype.has_uploads = function() {
		return !!this.num_uploads;
	};

	UploadSrv.prototype.has_active_uploads = function() {
		return !!this.num_active_uploads;
	};

	UploadSrv.prototype.update_progress = function(event, data) {
		var upload = this.uploads[data.upload_id];
		upload.progress = parseInt(data.loaded / data.total * 100, 10);
		this.$rootScope.safe_apply();
	};

	UploadSrv.prototype.cancel_upload = function(upload) {
		var me = this;
		var do_cancel = function() {
			if (upload.active) {
				if (upload.xhr) {
					upload.xhr.abort();
				}
			} else {
				delete me.uploads[upload.id];
			}
			me.$rootScope.safe_apply();
		};
		if (!upload.active) {
			do_cancel();
		} else {
			$.nbconfirm('This upload is still working.<br/>' +
				'Are you sure you want to cancel it?', do_cancel);
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
		}
	});

})();